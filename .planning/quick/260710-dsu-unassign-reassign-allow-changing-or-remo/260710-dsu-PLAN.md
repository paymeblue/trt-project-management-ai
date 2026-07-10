---
phase: quick-260710-dsu
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: workflow
autonomous: true
requirements: [UX-UNASSIGN-REASSIGN]
files_modified:
  - lib/workflow-graph.ts
  - actions/workflow-graph.ts
  - app/_components/workflow-kinds/assignment-step.tsx
  - app/(app)/workflow/step/page.tsx
tags: [nextjs16, workflow, assignment, unassign, reassign, server-action]

must_haves:
  truths:
    - "An authorized actor (same role/position that can assign the step) can UNASSIGN the current assignee of an assignment step, as long as the step has not been completed (no project_step_completions row)."
    - "The same actor can REASSIGN to a different user (reusing the existing Assign path), also only while the step is not completed."
    - "Attempting to unassign or reassign a COMPLETED step is rejected server-side with a distinct, visible message — not merely hidden in the UI."
    - "The AssignmentStep UI shows the current assignee's name and offers an explicit Unassign action plus a change (reassign) path."
    - "After a successful unassign/reassign the same confirmation + delayed-redirect pattern from quick task 260710-d32 fires."
  artifacts:
    - path: "lib/workflow-graph.ts"
      provides: "unassignUser engine fn + completion guard on assignUser/unassignUser"
      contains: "export async function unassignUser"
    - path: "actions/workflow-graph.ts"
      provides: "unassignUserAction server action + step-already-completed error mapping"
      contains: "export async function unassignUserAction"
    - path: "app/_components/workflow-kinds/assignment-step.tsx"
      provides: "current-assignee display, Unassign button, reassign preselect + confirmations"
      contains: "Unassign"
  key_links:
    - from: "app/_components/workflow-kinds/assignment-step.tsx"
      to: "unassignUserAction"
      via: "startTransition -> await unassignUserAction(...)"
      pattern: "unassignUserAction"
    - from: "actions/workflow-graph.ts unassignUserAction"
      to: "lib/workflow-graph.ts unassignUser"
      via: "authorizeStep gate then delegate"
      pattern: "unassignUser\\("
    - from: "app/(app)/workflow/step/page.tsx"
      to: "AssignmentStep currentAssignee prop"
      via: "query workflowStepStates for assignedUserId + join users.name"
      pattern: "currentAssignee"
---

<objective>
After an officer/PM is assigned to an assignment-kind workflow step (via AssignmentStep + assignUserAction), there is currently no way to undo or change it. Add an authorized unassign and reassign path, guarded so it is only possible while the step's work has NOT been completed.

Purpose: Assignments are currently a one-way door — a mistaken or stale assignment can never be corrected. The person who owns the step (e.g. Head of Operations / the role that made the assignment) needs to be able to remove or swap the assignee before the step is completed, with the same clear confirmation + redirect UX just shipped in 260710-d32.

Output: An `unassignUser` engine function + `unassignUserAction` server action (both completion-guarded), a completion guard added to the existing `assignUser`/reassign path, and an updated AssignmentStep that surfaces the current assignee and offers Unassign + change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260710-d32-post-assignment-ux-show-clear-confirmati/260710-d32-SUMMARY.md

<interfaces>
<!-- Extracted from the codebase so the executor needs no exploration. -->

State model (verified):
- An assignment is stored in ONE `workflow_step_states` row, unique on (projectId, stepDefId):
  columns `assignedUserId`, `status` ('pending'|'sent'|'complete'), `actedBy`, `updatedAt`,
  `fulfilledKinds` (text[] — contains 'assignment' once assigned). `assignUser` upserts this row.
- Step ADVANCEMENT (what the guard rail calls "completed") is SEPARATE: a `project_step_completions`
  row inserted by `completeGraphStep`. Use `getCompletedStepIds(projectId): Promise<Set<string>>`
  and check `.has(stepDefId)` to know if the step is completed. Do NOT key the guard off
  `workflow_step_states.status`, which is only the assignment-kind fulfillment marker.
- There is NO dedicated assignment-history/audit table, and none is needed: `actedBy` + `updatedAt`
  on the same row are the truthful "who last acted, when" record. Keep them correct on unassign.

From lib/workflow-graph.ts:
```typescript
export async function getStepById(id: string): Promise<GraphStep | undefined>
export async function getCompletedStepIds(projectId: string): Promise<Set<string>>
export async function assignUser(opts: { projectId: string; stepDefId: string; actorId: string; assignedUserId: string }): Promise<void>
// workflowStepStates, users, projectStepCompletions, db, and { and, eq } from drizzle-orm are already imported in this file.
```

