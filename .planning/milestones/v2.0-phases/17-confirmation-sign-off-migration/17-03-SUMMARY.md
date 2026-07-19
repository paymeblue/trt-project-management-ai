---
phase: 17-confirmation-sign-off-migration
plan: 03
subsystem: workflow-engine
tags: [nextjs, server-components, drizzle, workflow-engine, migration-cutover]

# Dependency graph
requires:
  - phase: 17-confirmation-sign-off-migration (plan 01)
    provides: getLiveWorkflowSteps() adapter, pure findStep/lastStepN/projectComplete helpers, corrected live graph edges, verify-live-workflow.ts
provides:
  - app/(app)/checklists/[slug]/page.tsx workflow-context gate resolving steps via getLiveWorkflowSteps() + findStep
  - app/(app)/factory-pm/readiness/page.tsx same gate treatment
  - app/(app)/admin/approvals/page.tsx step display resolving via getLiveWorkflowSteps() + findStep/lastStepN
  - app/(app)/admin/timeline/page.tsx current-step label, X/lastStepN, completion state, history, and act-href all resolving via getLiveWorkflowSteps() + findStep/lastStepN/projectComplete
affects: [17-04, 17-05, 17-06 (remaining Phase 17 plans cutting client/layout consumers and retiring the legacy array)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cutover-then-verify (continued from 17-02): each server-rendered page swapped its legacy stepByN/LAST_STEP/isProjectComplete reads for getLiveWorkflowSteps() + the pure array-argument helpers from plan 01, one file at a time, re-running npx tsc --noEmit + targeted greps after each swap"
    - "Local display-only constants derived from lastStepN(steps) are named in camelCase (e.g. lastStep), never re-using the legacy LAST_STEP identifier — keeps the plan's own literal grep-based verification (no LAST_STEP string anywhere) unambiguous and avoids a false negative on a same-named local variable"

key-files:
  created: []
  modified:
    - "app/(app)/checklists/[slug]/page.tsx"
    - "app/(app)/factory-pm/readiness/page.tsx"
    - "app/(app)/admin/approvals/page.tsx"
    - "app/(app)/admin/timeline/page.tsx"

key-decisions:
  - "Named the approvals/timeline pages' local lastStepN(steps) result lastStep (not LAST_STEP) to avoid re-introducing the literal string the plan's own verification grep checks for, while keeping the value's meaning identical to the legacy module constant"

requirements-completed: [WF-06]

# Metrics
duration: ~10min
completed: 2026-07-09
---

# Phase 17 Plan 03: Cut over step-gating server pages to the live workflow graph Summary

**The checklist launcher, factory readiness launcher, admin approvals queue, and admin timeline now all resolve workflow steps from `getLiveWorkflowSteps()` + the pure `findStep`/`lastStepN`/`projectComplete` helpers instead of the hardcoded `stepByN`/`LAST_STEP`/`isProjectComplete`, with every gate branch, notice string, and display format preserved byte-for-byte (confirmed via the plan-01 PARITY harness, `tsc`, `next build`, and the existing test suite).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-09T16:00:00+01:00
- **Completed:** 2026-07-09T16:10:00+01:00
- **Tasks:** 2 completed
- **Files modified:** 4 (`app/(app)/checklists/[slug]/page.tsx`, `app/(app)/factory-pm/readiness/page.tsx`, `app/(app)/admin/approvals/page.tsx`, `app/(app)/admin/timeline/page.tsx`)

## Accomplishments
- `app/(app)/checklists/[slug]/page.tsx`: the workflow-context gate (slug match, `proj.currentStep !== stepN` with the `>`/`<` wording branches, `canRoleActOnStep` turn check) now resolves its target step via `findStep(await getLiveWorkflowSteps(), stepN)` instead of `stepByN(stepN)`; every notice branch and the `workflowProjectId`/`workflowStepN` success assignment is unchanged.
- `app/(app)/factory-pm/readiness/page.tsx`: identical treatment — same gate shape, same notice branches, `step.kind !== 'readiness'` check preserved.
- `app/(app)/admin/approvals/page.tsx`: the pending bypass queue's `Step N/lastStepN: label · role` display now resolves via `findStep(steps, r.stepN)` + `lastStepN(steps)` (fetched once, outside the row map), with the local display variable named `lastStep` to avoid colliding with the plan's own legacy-reference grep check.
- `app/(app)/admin/timeline/page.tsx`: current-step label (`label · N/lastStepN`), completion state (`projectComplete(p.currentStep, lastStep)`), per-project history labels, `canRoleActOnStep`, and `stepHref` act-href all resolve from the same `steps`/`lastStep` fetched once per request; `stepByN`/`LAST_STEP`/`isProjectComplete` imports fully removed.
- Re-ran `npm run verify:live-workflow` after the cutover: PARITY (12/12) and both JOIN orders (4/4 each) still pass — the adapter these four pages now depend on is byte-identical to the legacy array, which is the formal proof that every gate/display in this plan renders identically for any real `currentStep`/`stepN` value.
- `npx next build` compiles all four routes (`/checklists/[slug]`, `/factory-pm/readiness`, `/admin/approvals`, `/admin/timeline`) plus the full route tree with zero TypeScript errors.
- `npm test` — 74 tests + 1 todo pass (unchanged from pre-plan baseline; this plan touched no test-covered logic, only server-page step resolution).

## Task Commits

Each task was committed atomically:

1. **Task 1: Cut over the checklist + factory readiness launchers** - `2358f0d` (feat)
2. **Task 2: Cut over the admin approvals + timeline pages** - `8ddad0a` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/(app)/checklists/[slug]/page.tsx` - Workflow-context gate resolves the target step via `findStep(await getLiveWorkflowSteps(), stepN)`; `stepByN` import removed.
- `app/(app)/factory-pm/readiness/page.tsx` - Same gate treatment; `stepByN` import removed.
- `app/(app)/admin/approvals/page.tsx` - Step display resolves via `findStep(steps, r.stepN)` / `lastStepN(steps)`; `stepByN`/`LAST_STEP` imports removed.
- `app/(app)/admin/timeline/page.tsx` - Current-step label, completion flag, history labels, act-href gate all resolve via `getLiveWorkflowSteps()` + `findStep`/`lastStepN`/`projectComplete`; `stepByN`/`LAST_STEP`/`isProjectComplete` imports removed; `canRoleActOnStep`/`stepHref` untouched.

## Decisions Made
- Named the local `lastStepN(steps)` result `lastStep` (not `LAST_STEP`) in both the approvals and timeline pages, so the plan's literal grep-based verification (`! grep -q "...LAST_STEP..."`) correctly confirms the legacy module-level constant is gone, rather than false-passing on a same-named local variable that happens to hold the identical value.

## Deviations from Plan

None - plan executed exactly as written. The only adjustment (naming the local `lastStepN` result `lastStep` instead of `LAST_STEP`) was necessary to satisfy the plan's own stated verification command literally, not a behavior change — the value and its use are identical to what the plan specified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Ran directly against the existing `.env.local` `DATABASE_URL`.

## Next Phase Readiness
- All four step-gating server pages (`checklists/[slug]`, `factory-pm/readiness`, `admin/approvals`, `admin/timeline`) no longer reference `stepByN`/`LAST_STEP`/`isProjectComplete`/`WORKFLOW_STEPS`.
- `npm run verify:live-workflow` still passes (PARITY 12/12, both JOIN orders 4/4) after this plan's caller cutover.
- `npm test` (74 passed + 1 todo) and `npx next build` (all routes compile) both clean post-cutover.
- Ready for 17-04 (`WorkflowStepsProvider` + layout wire + flow diagram on the DB) — the remaining server-rendered consumers of the legacy array are now confined to client-side/provider-layer code and the flow diagram, plus the legacy array itself in `lib/workflow.ts` (still present for the not-yet-migrated 17-04/17-05/17-06 callers).
- No blockers.

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: app/(app)/checklists/[slug]/page.tsx
- FOUND: app/(app)/factory-pm/readiness/page.tsx
- FOUND: app/(app)/admin/approvals/page.tsx
- FOUND: app/(app)/admin/timeline/page.tsx
- FOUND: .planning/phases/17-confirmation-sign-off-migration/17-03-SUMMARY.md
- FOUND: commit 2358f0d (feat(17-03): cut over checklist + readiness launchers to live graph)
- FOUND: commit 8ddad0a (feat(17-03): cut over admin approvals + timeline to live graph)
</content>
