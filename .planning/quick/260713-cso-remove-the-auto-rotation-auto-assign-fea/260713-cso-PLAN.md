---
phase: quick-260713-cso
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/workflow-graph.ts
  - actions/projects.ts
  - app/_components/trt-flow-diagram.tsx
  - lib/workflow.ts
  - db/workflow-live-steps.ts
  - lib/notifications.ts
autonomous: true
requirements: [QUICK-260713-CSO]

must_haves:
  truths:
    - "Creating a new project no longer auto-assigns a designer/architect for assign_designer_brief — the step sits pending until the Head Designer manually assigns via the normal /workflow/step UI."
    - "No code path in the codebase invokes round-robin auto-assignment; grep for autoAssignIfConfigured, AUTO_ASSIGN_STEP_KEYS, and triggerEntryAutoAssign returns zero non-node_modules hits."
    - "The normal manual assignUser / assignUserAction / completeStepAction / AssignmentStep flow for assign_designer_brief is unchanged."
    - "FIRST_ACTION_STEP (=2) still exists and is still used for currentStep at project creation and per-step deadline filtering."
    - "tsc --noEmit, eslint, npm run build, and npm test all pass."
  artifacts:
    - path: "lib/workflow-graph.ts"
      provides: "Workflow engine with the auto-assign allowlist and round-robin function removed"
      contains: "export async function assignUser"
    - path: "actions/projects.ts"
      provides: "Project-creation action with no entry auto-assign trigger"
      contains: "createProjectIntentAction"
    - path: "app/_components/trt-flow-diagram.tsx"
      provides: "Flow-diagram blurb describing assign_designer_brief as a manual action"
  key_links:
    - from: "actions/projects.ts createProjectIntentAction"
      to: "projects table INSERT"
      via: "currentStep: FIRST_ACTION_STEP with no follow-on auto-assign call"
      pattern: "currentStep: FIRST_ACTION_STEP"
---

<objective>
Remove the round-robin auto-assign feature that automatically assigned (and auto-completed) a designer/architect for the `assign_designer_brief` step at project creation. After this change, the Head Designer must always manually assign a designer/architect for that step — it behaves like every other ordinary `assignment`-kind step, sitting pending until manually actioned via the normal `/workflow/step` UI.

Purpose: The user observed the auto-assignment fire on a real project ("Usuma") and explicitly requested it be removed — manual assignment is the desired behavior.
Output: Auto-assign engine code deleted, its single call sites removed, dead imports cleaned up, and all stale documentation/UI copy updated to stop claiming automatic assignment.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The exact code and surrounding context has already been located and verified against the current checkout.
# Read each target region fully before editing — do not assume line numbers are current.

<interfaces>
From lib/workflow-graph.ts (the ONLY definitions being removed — everything else in the file stays):
- `const AUTO_ASSIGN_STEP_KEYS = new Set(['assign_designer_brief'])` (with its preceding comment block)
- `export async function autoAssignIfConfigured(projectId: string, step: GraphStep): Promise<void>` (with its preceding JSDoc)
- Its call site inside `syncProjectCurrentStepAfterCompletion`:
    ```
    if (!done) {
      const landedOn = steps.find((s) => s.orderIndex === nextStep)
      if (landedOn) await autoAssignIfConfigured(projectId, landedOn)
    }
    ```
  `landedOn` is used ONLY for this auto-assign call, and `done` is already consumed earlier in the same function (in the `.set({ status: done ? 'delivered' : proj.status })` update). So the entire `if (!done) { ... }` block is removed wholesale.
- `inArray` (imported at `import { and, eq, inArray } from 'drizzle-orm'`) is used ONLY inside `autoAssignIfConfigured` — it becomes unused and must drop to `import { and, eq } from 'drizzle-orm'`.

