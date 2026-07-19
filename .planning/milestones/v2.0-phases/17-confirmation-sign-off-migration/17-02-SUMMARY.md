---
phase: 17-confirmation-sign-off-migration
plan: 02
subsystem: workflow-engine
tags: [drizzle, postgres, server-actions, workflow-engine, migration-cutover]

# Dependency graph
requires:
  - phase: 17-confirmation-sign-off-migration (plan 01)
    provides: getLiveWorkflowSteps() adapter, pure findStep/lastStepN/projectComplete helpers, corrected live graph edges, verify-live-workflow.ts
provides:
  - actions/workflow.ts advanceProjectStep/completeAckStepAction reading getLiveWorkflowSteps() instead of the legacy WORKFLOW_STEPS array
  - actions/bypass.ts requestStepBypassAction/decideStepBypassAction reading the same live graph
  - lib/my-work.ts getMyWork resolving pending/active work from the live graph
  - actions/projects.ts createProjectAction/pauseProjectAction reading the live graph
  - app/(app)/admin/analytics/page.tsx completion check on the live graph
  - Both completion-writing paths (advanceProjectStep, bypass approval) now dual-write stepDefId + graph='live' on projectStepCompletions
  - findStep widened to a generic <T extends WorkflowStep> so LiveWorkflowStep's stepDefId survives the lookup
