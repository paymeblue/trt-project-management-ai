---
phase: quick-260714-iuj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/workflow-graph.ts
  - actions/workflow-graph.ts
  - tests/lib/workflow-approval-eligibility.test.ts
  - app/(app)/workflow/step/page.tsx
  - app/_components/workflow-kinds/approval-step.tsx
  - app/_components/notifications-bell.tsx
  - lib/my-work.ts
autonomous: true
requirements: [WF-03]

must_haves:
  truths:
    - "On an approval step, the person who holds the RECEIVE gate (e.g. the CPO) never sees a 'send' button — they see 'you are the receiving party'; the deadlock (receiver recorded as sender) is impossible by construction."
    - "The design drawing being approved renders in the approval pane for BOTH parties (data:image/ → <img>, otherwise filename text), resolved from internal_approval → confirmation_correction → design_stage."
    - "Phase is labelled in plain language: '1/2 — Operations: approve design & send to Factory' before send, '2/2 — <Receiver title>: approve for production' after send."
    - "The receiver's single 'Approve & send to Factory' click BOTH records the receive AND completes the step (project advances), with completedBy = the receiver."
    - "The receiver can 'Reject design', which returns the step to phase 1/2 and notifies the original sender to revise and resend."
    - "The bare 'Complete step' / 'Send for approval' / 'Receive / approve' buttons no longer appear on approval-kind steps."
    - "On send, the receiver-title holder(s) are notified; if no user holds that title, a visible warning is shown instead of failing silently."
    - "A 'sent' approval counts as pending work only for a receiver-eligible viewer (not the ops admin who already sent it)."
  artifacts:
    - path: "lib/workflow-graph.ts"
      provides: "pure eligibility + drawing-fallback helpers, getApprovalState/getApprovalDrawing readers, rejectApproval engine fn, receiver-holder lookup"
      contains: "rejectApproval"
    - path: "actions/workflow-graph.ts"
      provides: "approveAndCompleteApprovalAction, rejectApprovalAction, send-time receiver notification"
      contains: "approveAndCompleteApprovalAction"
    - path: "app/_components/workflow-kinds/approval-step.tsx"
      provides: "phase-aware two-party approval UI with drawing pane"
      contains: "Approve design"
    - path: "tests/lib/workflow-approval-eligibility.test.ts"
      provides: "deadlock-guard + drawing-fallback unit tests"
      contains: "approvalSenderEligible"
  key_links:
    - from: "app/(app)/workflow/step/page.tsx"
      to: "lib/workflow-graph.ts (getApprovalState/getApprovalDrawing/eligibility)"
      via: "server-resolved props passed to ApprovalStep"
      pattern: "getApprovalDrawing|approvalReceiverEligible"
    - from: "app/_components/workflow-kinds/approval-step.tsx"
      to: "actions/workflow-graph.ts (approveAndCompleteApprovalAction/rejectApprovalAction/sendApprovalAction)"
      via: "server actions from client buttons"
      pattern: "approveAndCompleteApprovalAction|rejectApprovalAction"
    - from: "lib/my-work.ts"
      to: "lib/workflow-graph.ts (getApprovalState)"
      via: "per-project sent-state lookup in the pending filter"
      pattern: "getApprovalState"
---