From actions/projects.ts (removals):
- `async function triggerEntryAutoAssign(projectId: string): Promise<void>` (with its preceding `// v2.0 Phase 22c: ...` comment block, lines ~20-32)
- Its call site: `await triggerEntryAutoAssign(created.id)` inside `createProjectIntentAction`, right after the `new_project` step-1 completion insert
- Import cleanup: `import { getLiveWorkflowSteps, getGraphSteps, autoAssignIfConfigured } from '@/lib/workflow-graph'` → `getGraphSteps` (used ONLY in triggerEntryAutoAssign) and `autoAssignIfConfigured` both become unused; keep ONLY `getLiveWorkflowSteps` (used in setInvoiceTimelineAction + pauseProjectAction). Result: `import { getLiveWorkflowSteps } from '@/lib/workflow-graph'`.
- `FIRST_ACTION_STEP` import STAYS (still used at `currentStep: FIRST_ACTION_STEP` in the INSERT).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete the auto-assign engine and its call sites</name>
  <files>lib/workflow-graph.ts, actions/projects.ts</files>
  <action>
Remove all executable auto-assign code and clean up the imports it leaves dead.

In `lib/workflow-graph.ts`:
1. Delete the `AUTO_ASSIGN_STEP_KEYS` constant AND its preceding comment block (the `// v2.0 Phase 22 (ad hoc, targeted): ...` paragraph).
2. Delete the entire `autoAssignIfConfigured` function AND its preceding JSDoc (`/** Round-robin auto-assignment: ... */`).
3. Inside `syncProjectCurrentStepAfterCompletion`, delete the whole `if (!done) { const landedOn = steps.find(...); if (landedOn) await autoAssignIfConfigured(projectId, landedOn) }` block. Leave the rest of the function (the `db.update(projects).set({ currentStep: nextStep, status: done ? ... })` above it) intact — `done` is still consumed there.
4. Change `import { and, eq, inArray } from 'drizzle-orm'` to `import { and, eq } from 'drizzle-orm'` (`inArray` was only used by the deleted function). Do NOT touch `workflowStepStates` or `users` imports — they are still used by `assignUser`/`appendFulfilledKind`/etc.