affects: [17-03, 17-04, 17-05, 17-06 (remaining Phase 17 plans cutting client/page layers over to the graph engine)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cutover-then-verify: each server action/lib swapped its legacy stepByN/LAST_STEP/isProjectComplete/WORKFLOW_STEPS reads for getLiveWorkflowSteps() + the pure array-argument helpers from plan 01, one file at a time, re-running npx tsc --noEmit + targeted greps after each swap before moving to the next"
    - "Additive dual-write: completion-writing paths (advanceProjectStep, bypass approval) now record stepDefId + graph='live' alongside the existing stepKey/stepN columns — the integer currentStep remains the sole behavioral source of truth, so this is a pure audit-trail enrichment, not a behavior change"

key-files:
  created: []
  modified:
    - actions/workflow.ts
    - actions/bypass.ts
    - lib/my-work.ts
    - actions/projects.ts
    - app/(app)/admin/analytics/page.tsx
    - lib/workflow.ts
    - tests/actions/workflow.test.ts

key-decisions:
  - "Widened findStep's signature to a generic <T extends WorkflowStep>(steps: T[], n: number): T | undefined instead of a fixed WorkflowStep return type — without this, calling findStep(await getLiveWorkflowSteps(), n) narrowed the result to the legacy WorkflowStep shape and dropped stepDefId, blocking the plan's own dual-write requirement. Fully backward compatible: legacy callers passing WORKFLOW_STEPS still infer T=WorkflowStep."
  - "Fixed tests/actions/workflow.test.ts's DB mock, which only supported .where().limit() — advanceProjectStep now also calls getLiveWorkflowSteps() internally, which queries via .where().orderBy(). Extended the mock to support both chains and seeded the orderBy resolution with rows derived directly from WORKFLOW_STEPS so the existing assertions (step 2/10/11 role gates and boundary) continue to exercise the same steps as before."

requirements-completed: [WF-06]

# Metrics
duration: ~5min
completed: 2026-07-09
---

# Phase 17 Plan 02: Cut over server actions/libs to the live workflow graph Summary

**advanceProjectStep, bypass approval, getMyWork, createProjectAction/pauseProjectAction, and the analytics page all now resolve workflow steps from `getLiveWorkflowSteps()` instead of the hardcoded `WORKFLOW_STEPS` array, with byte-identical behavior confirmed against the 4 real projects and both completion-writing paths now dual-writing `stepDefId`/`graph='live'`.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-09T15:43:00+01:00
- **Completed:** 2026-07-09T15:46:44+01:00
- **Tasks:** 2 completed
- **Files modified:** 7 (`actions/workflow.ts`, `actions/bypass.ts`, `lib/my-work.ts`, `actions/projects.ts`, `app/(app)/admin/analytics/page.tsx`, `lib/workflow.ts`, `tests/actions/workflow.test.ts`)

## Accomplishments
- `actions/workflow.ts`: `advanceProjectStep` and `completeAckStepAction` now resolve steps via `getLiveWorkflowSteps()` + `findStep`/`lastStepN` instead of `stepByN`/`LAST_STEP`; `+1` advancement and the `nextStep > lastStepN` completion boundary (11) are unchanged. The completion insert now also writes `stepDefId`/`graph: 'live'`.
- `actions/bypass.ts`: `requestStepBypassAction` and `decideStepBypassAction` cut over the same way; the approval completion insert also writes `stepDefId`/`graph: 'live'`. Every guard (paused, `currentStep === stepN`, not-complete, role gate) preserved verbatim.
- `lib/my-work.ts`: `getMyWork` resolves `steps = await getLiveWorkflowSteps()` once per call and uses `projectComplete`/`findStep` in place of `isProjectComplete`/`stepByN`; paused filter, per-step deadline lookup, and pending sort are untouched.
- `actions/projects.ts`: `createProjectAction`'s deadline-parsing loop iterates `await getLiveWorkflowSteps()` instead of the `WORKFLOW_STEPS` literal (keeping the `FIRST_ACTION_STEP` skip and ordering validation identical); `pauseProjectAction`'s complete-check now uses `projectComplete(proj.currentStep, lastStepN(await getLiveWorkflowSteps()))`.
- `app/(app)/admin/analytics/page.tsx`: the `complete` flag now resolves via `projectComplete(p.currentStep, lastStepN(steps))` (fetched alongside the existing parallel queries), keeping the `|| p.status === 'delivered'` fallback.
- Re-ran `npm run verify:live-workflow` after the cutover: PARITY (12/12) and both JOIN orders (4/4 each) still pass, confirming the adapter itself is unaffected by these caller changes.
- Read-only spot-check of the real `projects` table post-cutover: all 4 real projects (`currentStep` 3, 5, 12, 12) are byte-identical to the pre-plan-01 baseline — no row was mutated by this plan.
- Read-only exercise of the cut-over `getMyWork` against real data confirmed step 3 (materials_readiness) and step 5 (delivery_project) both correctly resolve as `factory_pm`-pending and are excluded from `site_pm`/`super_admin`/`operations` pending, matching the legacy role gates exactly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cut over advanceProjectStep + bypass approval (with stepDefId dual-write)** - `3247114` (feat)
2. **Task 2: Cut over getMyWork, createProjectAction, and analytics page** - `c38cea2` (feat)
3. **Test-mock fix (Rule 3 - blocking issue caused by Task 1)** - `cba1a7e` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `actions/workflow.ts` - `advanceProjectStep`/`completeAckStepAction` read `getLiveWorkflowSteps()`; completion insert dual-writes `stepDefId`/`graph`.
- `actions/bypass.ts` - `requestStepBypassAction`/`decideStepBypassAction` read the live graph; approval completion insert dual-writes `stepDefId`/`graph`.
- `lib/my-work.ts` - `getMyWork` resolves active/pending work from `getLiveWorkflowSteps()` + pure helpers.
- `actions/projects.ts` - `createProjectAction` deadline loop and `pauseProjectAction` complete-check read the live graph.
- `app/(app)/admin/analytics/page.tsx` - completion flag resolved via `projectComplete`/`lastStepN` on `getLiveWorkflowSteps()`.
- `lib/workflow.ts` - `findStep` widened to a generic `<T extends WorkflowStep>` (additive signature change; legacy callers unaffected).
- `tests/actions/workflow.test.ts` - DB mock extended to support `.where().orderBy()` (used by `getGraphSteps`) alongside the existing `.where().limit()` chain; seeded with rows derived from `WORKFLOW_STEPS`.

## Decisions Made
- Widened `findStep`'s return type to be generic over its input array element type, rather than adding a second, near-duplicate helper — this is the minimal change that lets a `LiveWorkflowStep[]` caller get `stepDefId` back out of the lookup, and is fully backward compatible with existing `WORKFLOW_STEPS`-based callers (none exist for `findStep` yet, so no ripple).
- Fixed the pre-existing `tests/actions/workflow.test.ts` DB mock (not itself a plan file, but broken as a direct, in-scope consequence of Task 1's change) rather than leaving 4 tests red — the plan's own `<verification>` section requires `npm test` to still pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened `findStep` to a generic so `stepDefId` survives the lookup**
- **Found during:** Task 1 (`npx tsc --noEmit` after cutting over `actions/workflow.ts`/`actions/bypass.ts`)
- **Issue:** `findStep`'s declared signature (`(steps: WorkflowStep[], n: number): WorkflowStep | undefined`) narrowed its return type to the legacy shape even when passed a `LiveWorkflowStep[]`, so `step.stepDefId` (needed for the plan's required dual-write) was a TS2339 compile error.
- **Fix:** Changed the signature to `findStep<T extends WorkflowStep>(steps: T[], n: number): T | undefined`.
- **Files modified:** `lib/workflow.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm test` unaffected (helper behavior identical, only the type signature changed).
- **Committed in:** `3247114` (Task 1 commit)

**2. [Rule 3 - Blocking] Updated `tests/actions/workflow.test.ts`'s DB mock for the new query shape**
- **Found during:** `npm test` after Task 1
- **Issue:** `advanceProjectStep` now internally calls `getLiveWorkflowSteps()`, which queries `workflow_step_definitions` via `.where().orderBy(...)`. The test's `db` mock only implemented `.where().limit(...)` (for the project-row lookup), so 4 of the 5 `advanceProjectStep` tests failed with `orderBy is not a function`.
- **Fix:** Extended the mock's `where()` return to expose both `limit` and `orderBy`, and seeded `orderBy`'s resolution with rows shaped like `workflowStepDefinitions.$inferSelect`, derived directly from the legacy `WORKFLOW_STEPS` array (same n/key/role/kind/slug the assertions already depend on).
- **Files modified:** `tests/actions/workflow.test.ts`
- **Verification:** `npm test` — all 74 tests + 1 todo pass (was 4 failing).
- **Committed in:** `cba1a7e` (separate fix commit, after Task 2)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues directly caused by this plan's own changes)
**Impact on plan:** Both fixes were necessary to satisfy the plan's own stated verification (`npx tsc --noEmit` clean, `npm test` passing). No scope creep — neither fix touches behavior outside what the plan required.

## Issues Encountered
None beyond the two auto-fixed blocking issues above.

## User Setup Required
None - no external service configuration required. Ran directly against the existing `.env.local` `DATABASE_URL`.

## Next Phase Readiness
- The advancement core, bypass approval, my-work computation, project creation/pause, and analytics all resolve workflow steps from the DB graph — the five server-side files this plan targeted (`lib/my-work.ts`, `actions/workflow.ts`, `actions/bypass.ts`, `actions/projects.ts`, `app/(app)/admin/analytics/page.tsx`) no longer reference `stepByN`/`LAST_STEP`/`isProjectComplete`/`WORKFLOW_STEPS`.
- `npm run verify:live-workflow` still passes (PARITY 12/12, both JOIN orders 4/4) — the adapter proven in plan 01 is unaffected by this plan's caller cutover.
- Real project data (`currentStep` 3, 5, 12, 12) confirmed byte-identical before and after this plan; `getMyWork` spot-checked against real rows to return the same pending/active sets the legacy array would have produced.
- Ready for 17-03 (step-gating server pages: checklist, readiness, approvals, timeline) — those pages can now follow the same cutover pattern established here.
- No blockers.

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: actions/workflow.ts
- FOUND: actions/bypass.ts
- FOUND: lib/my-work.ts
- FOUND: actions/projects.ts
- FOUND: app/(app)/admin/analytics/page.tsx
- FOUND: lib/workflow.ts
- FOUND: tests/actions/workflow.test.ts
- FOUND: commit 3247114 (feat(17-02): cut over advanceProjectStep + bypass approval to live graph)
- FOUND: commit c38cea2 (feat(17-02): cut over getMyWork, createProjectAction, and analytics to live graph)
- FOUND: commit cba1a7e (fix(17-02): update advanceProjectStep test DB mock for live-graph query shape)