From actions/workflow-graph.ts (mirror this shape exactly):
```typescript
export type WorkflowGraphActionState = { ok: boolean; message?: string }
async function authorizeStep(stepDefId: string): Promise<StepAuth> // role + requiredPosition gate; returns { ok, userId }
function revalidateBoards(): void
const ENGINE_ERROR_MESSAGES: Record<string, string> // add 'step-already-completed' here
export async function assignUserAction(input: { projectId; stepDefId; assignedUserId }): Promise<WorkflowGraphActionState>
```

From app/_components/workflow-kinds/assignment-step.tsx (current props — extend, keep additive/optional):
```typescript
{ projectId, stepDefId, targetRoles, candidates, stepLabel?, projectName?, redirectTo? }
// already uses useRouter + a REDIRECT_DELAY_MS setTimeout/useRef confirm-then-navigate pattern (d32).
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add completion-guarded unassign (engine + action) and guard the reassign path</name>
  <files>lib/workflow-graph.ts, actions/workflow-graph.ts</files>
  <behavior>
    - unassignUser on a not-completed assignment step: clears the row's assignedUserId (null),
      removes 'assignment' from fulfilledKinds, sets status back to 'pending', sets actedBy = actor,
      bumps updatedAt. Idempotent-safe if no row exists (no-op, no throw).
    - unassignUser on a COMPLETED step (stepDefId in getCompletedStepIds): throws 'step-already-completed'.
    - assignUser on a COMPLETED step: also throws 'step-already-completed' (so reassign cannot rewrite
      a completed step's recorded assignee). First-time assignment is unaffected — an unassigned step is
      never completed.
    - unassignUserAction: authorizeStep gate (same role/position as assign), delegate to unassignUser,
      map errors, revalidateBoards, return { ok }.
  </behavior>
  <action>
    In lib/workflow-graph.ts, add an exported `unassignUser(opts: { projectId, stepDefId, actorId })`.
    First call getStepById(stepDefId); throw 'step-not-found' if absent. Then check
    `(await getCompletedStepIds(projectId)).has(stepDefId)` and throw a new Error('step-already-completed')
    if true. Otherwise update the workflow_step_states row for (projectId, stepDefId): set
    `assignedUserId: null`, `status: 'pending'`, `actedBy: opts.actorId`, `updatedAt: new Date()`, and
    `fulfilledKinds` to the existing array with 'assignment' filtered out (read the current row first;
    if no row exists, return without writing — nothing to unassign). Use the existing `and`/`eq`
    imports and the `workflowStepStates` table already imported in this file.

    Still in lib/workflow-graph.ts, add the SAME completion guard at the top of the existing `assignUser`
    (after its getStepById/step-not-found check): if `(await getCompletedStepIds(opts.projectId)).has(opts.stepDefId)`
    throw new Error('step-already-completed'). This closes the reassign-after-completion hole; do not change
    the rest of assignUser.

    In actions/workflow-graph.ts, add `'step-already-completed': 'This step has already been completed, so its assignment can no longer be changed.'`
    to the ENGINE_ERROR_MESSAGES map. Import `unassignUser` alongside the existing engine imports. Add
    `export async function unassignUserAction(input: { projectId: string; stepDefId: string })` that mirrors
    assignUserAction exactly: `const auth = await authorizeStep(input.stepDefId); if (!auth.ok) return auth;`
    then try `await unassignUser({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })`,
    catch -> `return { ok: false, message: engineErrorMessage(err) }`, then `revalidateBoards(); return { ok: true }`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc clean; `unassignUser` and `unassignUserAction` exported; 'step-already-completed' mapped; assignUser has the completion guard. `grep -n "step-already-completed" lib/workflow-graph.ts actions/workflow-graph.ts` shows it in both files.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Surface current assignee + Unassign/change path in AssignmentStep and wire the page</name>
  <files>app/_components/workflow-kinds/assignment-step.tsx, app/(app)/workflow/step/page.tsx</files>
  <behavior>
    - When a step already has an assignee, AssignmentStep shows "Currently assigned: {name}" and preselects
      that user in the dropdown, so picking a different user + Assign performs a reassign.
    - An "Unassign" button appears only when there is a current assignee; clicking it calls unassignUserAction
      and on success shows "✓ Unassigned from \"{stepLabel}\"{ on {projectName}}. Redirecting…" then redirects
      after REDIRECT_DELAY_MS (reuse the existing scheduleRedirect + timer-cleanup from d32).
    - On failure of unassign (e.g. server rejects a completed step), the existing text-error message shows the
      server message; no redirect.
    - Reassign (Assign with a different user) keeps its existing d32 confirmation unchanged.
  </behavior>
  <action>
    In app/(app)/workflow/step/page.tsx, inside the `case 'assignment'` branch (which already fetches
    `candidates`), also fetch the current assignment: query `workflowStepStates` for the row matching
    (projectId, step.id) selecting `assignedUserId`; if present, resolve its user name from the already-fetched
    `candidates` (find by id) or a small extra `users` lookup. Build `currentAssignee: { id: string; name: string } | null`
    and pass it as a new prop to `<AssignmentStep currentAssignee={currentAssignee} ... />`. Import
    `workflowStepStates` from `@/db/schema` (add to the existing import) and reuse the `and`/`eq` already imported.
    Do not change the other kind branches.

    In app/_components/workflow-kinds/assignment-step.tsx, add optional prop
    `currentAssignee?: { id: string; name: string } | null` and import `unassignUserAction` alongside the
    existing action imports. Initialize `selected` to `currentAssignee?.id ?? candidates[0]?.id ?? ''` so the
    current assignee is preselected. Above the select, when `currentAssignee` is set, render a line
    "Currently assigned: {currentAssignee.name}". Add an `unassign()` handler mirroring the existing `complete()`
    handler: setMessage(null), startTransition -> `await unassignUserAction({ projectId, stepDefId })`; on
    res.ok setMessage(`✓ Unassigned from "${stepLabel ?? 'this step'}"${projectName ? ` on ${projectName}` : ''}.${redirectTo ? ' Redirecting…' : ''}`),
    setOk(true), scheduleRedirect(); else setMessage(res.message ?? 'Could not unassign.'), setOk(false).
    Render an "Unassign" button (styled like the existing "Complete step" outline button) only when
    `currentAssignee` is set, disabled while `pending`. Keep the Assign button label/behavior; with the
    dropdown preselected to a different user it now doubles as reassign. Do NOT place any code fences inside
    reasoning — implement directly against the existing component structure.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>tsc + lint clean; AssignmentStep shows current assignee and an Unassign button that calls unassignUserAction with the d32 confirm-then-redirect; page passes currentAssignee. `grep -n "unassignUserAction\|currentAssignee" app/_components/workflow-kinds/assignment-step.tsx` matches.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new errors (pre-existing app/layout.tsx font warning is acceptable).
- `npm run verify:live-workflow` — must stay 19/19 (PARITY 19/19, both JOIN orders 4/4). This change touches assignment fulfillment + one new engine fn; it must not perturb the step graph or completion derivation. Note: this harness needs DATABASE_URL from the gitignored .env.local (see d32 SUMMARY for the safe temporary-copy approach).
- Manual (if a dev server is available): open a live assignment step that already has an assignee, confirm the current assignee shows; Unassign clears it (green confirmation + redirect); reassign to a different user works; and that a completed step's assignment cannot be changed (server rejects with the "already been completed" message).
</verification>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → server action | Any authenticated user could POST unassign/reassign for an arbitrary projectId/stepDefId |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dsu-01 | Elevation of Privilege | unassignUserAction / assignUserAction | mitigate | Reuse existing `authorizeStep` (verifySession + canRoleActOnStep + requiredPosition, position fetched fresh from DB) before any write — same server-side gate as assign; UI hiding is not relied upon. |
| T-dsu-02 | Tampering | reassign/unassign of a completed step | mitigate | Server-side `getCompletedStepIds().has(stepDefId)` guard in BOTH unassignUser and assignUser throws 'step-already-completed'; a forged request on a completed step is rejected before any row is written, preserving the completed step's recorded assignee (audit truth). |
| T-dsu-03 | Repudiation | who removed/changed an assignment | accept | No new audit table (per scope constraint). `workflow_step_states.actedBy` + `updatedAt` are updated to the acting user on unassign/reassign — the existing, truthful "who last acted, when" record. Sufficient for this internal tool. |
</threat_model>

<success_criteria>
- `unassignUser` (engine) + `unassignUserAction` (server action) exist, both gated so a completed step cannot be unassigned.
- `assignUser` also rejects reassignment once the step is completed.
- AssignmentStep shows the current assignee, offers an Unassign button and a working reassign path, both using the 260710-d32 confirm-then-redirect UX.
- Authorization is enforced server-side via the existing `authorizeStep` gate.
- No new tables; audit truth preserved via `actedBy`/`updatedAt`.
- `npx tsc --noEmit` clean, `npm run lint` clean, `npm run verify:live-workflow` still 19/19.
</success_criteria>

<output>
Create `.planning/quick/260710-dsu-unassign-reassign-allow-changing-or-remo/260710-dsu-SUMMARY.md` when done.
</output>