In `actions/projects.ts`:
1. Delete the `triggerEntryAutoAssign` function AND its preceding `// v2.0 Phase 22c: ...` comment block (the paragraph explaining why it's invoked explicitly at creation).
2. Delete the call site `await triggerEntryAutoAssign(created.id)` inside `createProjectIntentAction` (right after the `db.insert(projectStepCompletions)` for `new_project`).
3. Change the import to `import { getLiveWorkflowSteps } from '@/lib/workflow-graph'` (drop `getGraphSteps` and `autoAssignIfConfigured` — both now unused). Keep the `FIRST_ACTION_STEP` import from `@/lib/workflow` and its `currentStep: FIRST_ACTION_STEP` usage unchanged.

Do NOT modify assignUser, assignUserAction, completeStepAction, AssignmentStep, design_initiation, or FIRST_ACTION_STEP's value — the normal manual-assignment flow already works and must stay untouched.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && grep -rn "autoAssignIfConfigured\|AUTO_ASSIGN_STEP_KEYS\|triggerEntryAutoAssign" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -c . | grep -qx 0 && echo "REMOVED-CLEAN" && npx tsc --noEmit && echo "TSC-OK"</automated>
  </verify>
  <done>No source references to autoAssignIfConfigured, AUTO_ASSIGN_STEP_KEYS, or triggerEntryAutoAssign remain (grep count 0); `tsc --noEmit` passes with no unused-import or missing-symbol errors.</done>
</task>

<task type="auto">
  <name>Task 2: Update stale comments and UI copy, then run full verification</name>
  <files>app/_components/trt-flow-diagram.tsx, lib/workflow.ts, db/workflow-live-steps.ts, lib/notifications.ts</files>
  <action>
Update every remaining reference that still claims `assign_designer_brief` is automatic. These are documentation/UI-copy only — no behavior changes.

1. `app/_components/trt-flow-diagram.tsx` — in the `DETAIL` map, rewrite the `assign_designer_brief` blurb. Current: `"Head Designer assigns a Designer or Architect to take the client's brief (auto-assigned, 5-day max)."` Drop the "(auto-assigned, ...)" framing. Rewrite to describe a manual action by the Head Designer within a target timeframe, e.g. `"Head Designer manually assigns a Designer or Architect to take the client's brief (5-day target)."` Keep the 5-day language since it still communicates the real deadline expectation; just stop calling it automatic.

2. `lib/workflow.ts` — the comment directly above `export const FIRST_ACTION_STEP = 2` currently reads (paraphrased) "...Assign Designer/Architect for Brief, auto-assigned at creation time — see actions/projects.ts triggerEntryAutoAssign...". Rewrite it to drop the auto-assign / triggerEntryAutoAssign reference. Keep the accurate part: new projects begin parked at the first actionable step (Assign Designer/Architect for Brief), and step 1 (New Project) is completed by Customer Care at creation. The Head Designer now assigns manually. Do NOT change the value `= 2`.

3. `db/workflow-live-steps.ts` — two historical migration-note comment blocks reference auto-assign / triggerEntryAutoAssign:
   - The `22b` block: "...Assign Designer and Brief Taking are already done by this point — auto-assigned with an implicit 5-day SLA, not a deadline collected here..." — this claim is now false. Reword to note these early steps are handled manually (Head Designer assigns; the assigned designer takes the brief) before the invoice timeline is set, dropping the "auto-assigned" wording.
   - The `22c` block: "...Assign Designer/Architect for Brief is now the FIRST actionable step (auto-assigned immediately at project creation — see actions/projects.ts triggerEntryAutoAssign)..." — drop the parenthetical auto-assign / triggerEntryAutoAssign reference; keep the accurate "is now the FIRST actionable step" statement.

4. `lib/notifications.ts` — the comment above `notifyUser` says the self-exclusion "...covers the auto-assign path where a user is assigned to themselves." That path no longer exists. Keep the self-exclusion behavior (recipientId === actorId never self-notifies) but reword the justification to a general one (e.g. "in case an actor assigns a step to themselves") — do NOT change the `notifyUser` logic.

After all edits, run the full verification suite from the trt-pm root.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && grep -rni "auto.assign" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -c . | grep -qx 0 && echo "NO-AUTOASSIGN-REFS" && npx tsc --noEmit && npm run lint && npm test && npm run build && echo "ALL-GREEN"</automated>
  </verify>
  <done>Zero remaining "auto-assign" references in source (grep count 0); `tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` all pass.</done>
</task>

</tasks>

<verification>
- `grep -rn "autoAssignIfConfigured\|AUTO_ASSIGN_STEP_KEYS\|triggerEntryAutoAssign"` over `*.ts`/`*.tsx` (excluding node_modules) returns nothing.
- `grep -rni "auto.assign"` over source returns nothing (all descriptive comments and UI copy updated).
- `npx tsc --noEmit` passes (no unused imports, no dangling symbols).
- `npm run lint` passes.
- `npm test` passes — including the existing `tests/lib/workflow.test.ts` assertion that `FIRST_ACTION_STEP === 2` (which must remain true).
- `npm run build` succeeds.
</verification>

<success_criteria>
- The `assign_designer_brief` step is no longer auto-assigned or auto-completed at project creation; it sits pending until the Head Designer manually picks a candidate via the normal UI.
- The round-robin auto-assign engine (`AUTO_ASSIGN_STEP_KEYS`, `autoAssignIfConfigured`, `triggerEntryAutoAssign`) is fully removed with no dead imports left behind.
- `FIRST_ACTION_STEP`, the manual `assignUser`/`AssignmentStep` flow, and `design_initiation` are all untouched.
- All documentation and UI copy that previously described automatic assignment now describes manual assignment.
- tsc, eslint, tests, and build all pass.
</success_criteria>

<output>
Create `.planning/quick/260713-cso-remove-the-auto-rotation-auto-assign-fea/260713-cso-SUMMARY.md` when done.
</output>
