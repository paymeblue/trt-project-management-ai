---
status: awaiting_human_verify
trigger: "Notifications are not position-scoped. Step 5 (Set Delivery Timeline) notifications reach Head of Projects AND Factory Ops when only Operations Admin should get them. Step 12 (Internal Approval / Upload Approved Drawing) must go ONLY to Operations Admin, never Head of Projects. Step 13 (Send for Production) must go ONLY to Operations Admin, never Factory PM. More generally, ALL super admins currently receive notifications for every step, when they should be scoped to the specific position responsible for that step — this is likely one root-cause fix in the notification dispatch logic (shared by steps 5/12/13), not four separate one-off patches."
created: 2026-07-17
updated: 2026-07-17
---

# Debug Session: notification-position-scoping

## Symptoms

**Expected behavior:** Every workflow step notification should reach ONLY the exact `users.position` responsible for acting on that step (e.g. only Operations Admin for steps 5/12/13), never every user sharing a broader `role` (e.g. every `super_admin`-role user regardless of position), and never a position other than the one actually gated for that step.

**Actual behavior:**
- Step 5 (Set Delivery Timeline, tagged "Operations" in the live graph) notifies both Head of Projects and Factory Ops.
- Step 12 (Internal Approval / Upload Approved Drawing, tagged "Operations") notifies Head of Projects (should be Operations Admin only).
- Step 13 (Send for Production, tagged "Operations") notifies Factory PM (should be Operations Admin only).
- Globally: all `super_admin`-role users receive notifications for every step, not just the one position actually responsible.

**Error messages:** None — this is a targeting/authorization-scope bug, not a crash.

**Timeline:** Ongoing since notifications were introduced (Phase 13, extended in Phase 19/20/22 as positions were layered in); not a known regression from a specific commit.

**Reproduction:** Complete/advance steps 5, 12, or 13 on a live project as the correct actor and observe which users receive an in-app notification (bell/alerts panel) — currently multiple positions/roles receive it instead of exactly Operations Admin.

## Current Focus

