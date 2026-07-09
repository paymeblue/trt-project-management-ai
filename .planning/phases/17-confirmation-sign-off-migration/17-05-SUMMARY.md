---
phase: 17-confirmation-sign-off-migration
plan: 05
subsystem: workflow-engine
tags: [nextjs, react-context, client-components, workflow-engine, migration-cutover]

# Dependency graph
requires:
  - phase: 17-confirmation-sign-off-migration (plan 01)
    provides: findStep/lastStepN/projectComplete pure array-argument helpers in lib/workflow.ts
  - phase: 17-confirmation-sign-off-migration (plan 04)
    provides: WorkflowStepsProvider + useWorkflowSteps() context, seeded server-side from getLiveWorkflowSteps() in the (app) layout
provides:
  - app/_components/project-steps-board.tsx — ProjectStepsBoard/StepsModal/FlagControls read live steps via useWorkflowSteps()
  - app/_components/header-project-switcher.tsx — resolves current step via useWorkflowSteps()
  - app/_components/pending-step-gate.tsx — resolves current step via useWorkflowSteps()
  - "app/(app)/admin/projects/new/new-project-form.tsx — derives actionable steps + lastN via useWorkflowSteps()"
affects: [17-06 (literal retirement — these were the last live consumers of WORKFLOW_STEPS/stepByN/LAST_STEP/isProjectComplete outside lib/workflow.ts itself)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-component cutover pattern: call useWorkflowSteps() unconditionally at the top of each function component (above all early returns), then thread the resulting steps array + derived lastN into local helper functions as closures/arguments — mirrors the plan 01/04 adapter-then-cutover sequencing but applied per client component instead of per server call site"
    - "Components with multiple early returns (header-project-switcher.tsx's dismissed/empty-projects guards, pending-step-gate.tsx's !item guard) require the hook call to be hoisted above every return statement, not just the first — verified by placing useWorkflowSteps() immediately after the other top-level hooks (useMyWork/useState/useRef) and confirming no lint hook-rule violation"

key-files:
  created: []
  modified:
    - app/_components/project-steps-board.tsx
    - app/_components/header-project-switcher.tsx
    - app/_components/pending-step-gate.tsx
    - "app/(app)/admin/projects/new/new-project-form.tsx"

key-decisions:
  - "FlagControls and StepsModal (both defined in project-steps-board.tsx, rendered under the (app) layout's provider tree) each call useWorkflowSteps() directly rather than threading steps down as a prop from ProjectStepsBoard — simpler than prop-drilling since both are already client components under the provider, and the plan's interface note explicitly allowed either approach"
  - "new-project-form.tsx's module-level ACTIONABLE_STEPS constant became an in-component actionableSteps derived from the hook on every render (steps.filter(s => s.n >= FIRST_ACTION_STEP)) — necessary because useWorkflowSteps() can only be called inside a component, not at module scope; no behavior change since the live steps array is stable per request (WorkflowStepsProvider seeds once, never refetches)"

requirements-completed: [WF-06]

# Metrics
duration: ~10min
completed: 2026-07-09
---

# Phase 17 Plan 05: Client Consumer Cutover (Board, Header Switcher, Pending Gate, New-Project Form) Summary

**The four remaining live CLIENT consumers of the hardcoded `WORKFLOW_STEPS` array — the project steps board, header project switcher, forcing pending-step gate, and new-project form — now read steps via `useWorkflowSteps()` (plan 04's provider) and the pure `findStep`/`lastStepN`/`projectComplete` helpers (plan 01), with done/current/locked state, act-hrefs, step counts, and deadline inputs verified byte-identical.**

## Performance

- **Duration:** ~10 min
- **Files modified:** 4 (`app/_components/project-steps-board.tsx`, `app/_components/header-project-switcher.tsx`, `app/_components/pending-step-gate.tsx`, `app/(app)/admin/projects/new/new-project-form.tsx`)

## Accomplishments
- `app/_components/project-steps-board.tsx`: `ProjectStepsBoard` (top-level), `StepsModal`, and `FlagControls` each call `useWorkflowSteps()` and derive `lastN = lastStepN(steps)` locally; `WORKFLOW_STEPS.map(...)` → `steps.map(...)` in `StepsModal`, `WORKFLOW_STEPS.find(s => s.n === p.currentStep)` → `findStep(steps, p.currentStep)` in `currentStepLabel`/`needsViewer`, every `isProjectComplete(...)` call → `projectComplete(..., lastN)`. `canRoleActOnStep`/`stepHref`/`workflowRoleLabel` imports and all markup (Countdown/AckComplete/BypassRequest/FlagControls subcomponents, the 4s poll) unchanged.
- `app/_components/header-project-switcher.tsx`: `useWorkflowSteps()` called immediately after `useMyWork()`, above both early returns (`projects.length === 0` and `dismissed`). `stepByN(selected.stepN)` and the dropdown's `stepByN(p.stepN)` → `findStep(steps, ...)`; `LAST_STEP` → `lastN = lastStepN(steps)` in both the "Step N/lastN" display strings. `canRoleActOnStep`/`stepHref`/`workflowRoleLabel`/dismiss/dropdown behavior unchanged.
- `app/_components/pending-step-gate.tsx`: `useWorkflowSteps()` called alongside `useMyWork()`/`usePathname()`, above the `if (!item) return null` guard. `stepByN(item.stepN)` → `findStep(steps, item.stepN)`. `stepHref`, the ack branch, dismissals, and `isStepRoute` logic unchanged.
- `app/(app)/admin/projects/new/new-project-form.tsx`: removed the module-level `const ACTIONABLE_STEPS = WORKFLOW_STEPS.filter(...)` (impossible to keep — hooks can't run at module scope); replaced with an in-component `const steps = useWorkflowSteps(); const actionableSteps = steps.filter(s => s.n >= FIRST_ACTION_STEP)` plus `const lastN = lastStepN(steps)`. Every `ACTIONABLE_STEPS` reference (bounds/labelOf/onChange/render map) renamed to `actionableSteps`; `LAST_STEP` in the helper text → `lastN`. `FIRST_ACTION_STEP` import, `workflowRoleLabel`, and all deadline-ordering validation/toast behavior unchanged.
- Verified no `WORKFLOW_STEPS`/`stepByN`/`LAST_STEP`/literal `isProjectComplete` reference remains in any of the four files (`grep -rn` across all four returns nothing).
- Re-ran `npm run verify:live-workflow` after all three tasks: PARITY (12/12) and both JOIN orders (4/4 each) still PASS against the real live graph — confirms the DB-sourced steps these components now render from remain byte-identical to the legacy `WORKFLOW_STEPS` array, so the cutover is behaviorally invisible.
- `npx tsc --noEmit` clean, `npx next build` compiles all routes, `npm test` — 74 tests + 1 todo pass unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cut over the project steps board** - `12baac3` (feat)
2. **Task 2: Cut over the header switcher + pending-step gate** - `2324a8d` (feat)
3. **Task 3: Cut over the new-project form** - `733bce1` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/_components/project-steps-board.tsx` - `ProjectStepsBoard`/`StepsModal`/`FlagControls` read steps via `useWorkflowSteps()`; `findStep`/`lastStepN`/`projectComplete` replace `WORKFLOW_STEPS`/`LAST_STEP`/`isProjectComplete`.
- `app/_components/header-project-switcher.tsx` - Resolves current step via `findStep(useWorkflowSteps(), stepN)`; `lastStepN(steps)` replaces `LAST_STEP`.
- `app/_components/pending-step-gate.tsx` - Resolves current step via `findStep(useWorkflowSteps(), item.stepN)`.
- `app/(app)/admin/projects/new/new-project-form.tsx` - `actionableSteps` derived from `useWorkflowSteps()` filtered by `FIRST_ACTION_STEP`; `lastStepN(steps)` replaces `LAST_STEP` in the helper text.

## Decisions Made
- `FlagControls` and `StepsModal` each call `useWorkflowSteps()` directly (rather than receiving `steps` as a prop from `ProjectStepsBoard`) — both are already client components rendered under the `(app)` layout's provider tree, so calling the hook directly avoids unnecessary prop-drilling; the plan's interface notes explicitly permitted either approach.
- `new-project-form.tsx`'s previously module-level `ACTIONABLE_STEPS` became a per-render, in-component `actionableSteps` derived from the hook — required because hooks cannot run outside a component; no behavioral change since `WorkflowStepsProvider` seeds its state once per request and never refetches, so the derived array is stable across renders exactly like the old module-level constant was stable across the module's lifetime.

## Deviations from Plan

None — plan executed exactly as written. All four files' verification commands (`npx tsc --noEmit`, targeted `grep` checks, `npx next build`) passed on the first attempt with no additional fixes required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four live client consumers of the legacy `WORKFLOW_STEPS` array/`stepByN`/`LAST_STEP`/`isProjectComplete` are now DB-sourced via `useWorkflowSteps()` — combined with plans 02-04 (server actions/pages/provider/flow-diagram), every real caller of the legacy array outside `lib/workflow.ts` itself has been cut over.
- `npm run verify:live-workflow` re-run clean post-cutover (PARITY 12/12, both JOIN orders 4/4) — the live graph continues to match the legacy array exactly, so plan 06 can safely retire the `WORKFLOW_STEPS` literal (and its `stepByN`/`LAST_STEP`/`isProjectComplete` legacy helpers) knowing zero live caller still references it.
- `npx tsc --noEmit`, `npx next build`, and `npm test` (74 passed + 1 todo) all clean.
- No blockers. Ready for 17-06 (retire the literal, relocate seed data, before/after human verification checkpoint).

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: app/_components/project-steps-board.tsx
- FOUND: app/_components/header-project-switcher.tsx
- FOUND: app/_components/pending-step-gate.tsx
- FOUND: app/(app)/admin/projects/new/new-project-form.tsx
- FOUND: .planning/phases/17-confirmation-sign-off-migration/17-05-SUMMARY.md
- FOUND: commit 12baac3 (feat(17-05): cut over project steps board to useWorkflowSteps())
- FOUND: commit 2324a8d (feat(17-05): cut over header switcher + pending-step gate to useWorkflowSteps())
- FOUND: commit 733bce1 (feat(17-05): cut over new-project form to useWorkflowSteps())