<objective>
Rework the `approval`-kind workflow step (currently three bare buttons on
`send_for_production`: "Send for approval" / "Receive / approve" / "Complete
step") into a phase-aware, plain-language, two-party flow that is safe by
construction.

The live incident this fixes: on `send_for_production` (role=operations,
receiverRequiredPosition=chief_production_officer) the CPO himself clicked "Send
for approval", recording the RECEIVER as the SENDER. The two-party engine rule
(sender !== receiver) then blocked him from receiving his own submission, and
nobody else holds the CPO title → the step deadlocked. The engine rule is
correct and stays; the UI must make recording-yourself-as-sender impossible.

Purpose: the product owner must understand each screen ("Approve design for
project and send to Factory or reject design"), both parties must SEE the
drawing being approved, and the receiver's approval must COMPLETE the step.
Output: reworked approval UI + server resolution + two new server actions + one
new engine function + a `my-work` visibility fix.

Scope guard: do NOT touch position constants/pickers, `db/schema.ts`
`positionEnum`, the workflow configurator, or the audit page (a concurrent
positions-rename plan owns those). Read `POSITION_LABELS` for display only. The
two-party engine rule and `authorizeStep`'s contract stay unchanged — every new
mutation routes through `authorizeStep` + existing engine functions, never raw
SQL bypassing them.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Re-read these fresh — do NOT trust any line numbers baked into this plan.
@lib/workflow-graph.ts
@actions/workflow-graph.ts
@app/(app)/workflow/step/page.tsx
@app/_components/workflow-kinds/approval-step.tsx
@lib/my-work.ts
@lib/notifications.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from the codebase; verify on re-read. -->

Engine (lib/workflow-graph.ts):
- sendApproval({ projectId, stepDefId, actorId }): sets workflow_step_states.status='sent', sentBy=actor. Upsert on (projectId, stepDefId).
- receiveApproval({ projectId, stepDefId, actorId }): requires status==='sent' AND sentBy!==actor (throws 'approval-requires-two-parties'), sets status='complete', receivedBy=actor, appends 'approval' to fulfilledKinds. Does NOT advance the project.
- completeGraphStep({ projectId, stepDefId, actorId, skip? }): writes project_step_completions (completedBy=actorId) + advances currentStep. For approval steps it requires 'approval' ∈ fulfilledKinds (so receiveApproval must run first).
- getStepById(id) / getStepByKey(graph, key) -> GraphStep { id, graph, key, label, role, kind, requiredPosition, receiverRequiredPosition, receiverRole, ... }.

Actions (actions/workflow-graph.ts):
- authorizeStep(stepDefId, projectId, forReceive=false): role + fresh-position + assignee gate. forReceive=true uses receiverRole (role gate) and receiverRequiredPosition ?? requiredPosition (position gate). Returns { ok:true, userId } | { ok:false, message }.
- ENGINE_ERROR_MESSAGES map + engineErrorMessage(err). revalidateBoards().

Data (db/schema.ts workflow_step_states): status 'pending'|'sent'|'complete', sentBy, receivedBy, uploadData (base64 data URL), uploadName, fulfilledKinds text[]. Unique (project_id, step_def_id).

Drawing fallback chain (by step key, same project, live graph, first with non-null uploadData):
  internal_approval (step 10) -> confirmation_correction (step 9) -> design_stage (step 7). All are yes_no_upload steps storing uploadData/uploadName in workflow_step_states.

Helpers (lib/workflow.ts, pure — import, do not edit this file):
- canRoleActOnStep(stepRole, userRole): boolean
- userRoleLabel(role: string): string
- POSITION_LABELS: Record<string,string> (humanize; fall back to the raw value)

XSS rule (mirror lib/project-audit.ts:120 + audit UploadCell): render <img> ONLY when uploadData.startsWith('data:image/'); any other upload shows filename text only, never a clickable data: link.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Server engine + actions — deadlock-safe two-party approval</name>
  <files>lib/workflow-graph.ts, actions/workflow-graph.ts, tests/lib/workflow-approval-eligibility.test.ts</files>
  <behavior>
    Pure helpers (deadlock guard is the whole point — test first):
    - approvalReceiverEligible(step, role, position): true iff canRoleActOnStep(step.receiverRole ?? step.role, role) AND position === (step.receiverRequiredPosition ?? step.requiredPosition).
    - approvalSenderEligible(step, role, position): true iff canRoleActOnStep(step.role, role) AND (step.requiredPosition ? position === step.requiredPosition : true) AND position !== (step.receiverRequiredPosition ?? step.requiredPosition).  ← the deadlock guard: a receive-gate holder is NEVER sender-eligible.
    - pickApprovalDrawing(rows): given rows [{ stepKey, uploadData, uploadName }], returns the first row with non-null uploadData in priority order internal_approval > confirmation_correction > design_stage, else null.
    Test cases (send_for_production shape: role='operations', requiredPosition=null, receiverRequiredPosition='chief_production_officer', receiverRole=null):
    - CPO viewer (role super_admin/operations, position 'chief_production_officer'): senderEligible=false, receiverEligible=true.
    - Ops admin viewer (role operations, position 'Operations manager admin'): senderEligible=true, receiverEligible=false.
    - pickApprovalDrawing: prefers internal_approval; falls back to confirmation_correction then design_stage; returns null when all uploadData are null.
  </behavior>
  <action>
In lib/workflow-graph.ts add (keep server-only; import canRoleActOnStep from '@/lib/workflow'):
- const APPROVAL_DRAWING_FALLBACK_KEYS = ['internal_approval','confirmation_correction','design_stage'] and the pure helpers above (approvalReceiverEligible/approvalSenderEligible/pickApprovalDrawing), each exported, taking a minimal step shape { role, requiredPosition, receiverRequiredPosition, receiverRole }.
- getApprovalState(projectId, stepDefId): reads workflow_step_states for that pair; returns { status, sentBy, sentByName } (join users for sentBy name, or null).
- getApprovalDrawing(projectId, graph='live'): selects stepKey+uploadData+uploadName from workflow_step_states joined to workflow_step_definitions on step_def_id, filtered to that project + graph + the 3 fallback keys, then returns pickApprovalDrawing(rows) as { uploadData, uploadName } | null.
- getApprovalReceiverHolders(step): returns users whose position === (receiverRequiredPosition ?? requiredPosition) AND canRoleActOnStep(receiverRole ?? role, user.role) — the notify + count source. Return [{ id }].
- rejectApproval({ projectId, stepDefId, actorId }): read the state; if status !== 'sent' throw new Error('approval-not-sent'); capture sentBy; update the row to status='pending', sentBy=null, updatedAt=now (keep the row; fulfilledKinds is untouched since 'approval' is only appended at receive). Return { sentBy }. Route ONLY through db updates on workflow_step_states — never delete the definition or touch edges.

In actions/workflow-graph.ts:
- sendApprovalAction: after the existing sendApproval succeeds, resolve the step (getStepById), call getApprovalReceiverHolders(step) and notifyUser each holder { type: 'approval_request', title: `Design ready to approve for production: ${projectName}`, projectId, actorId: auth.userId }. Fetch projectName like assignUser does. Never self-notify (notifyUser already guards recipientId===actorId). Leave the "no holder" WARNING to the UI (Task 2) — do not throw when the holder list is empty.
- approveAndCompleteApprovalAction({ projectId, stepDefId }): auth = authorizeStep(stepDefId, projectId, /*forReceive*/ true); if !auth.ok return auth. In a try, call receiveApproval({...actorId: auth.userId}) THEN completeGraphStep({...actorId: auth.userId}) — chained server-side so completedBy = the receiver (ask #4). Map errors via engineErrorMessage. revalidateBoards(); return { ok: true }.
- rejectApprovalAction({ projectId, stepDefId }): auth = authorizeStep(stepDefId, projectId, true) (reject is authorized EXACTLY like receive — only a receiver-eligible user may reject); if !auth.ok return auth. Call rejectApproval; then notifyUser({ recipientId: result.sentBy, actorId: auth.userId, type: 'approval_rejected', title: `Design rejected — please revise and resend`, body: `Rejected by the reviewer on this project.`, projectId }). revalidateBoards(); return { ok: true }.
- Add 'approval-not-sent' is already in ENGINE_ERROR_MESSAGES; no new key needed unless a new throw string is introduced.

Do NOT change authorizeStep, sendApproval, receiveApproval, or completeGraphStep signatures/behavior. Do NOT remove the existing sendApprovalAction/receiveApprovalAction exports (still referenced until Task 2 rewires the client).

Write tests/lib/workflow-approval-eligibility.test.ts following tests/lib/workflow-graph-assignee-gate.test.ts's pattern: vi.mock('server-only', () => ({})) and vi.mock('@/db', () => ({ db: {} })) so the module imports, then assert the pure helpers against the Behavior cases above.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/lib/workflow-approval-eligibility.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>New pure helpers + readers + rejectApproval exist and are exported; the two new actions chain through authorizeStep + existing engine fns; the deadlock-guard and drawing-fallback unit tests pass; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Phase-aware approval UI — server resolves, client renders both parties + drawing</name>
  <files>app/(app)/workflow/step/page.tsx, app/_components/workflow-kinds/approval-step.tsx, app/_components/notifications-bell.tsx</files>
  <action>
In app/(app)/workflow/step/page.tsx, in the `case 'approval':` branch of renderKind (re-read the file for exact structure): fetch the caller's fresh position (mirror the requiredPosition block that already selects users.position) and resolve, for the approval step:
- state = getApprovalState(projectId, step.id)  → phase = state?.status === 'sent' ? 'sent' : 'send'
- drawing = getApprovalDrawing(projectId, graph)
- senderEligible = approvalSenderEligible(step, role, callerPosition)
- receiverEligible = approvalReceiverEligible(step, role, callerPosition)
- receiverHolderCount = (await getApprovalReceiverHolders(step)).length
- senderRoleLabel = userRoleLabel(step.role); receiverPositionLabel = POSITION_LABELS[step.receiverRequiredPosition ?? step.requiredPosition ?? ''] ?? (step.receiverRequiredPosition ?? step.requiredPosition ?? 'the receiver')
- senderName = state?.sentByName ?? null
Pass all of these plus projectId, stepDefId=step.id, redirectTo=dashboard as props to <ApprovalStep/>. (Keep the outer <h1>{step.label}</h1> the wrapper already renders.)

Rewrite app/_components/workflow-kinds/approval-step.tsx as a phase-aware two-party UI. Props: { projectId, stepDefId, redirectTo?, phase: 'send'|'sent', senderEligible, receiverEligible, drawing: { uploadData, uploadName } | null, senderName, senderRoleLabel, receiverPositionLabel, receiverHolderCount }.
- Drawing pane (shown to BOTH parties, all phases): if drawing?.uploadData?.startsWith('data:image/') render an <img> (eslint-disable-next-line @next/next/no-img-element, like the audit page); else if drawing?.uploadName render the filename as text; else a muted "No drawing found on the design steps." Never render a data: link for non-images.
- No-holder warning helper: when receiverHolderCount === 0, render an amber warning: `No user currently holds the ${receiverPositionLabel} title — they won't be notified.`
- phase 'send':
  * heading: `1/2 — ${senderRoleLabel}: approve design & send to Factory`
  * if senderEligible: drawing pane + ONE primary button "Approve design & send to Factory" → sendApprovalAction({projectId, stepDefId}); on ok show success + scheduleRedirect (reuse the existing REDIRECT_DELAY_MS/useTransition/message pattern); also render the no-holder warning inline.
  * else if receiverEligible (deadlock guard surface): drawing pane + info line "You are the receiving party — Operations sends this to you first." (NO send button).
  * else: drawing pane + muted "Waiting for Operations to approve and send."
- phase 'sent':
  * if receiverEligible: heading `2/2 — ${receiverPositionLabel}: approve for production` + drawing pane + TWO buttons: primary "Approve & send to Factory" → approveAndCompleteApprovalAction (on ok: "✓ Approved. Redirecting…" + scheduleRedirect), and secondary/danger "Reject design" → rejectApprovalAction (on ok: message "Design sent back for revision." then router.refresh() so the pane re-renders at phase 1/2; do NOT redirect).
  * else: drawing pane + waiting banner `Sent — waiting on ${receiverPositionLabel} (2/2)`${senderName ? ` · sent by ${senderName}` : ''} + the no-holder warning when applicable.
Remove the old three-button block, and the `receive()`/`complete()`/generic `send()` handlers and their imports of receiveApprovalAction/completeStepAction. Keep the green/red message + auto-redirect UX from the current file.

In app/_components/notifications-bell.tsx (re-read the markOne routing block): the current rule routes any project-bearing notification whose type !== 'assignment' to /disputes/{projectId}. Extend the exclusion so 'approval_request' and 'approval_rejected' are ALSO not routed to /disputes (they just mark-read + refresh, exactly like 'assignment') — /disputes is super-admin-only and wrong for these. Prefer a small allowlist/denylist constant over stacking !== checks.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && grep -c "Send for approval\|Receive / approve\|Complete step" app/_components/workflow-kinds/approval-step.tsx</automated>
  </verify>
  <done>The approval pane shows the drawing to both parties, uses 1/2 and 2/2 plain-language headings, the receive-gate holder never sees a send button, the receiver's single approve click completes the step, reject returns to 1/2, and the grep prints 0 (the three legacy button labels are gone). tsc + lint clean.</done>
</task>

<task type="auto">
  <name>Task 3: my-work pending filter — a 'sent' approval nags the receiver, not the sender</name>
  <files>lib/my-work.ts</files>
  <action>
In lib/my-work.ts getMyWork (re-read the file): the pending filter already excludes position-mismatched steps and assignee-gated steps. Extend it so that for a project whose CURRENT step is an approval-kind step in status 'sent', it counts as pending ONLY for a receiver-eligible caller who is NOT the original sender.

Reuse the existing bounded per-project pattern (the gateByProjectId loop): add a second small map, e.g. approvalStateByProjectId, populated in the SAME loop only for active projects whose current step's kind === 'approval' (call getApprovalState('live', projectId, step.stepDefId) once per such project — same 1-query-per-relevant-project shape as the assignee gate, not N queries across all projects). getLiveWorkflowSteps() already carries kind + stepDefId + requiredPosition/receiverRequiredPosition, so no extra step lookup is needed.

In the pending .filter: when step.kind === 'approval' and its state?.status === 'sent':
  - include iff approvalReceiverEligible-style check passes — callerPosition === (step.receiverRequiredPosition ?? step.requiredPosition) AND callerPosition !== null AND state.sentBy !== userId. Otherwise return false.
Leave the not-yet-sent (pending/none) approval case to the existing position gate (the ops sender still sees it because callerPosition matches the sender side, and the receiver is not nagged pre-send because they match receiverRequiredPosition — keep current behavior; only the 'sent' transition changes who is nagged). Do not add a new DB round trip for non-approval steps.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm test</automated>
  </verify>
  <done>getMyWork excludes a 'sent' approval from the sender's pending list and includes it for a receiver-eligible non-sender, via one bounded query per approval-at-current-step project; tsc + full test suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client button → server action | Any authenticated user can POST any action payload; the client's phase/eligibility props are advisory only. |
| stored uploadData → rendered pane | Base64 data URL authored by an earlier uploader is rendered in another user's browser. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iuj-01 | Elevation / Spoofing | approveAndCompleteApprovalAction, rejectApprovalAction | mitigate | Both call authorizeStep(..., forReceive=true) first — role + receiverRequiredPosition + assignee gate enforced server-side; the client's `receiverEligible` prop is never trusted. |
| T-iuj-02 | Elevation (self-approval / deadlock) | receiveApproval chain | mitigate | receiveApproval throws 'approval-requires-two-parties' when sentBy===actor; the send button is additionally hidden from receive-gate holders (approvalSenderEligible), so a receiver can never be recorded as sender. |
| T-iuj-03 | Tampering (XSS) | drawing pane in approval-step.tsx | mitigate | <img> rendered ONLY when uploadData.startsWith('data:image/') (mirrors audit page); non-image uploads show filename text, never a clickable data: link. |
| T-iuj-04 | Repudiation | completeGraphStep completedBy | mitigate | completedBy = auth.userId of the receiver (chained server-side), recorded in project_step_completions — the approver is durably attributed. |
| T-iuj-05 | Denial of Service (deadlock resurrection) | rejectApproval | accept | Reject resets status to 'pending' and clears sentBy; a fresh sender-eligible user can re-send. If no sender-eligible user exists that is a data/config issue surfaced by the no-holder warning, not exploitable. |
| T-iuj-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages introduced by this plan; nothing to audit. |
</threat_model>

<verification>
Run all four, all must pass:
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`

Recommended manual two-party smoke (not blocking, but proves the incident is fixed): with `send_for_production` as a project's current step, sign in as an Operations admin (position "Operations manager admin") → see "1/2", the drawing, and one "Approve design & send to Factory" button (no receive/complete). Sign in as the CPO (position chief_production_officer) BEFORE send → confirm NO send button, only "you are the receiving party". After send, as CPO → see "2/2", the drawing, "Approve & send to Factory" (advances the project, completedBy = CPO) and "Reject design" (returns to 1/2 and notifies the sender). Confirm the ops admin, post-send, sees the waiting banner and is no longer nagged in the header/forcing modal; the CPO is.
</verification>

<success_criteria>
- Approval-kind steps render a phase-aware pane (1/2 send, 2/2 receive) with the drawing visible to both parties.
- A receive-gate holder can never be recorded as the sender (deadlock impossible).
- The receiver's single approve click completes the step with completedBy = receiver; reject returns to phase 1/2 and notifies the sender.
- The three legacy buttons are gone from approval steps; other kinds are untouched.
- A 'sent' approval nags only the receiver, not the sender.
- tsc, lint, test, build all pass.
</success_criteria>

<output>
Create `.planning/quick/260714-iuj-rework-the-approval-kind-step-ui-into-a-/260714-iuj-SUMMARY.md` when done.
</output>