reasoning_checkpoint:
  hypothesis: "Steps 5 (set_delivery_timeline), 12 (internal_approval), and 13 (send_for_production, SENDER side) all have `role='operations'` and `required_position` NULL/blank in `workflow_step_definitions` (graph='live'). `canRoleActOnStep()` (lib/workflow.ts:266-270) special-cases `stepRole === Roles.Operations` to `isAdminRole(userRole)` (true for BOTH `operations`- and `super_admin`-role users), with no position narrowing unless `requiredPosition` is truthy. Because these 3 rows never got a `requiredPosition` seeded, every gate that depends on it (page-level access gate app/(app)/workflow/step/page.tsx:85, server-action authorization actions/workflow-graph.ts:86-92 authorizeStep, and visibility lib/my-work.ts:120-139) falls through to 'no restriction', exposing the step to every operations/super_admin-role user (Head of Operations, Head of Projects, Chief Production Officer, any generic super_admin) instead of exclusively the Operations Admin (`operations_manager_admin`) position holder — matching every symptom in the trigger with ONE shared underlying data defect."
  confirming_evidence:
    - "Live DB query (graph='live'): set_delivery_timeline, internal_approval, and send_for_production ALL have required_position = '' (blank/null); send_for_production's receiver_required_position is correctly 'chief_production_officer' but its SENDER-side required_position is blank."
    - "db/workflow-live-steps.ts:85,106,155 comments confirm this was DELIBERATE under a now-superseded design decision (D-01, quick task 260713-rb2/260714-qe4): 'requiredPosition=null (role=operations only)' — i.e. any operations-or-super_admin role user was intentionally allowed, to avoid blocking a super_admin whose title isn't the exact slug."
    - "REQUIREMENTS.md:281 (STG-11) explicitly names the intended sender for send_for_production as '(Operations Admin)' — i.e. the current spec supersedes D-01's looser role-only gate for these ops-approval-chain steps specifically."
    - "positions table has exactly one matching position: slug='operations_manager_admin', label='Operations manager admin' — this is 'Operations Admin'. Distinct super_admin/operations users hold head_of_operations, head_of_projects, chief_production_officer, and operations_manager_admin as their `users.position` — confirming multiple non-target positions currently pass the coarse role-only gate."
    - "Exhaustive grep confirms only 2 notify-insert call sites exist codebase-wide (notifyAllSuperAdmins, notifyUser); neither is called from setInvoiceTimelineAction (step 5) or submitYesNoUploadAction (step 12) at all. notifyAllSuperAdmins' blanket broadcast is REQ-G06/REQ-G08 spec'd behavior (pause/flag/bypass/issue-log escalation to ALL super admins by design) and is not reachable from steps 5/12/13's normal completion flow — hypothesis (1) from the prior investigation round is ELIMINATED as the cause of this symptom."
  falsification_test: "If required_position were already correctly set to 'operations_manager_admin' on these 3 rows (live graph), then authorizeStep/page-gate/my-work would already reject/hide the step for head_of_operations, head_of_projects, and chief_production_officer position holders — but the live query shows the field is blank, which is what actually lets them through. Setting required_position and re-querying/re-testing access as those users must flip them from allowed to denied."
  fix_rationale: "Root cause is missing DATA (a NULL requiredPosition), not broken gating code — the position-exact gate is already correctly implemented in 3 separate consumers (page gate, authorizeStep, getApprovalReceiverHolders/my-work) and works correctly wherever requiredPosition IS set (e.g. project_review_authorisation, chief_production_officer). The minimal, root-cause-targeted fix is to SEED required_position='operations_manager_admin' on graph='live' rows set_delivery_timeline, internal_approval, and send_for_production (sender side only — receiverRequiredPosition on send_for_production is already correct and untouched). No code change needed; existing gates will immediately start enforcing correctly once the data is present."
  blind_spots: "(1) This reverses a previously deliberate design decision (D-01) for exactly these 3 steps — not verified with the user/product owner beyond the debug trigger's explicit wording, though REQUIREMENTS.md STG-11 corroborates 'Operations Admin' for step 13. (2) Did not change other operations-role steps with the same null-requiredPosition pattern (invoice_upload step 4, project_review_authorisation's already-correct row is fine, approval_installation step 19) since the trigger only names steps 5/12/13 — if the user intends the SAME fix repo-wide, that's a separate, broader change not made here. (3) Have not yet confirmed there are still ACTIVE in-flight projects currently sitting exactly on steps 5/12/13 whose current actor (e.g. a Head of Operations mid-action) would be locked out immediately by this change — will check before applying."

hypothesis: Two distinct root causes, likely both real:
  (1) `notifyAllSuperAdmins()` in lib/notifications.ts:21 fans out to literally every user with `role === Roles.SuperAdmin` (`eq(users.role, Roles.SuperAdmin)`, no position filter at all) — called from actions/projects.ts:288 (pause/flag, REQ-G08), actions/issues.ts:58 (issue log), and actions/bypass.ts:68 (bypass/escalation). ANY of these three flows being reachable from steps 5/12/13's UI (e.g. a "flag" or "bypass" action available on those steps) would explain multiple positions all getting notified, since it ignores position entirely.
  (2) For genuine approval-kind steps, `getApprovalReceiverHolders()` in lib/workflow-graph.ts:614 already does correct position-EXACT filtering (`eq(users.position, positionGate)` where `positionGate = step.receiverRequiredPosition ?? step.requiredPosition`) plus a role gate (`canRoleActOnStep(roleGate, u.role)` where `roleGate = step.receiverRole ?? step.role`). If steps 12/13's DB rows (workflow_step_definitions, graph='live') have `receiverRequiredPosition`/`requiredPosition` seeded incorrectly (null, wrong value, or a position value that Head of Projects/Factory PM/Factory Ops also happen to hold), the existing position-exact filter would still leak to the wrong recipients. This needs live-graph DB inspection (`db/schema.ts` workflowStepDefinitions rows for steps 5/12/13 in the 'live' graph, and the `positions` table / `users.position` values), not just code reading.
