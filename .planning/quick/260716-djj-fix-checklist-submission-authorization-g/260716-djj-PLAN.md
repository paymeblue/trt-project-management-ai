---
phase: quick-260716-djj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - actions/checklists.ts
autonomous: true
requirements: [SEC-CHECKLIST-AUTH]
must_haves:
  truths:
    - "A step-linked checklist submission (projectId + expectedStepN both set) is rejected with an authorization error BEFORE any checklists/checklistResponses row is inserted, when the caller's role cannot act on that workflow step."
    - "A factory_pm submitting the factory_manager_readiness checklist as a step-linked submission gets 'You are not authorized...' and creates ZERO rows."
    - "A factory_manager submitting the same step-linked checklist still succeeds and still advances the step (no regression)."
    - "Non-step-linked submissions (no expectedStepN) keep today's behavior unchanged — no new auth gate applied."
    - "A step-linked submission whose live step.slug does not match the client-supplied slug is rejected."
  artifacts:
    - path: "actions/checklists.ts"
      provides: "Server-side authorization gate in submitChecklistAction before DB insert"
      contains: "canActOnGraphStep"
  key_links:
    - from: "actions/checklists.ts submitChecklistAction"
      to: "@/lib/workflow-graph getLiveWorkflowSteps + @/lib/workflow findStep/canActOnGraphStep"
      via: "server-side re-derivation of the live step and role check"
      pattern: "getLiveWorkflowSteps|canActOnGraphStep"
---

<objective>
Close a checklist-submission authorization gap. `submitChecklistAction` authenticates the caller but never authorizes them against the workflow step being submitted, so a `factory_pm` can create a permanent `checklists`/`checklistResponses` record for the `factory_manager`-only "Factory Manager Readiness Forms" step (step 16, `factory_manager_readiness`).

Purpose: Enforce role authorization server-side on the actual checklist-submission path (not only on the downstream step-advance path), so unauthorized roles cannot persist a step-linked checklist record at all.