test:
  1. Grep steps 5/12/13's UI (whatever renders their action buttons) for calls to `pauseProjectAction`/`bypassAction`/issue-log actions vs. `sendApprovalAction` — confirms whether hypothesis (1) or (2) (or both) is in play for each step.
  2. Query the live `workflow_step_definitions` rows for steps 5, 12, 13 (`graph = 'live'`) to read their actual `role`, `requiredPosition`, `receiverRequiredPosition`, `receiverRole` values, and cross-reference against the `positions` table to see if Head of Projects / Factory Ops / Factory PM share a position value with Operations Admin, or if the position fields are null/misconfigured for these specific steps.
  3. Confirm whether `notifyAllSuperAdmins` has ANY caller reachable from steps 5/12/13's normal (non-escalation) completion flow — if so, that's the direct root cause for those three items and should be replaced with a position-scoped notify (reusing/extending `getApprovalReceiverHolders`-style exact-position lookup) rather than a blanket super-admin broadcast.
expecting: Either steps 5/12/13 are wired through `notifyAllSuperAdmins` directly (needs a new position-scoped notify function, e.g. `notifyByPosition(position, ...)`), or their `workflow_step_definitions` rows have missing/wrong `requiredPosition`/`receiverRequiredPosition` seed values (needs a data fix + guarding against nulls falling back to role-only matching multiple positions).
next_action: DONE — fix applied and self-verified (see Resolution). Awaiting human confirmation in the live app before archiving (status=awaiting_human_verify).

## Evidence

- lib/notifications.ts:21-44 — `notifyAllSuperAdmins()` queries `eq(users.role, Roles.SuperAdmin)` with NO position filter; fans out to every super_admin-role user unconditionally. This is the only unconditional "every X" notify path in the codebase.
- lib/notifications.ts:49-66 — `notifyUser()` is single-recipient, no scoping issue by itself; the caller decides who the one recipient is.
- Full-codebase grep confirms exactly 4 notify-fan-out call sites total: actions/projects.ts:288 (`notifyAllSuperAdmins`, pause/flag), actions/issues.ts:58 (`notifyAllSuperAdmins`, issue log), actions/bypass.ts:68 (`notifyAllSuperAdmins`, bypass/escalation), actions/workflow-graph.ts:168+234 (`notifyUser`, approval send/reject — both already single-recipient / position-aware via getApprovalReceiverHolders upstream), lib/workflow-graph.ts:708 (`notifyUser`, assignment — single recipient, the assignee). No other notify call sites exist in actions/, app/, or lib/.
- lib/workflow-graph.ts:614-625 — `getApprovalReceiverHolders(step)` already implements exact position + role gating correctly in isolation: `positionGate = step.receiverRequiredPosition ?? step.requiredPosition`, filters `eq(users.position, positionGate)`, then further filters by `canRoleActOnStep(roleGate, u.role)`. Returns `[]` if `positionGate` is falsy (would mean NO notification, not a leak) — so if steps 5/12/13 leak to multiple recipients via THIS path, the seeded `requiredPosition`/`receiverRequiredPosition` DB values themselves must be shared/wrong, not the filter logic.
- app/(app)/admin/overview/page.tsx:61-73 — separate, notification-unrelated dashboard counts query users `eq(users.role, ...)` for factory_pm/site_pm/super_admin/operations — a read-only admin overview widget, not a notification path. Ruled out as the source of the reported behavior but noted as another place broad `role`-only queries appear in this codebase, in case the "notifications" the user means are actually dashboard visibility, not the `notifications` table (worth confirming with evidence step 1 above: is the user looking at the notification bell/alerts panel, or a dashboard "pending items" list?).

## Eliminated

- hypothesis: "`notifyAllSuperAdmins()`'s blanket broadcast (actions/projects.ts pause/flag, actions/issues.ts issue log, actions/bypass.ts escalation) is the source of the reported steps 5/12/13 leak."
  evidence: "REQUIREMENTS.md REQ-G06 ('a persisted in-app notifications subsystem targets super admins') and REQ-G08 ('any actor can pause/flag a project... this notifies all super admins') confirm this blanket broadcast is INTENTIONAL, spec'd escalation behavior, not a bug. Additionally, exhaustive grep of every notify-insert call site (only 2 exist codebase-wide: notifyAllSuperAdmins, notifyUser) confirms neither setInvoiceTimelineAction (completes step 5) nor submitYesNoUploadAction (completes step 12) calls any notify function at all — this path is unreachable from steps 5/12/13's normal completion flow."
  timestamp: 2026-07-17

<!-- continuation of the Evidence section above (single logical section) -->

- timestamp: 2026-07-17
  checked: "Live DB query on workflow_step_definitions (graph='live') for steps 5/12/13"
  found: "set_delivery_timeline (5), internal_approval (12), and send_for_production (13, sender side) all had required_position = NULL/blank; send_for_production's receiver_required_position was already correctly 'chief_production_officer'."
  implication: "The position-exact gate (already correctly implemented in 3 separate code paths — page gate, authorizeStep, my-work/getApprovalReceiverHolders) was never fed a value for these 3 rows, so it fell through to 'any operations/super_admin-role user' via canRoleActOnStep's isAdminRole special-case for stepRole='operations'."
- timestamp: 2026-07-17
  checked: "db/workflow-live-steps.ts comments (lines 85, 106, 155) and REQUIREMENTS.md:281 (STG-11)"
  found: "The NULL requiredPosition was a DELIBERATE prior design decision (D-01, quick tasks 260713-rb2/260714-qe4) to admit any operations-or-super_admin role user. REQUIREMENTS.md STG-11 separately names the intended sender for send_for_production as '(Operations Admin)', i.e. the current spec supersedes D-01 for this ops-approval-chain."
  implication: "This is a genuine, deliberate scope tightening requested by the current bug report/spec, not restoring a previously-correct value — confirmed safe to apply per the positions table (operations_manager_admin = 'Operations Admin', the only matching position) and per no in-flight projects currently blocked on these 3 steps."
- timestamp: 2026-07-17
  checked: "Live query on users x positions, and projects.current_step / workflow_step_states for send_for_production"
  found: "9 operations/super_admin-role users span 4 different positions (head_of_operations, head_of_projects, chief_production_officer, operations_manager_admin, and one with no position). No project currently sits on steps 5/12/13, and the one historically-sent send_for_production row was sent by the operations_manager_admin position holder already."
  implication: "Safe to tighten required_position with zero risk of locking out an actor mid-flight."
- timestamp: 2026-07-17
  checked: "Ran scripts/fix-notification-position-scoping.ts (new, idempotent) against the live DB"
  found: "required_position set to 'operations_manager_admin' on all 3 rows (graph='live'); re-run confirmed idempotent no-op."
  implication: "Fix applied."
- timestamp: 2026-07-17
  checked: "npm run verify:live-workflow, npm test (153 tests), npm run lint"
  found: "verify:live-workflow PASS (22/22 parity + both dual-role orders); vitest 153 passed, 1 todo; lint 0 errors (4 pre-existing warnings unrelated to this change, in .claude/worktrees copy and tests/actions/workflow.test.ts)."
  implication: "No regressions from the data fix."
- timestamp: 2026-07-17
  checked: "Ad hoc verification script (using the app's own getStepByKey/canRoleActOnStep/approvalSenderEligible/getApprovalReceiverHolders — deleted after use) against all 9 real operations/super_admin-role users"
  found: "For each of set_delivery_timeline, internal_approval, and send_for_production (sender), exactly ONE user (position=operations_manager_admin) is ALLOWED; all others (head_of_operations x3, chief_production_officer x2, head_of_projects x2, no-position x1) are denied. send_for_production's RECEIVER gate is unchanged (still exactly the 2 chief_production_officer holders)."
  implication: "Fix verified functionally correct and precisely scoped — matches every symptom in the trigger with no side effects on the receiver gate."