Output: `actions/checklists.ts` with a real authorization check inside `submitChecklistAction`, gating the insert whenever the submission is step-linked (`projectId && expectedStepN`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@actions/checklists.ts

<interfaces>
<!-- Contracts the executor needs — already extracted, no exploration required. -->

From @/lib/dal:
  verifySession(): Promise<{ userId: string; role: Role }>   // already called in submitChecklistAction — also destructure `role`

From @/lib/workflow-graph:
  getLiveWorkflowSteps(): Promise<LiveWorkflowStep[]>
  // LiveWorkflowStep extends WorkflowStep and carries: n (step number), slug (checklist slug),
  // role: WorkflowRole, dualRoles?: WorkflowRole[] | null

From @/lib/workflow:
  findStep<T extends WorkflowStep>(steps: T[], n: number): T | undefined   // matches by s.n
  canActOnGraphStep(step: { role: WorkflowRole; dualRoles?: WorkflowRole[] | null }, userRole: UserRole): boolean
  type UserRole

  // Confirmed behavior: canActOnGraphStep returns true if canRoleActOnStep(step.role, role)
  // OR step.dualRoles includes role. This is exactly the gate the page-level display notice
  // was already switched to in quick task 260716-c6s — reuse it here for the persistence gate.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server-side authorization gate to submitChecklistAction before insert</name>
  <files>actions/checklists.ts</files>
  <action>
Edit `submitChecklistAction` (lines ~45-122) to authorize step-linked submissions before persisting.

1. Update the existing `verifySession()` destructure (line 49) to also capture role: `const { userId, role } = await verifySession()`.

2. Add imports at the top of the file: `getLiveWorkflowSteps` from `@/lib/workflow-graph`, and add `findStep`, `canActOnGraphStep`, and the `UserRole` type to the existing import from `@/lib/workflow` (currently importing `REQUIRED_PHOTOS, canEditChecklist`).

3. `projectId` is currently computed at line 67. Immediately AFTER the existing photo-validation block (after line 82, before the `try { ... }` insert block at line 84), insert the authorization gate. Gate condition: only when the submission is step-linked — `if (projectId && input?.expectedStepN)`. Inside:
   - `const steps = await getLiveWorkflowSteps()`
   - `const step = findStep(steps, Number(input.expectedStepN))`
   - If `!step` OR `step.slug !== slug` OR `!canActOnGraphStep(step, role as UserRole)` → `return { status: 'error', message: 'You are not authorized to submit this checklist for this step.' }`
   - This return happens BEFORE any `db.insert`, so an unauthorized caller persists zero rows.

Do NOT change: the non-step-linked path (no `expectedStepN`) stays exactly as today — no new gate for optional/unlinked checklists. Do NOT change the downstream `advanceOrConfirmDualRole` call at lines ~112-118 (already correct). Do NOT touch any other export in this file, `checklist_definitions.target_role`, the `checklists/[slug]/page.tsx` optional-checklist branch, or `actions/readiness.ts` (all confirmed out of scope).

No fenced code in the file's action logic beyond the directive above — implement as plain server-action TypeScript matching the existing style (early `return { status: 'error', ... }` guards, no throw).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npx eslint actions/checklists.ts && grep -q "getLiveWorkflowSteps" actions/checklists.ts && echo GATE_PRESENT</automated>
  </verify>
  <done>
`submitChecklistAction` calls `getLiveWorkflowSteps()` + `findStep` + `canActOnGraphStep` and returns the authorization error before any `db.insert(checklists)` whenever `projectId && expectedStepN` are set and the caller's role cannot act on the live step (or slug mismatch). Type-check and lint pass. Non-step-linked path unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Regression-check reused authorization primitive</name>
  <files>tests/lib/workflow.test.ts</files>
  <action>
Confirm no regression in the reused authorization primitive. First grep `tests/` for any existing direct test of `submitChecklistAction` (`grep -rn submitChecklistAction tests/`) — none is expected. Run the existing workflow test suite, which exercises `canActOnGraphStep`/`canRoleActOnStep` (the primitive this fix reuses), to confirm the shared logic is unaffected. Do not add new tests unless an existing `submitChecklistAction` test is found needing update.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && (grep -rn submitChecklistAction tests/ || echo "no direct test — expected") && npx vitest run tests/lib/workflow.test.ts 2>/dev/null || npx jest tests/lib/workflow.test.ts</automated>
  </verify>
  <done>Existing workflow test suite passes; the `canActOnGraphStep`/`canRoleActOnStep` behavior the fix depends on is confirmed unregressed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → submitChecklistAction | Client supplies `definitionId`, `slug`, `projectId`, `expectedStepN`, `answers`, `photos` — all untrusted. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-djj-01 | Elevation of Privilege | submitChecklistAction (step-linked path) | mitigate | Re-derive live step via `getLiveWorkflowSteps()` server-side and require `canActOnGraphStep(step, role)` before any DB insert; do not trust client slug/step. |
| T-djj-02 | Spoofing | client-supplied `slug` vs `expectedStepN` | mitigate | Reject when `step.slug !== slug` so a caller cannot pair an authorized step number with a different checklist. |
| T-djj-03 | Tampering | non-step-linked (unlinked) submissions | accept | Out of scope for this reported bug; existing optional-checklist behavior is intentional and unchanged. |
</threat_model>

<verification>
- `npx tsc --noEmit` passes.
- `npx eslint actions/checklists.ts` passes.
- `tests/lib/workflow.test.ts` passes.
- Manual reasoning trace: with `factory_pm` role + `expectedStepN=16` + `slug='factory_manager_readiness'`, `canActOnGraphStep` returns false (step.role='factory_manager', dualRoles=null) → error returned before insert. With `factory_manager` role, gate passes → insert + advance proceed.
</verification>

<success_criteria>
- Step-linked submission by an unauthorized role returns the authorization error and persists zero `checklists`/`checklistResponses` rows.
- Authorized role (factory_manager for step 16) still submits and advances — no regression.
- Non-step-linked submissions behave exactly as before.
- Only `actions/checklists.ts` changed; target_role enum, the page optional-checklist branch, and `actions/readiness.ts` untouched.
</success_criteria>

<output>
Create `.planning/quick/260716-djj-fix-checklist-submission-authorization-g/260716-djj-SUMMARY.md` when done.
</output>