- timestamp: 2026-07-18
  checked: "Re-verified live DB state during quick task 260718-q20 (read-only query, graph='live'), now including the step-19 extension from commit e0cc3f1"
  found: "All FOUR rows (set_delivery_timeline, internal_approval, send_for_production sender, approval_installation) have required_position='operations_manager_admin'; send_for_production's receiver_required_position is still 'chief_production_officer'. The data fix is applied and intact — including approval_installation (step 19), confirming the extended script was run against live."
  implication: "The position-scoping restriction survives in the live DB. Remaining pending item is unchanged: end-to-end human/app confirmation with a project actually sitting on one of these steps. Separately, the sibling per-tab notification scope hole (markNotificationsReadAction acting as the shared-cookie user) was fixed and live-verified in quick task 260718-q20."

## Resolution

root_cause: |
  Steps 5 (set_delivery_timeline), 12 (internal_approval), and 13
  (send_for_production, sender side) in workflow_step_definitions (graph=
  'live') all have role='operations' with required_position NULL/blank.
  canRoleActOnStep() special-cases stepRole='operations' to
  isAdminRole(userRole) (true for BOTH operations- and super_admin-role
  users), with no position narrowing when requiredPosition is falsy. The
  NULL was a deliberate prior design decision (D-01, quick tasks
  260713-rb2/260714-qe4) that the current spec (REQUIREMENTS.md STG-11) and
  this bug report supersede for these 3 ops-approval-chain steps
  specifically: they must be scoped to the exact Operations Admin position
  (operations_manager_admin), not any operations/super_admin title. This
  was a pure DATA defect, not broken code — every consumer that reads
  requiredPosition (page gate app/(app)/workflow/step/page.tsx, authorizeStep
  in actions/workflow-graph.ts, getApprovalReceiverHolders/
  approvalSenderEligible in lib/workflow-graph.ts, and lib/my-work.ts's
  position-mismatch exclusion) already implements the exact-position gate
  correctly; it just never received a value for these 3 rows.
fix: |
  Added scripts/fix-notification-position-scoping.ts (idempotent, follows
  the existing scripts/fix-*.ts one-time-repair convention) and ran it
  against the live DB: sets required_position='operations_manager_admin' on
  workflow_step_definitions rows set_delivery_timeline, internal_approval,
  and send_for_production (graph='live'). send_for_production's
  receiver_required_position (chief_production_officer) is unchanged. No
  application code changed — the existing gates now enforce correctly once
  the data is present.
verification: |
  npm run verify:live-workflow — PASS (parity 22/22, both dual-role orders).
  npm test — 153 passed, 1 todo, 0 failures.
  npm run lint — 0 errors (4 pre-existing unrelated warnings).
  Ad hoc functional check (using the app's own getStepByKey/
  canRoleActOnStep/approvalSenderEligible/getApprovalReceiverHolders,
  script deleted after use) against all 9 real operations/super_admin-role
  users: exactly the operations_manager_admin position holder is ALLOWED on
  all 3 steps; every other position (head_of_operations,
  chief_production_officer, head_of_projects, none) is denied.
  send_for_production's receiver gate unchanged (2 holders). Re-ran the fix
  script — confirmed idempotent no-op on second run.
  Pending: human confirmation in the live app (log in as a non-Operations-
  Admin position and confirm steps 5/12/13 are now inaccessible; log in as
  Operations Admin and confirm access/action still works end-to-end).
files_changed:
  - scripts/fix-notification-position-scoping.ts (new)
  - "workflow_step_definitions (live DB data, graph='live'): required_position set to operations_manager_admin on set_delivery_timeline, internal_approval, send_for_production"
