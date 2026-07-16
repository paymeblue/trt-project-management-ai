---
phase: quick-260716-g5l
plan: 01
subsystem: workflow
tags: [drizzle, postgres, authorization, race-condition, onConflictDoUpdate]

# Dependency graph
requires:
  - phase: quick-260716-djj
    provides: submitChecklistAction's canActOnGraphStep auth-gate pattern, mirrored here for readiness
provides:
  - Server-side authorization gate on submitReadinessAction for step-linked submissions
  - Atomic array_append-CASE upsert in confirmDualRoleStepAs, eliminating the dual-confirmation lost-update race
affects: [readiness, workflow-graph, materials_readiness step 17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Step-linked server action submissions gate via getLiveWorkflowSteps() + findStep() + canActOnGraphStep() before any DB write (mirrors actions/checklists.ts)"
    - "Dual-role/multi-writer array columns use a single onConflictDoUpdate with a parameterized sql\`CASE WHEN ... THEN ... ELSE array_append(...) END\` fragment instead of SELECT-then-JS-push-then-write, to stay atomic under concurrent writers"

key-files:
  created: []
  modified:
    - actions/readiness.ts
    - actions/workflow.ts
    - tests/actions/readiness.test.ts
    - tests/actions/workflow.test.ts

key-decisions:
  - "Readiness auth gate placed after all client-input validation (photos/signature) but before the DB insert, so validation errors still surface first and no partial state is ever written for an unauthorized caller"
  - "confirmDualRoleStepAs's array_append upsert reads confirmedRoles back via .returning() instead of trusting the values passed in, so the allConfirmed check always reflects the DB's authoritative post-write state"
  - "Test mock's insert() dispatches to a workflowStepStates-specific mock via a structural check (confirmedRoles column presence) rather than object identity, because vi.resetModules() in beforeEach makes every dynamic import of @/actions/workflow pull a fresh @/db/schema instance, breaking identity comparison against the test file's stale top-level import"

requirements-completed: [QUICK-260716-g5l]

# Metrics
duration: 22min
completed: 2026-07-16
---

# Quick Task 260716-g5l: Materials Readiness Dual-Confirmation Reliability Fix Summary

**Server-side authorization gate on submitReadinessAction plus an atomic array_append-CASE upsert in confirmDualRoleStepAs, closing an unauthorized-write hole and a lost-update race on workflow step 17 (materials/delivery readiness).**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-16T10:52:00Z
- **Completed:** 2026-07-16T11:14:00Z
- **Tasks:** 3 (2 code tasks + 1 verification sweep)
- **Files modified:** 4

## Accomplishments
- `submitReadinessAction` now rejects a step-linked submission from a role not authorized for the live workflow step (via `getLiveWorkflowSteps` + `findStep` + `canActOnGraphStep`), persisting zero DB rows on rejection — mirrors the fix already shipped for checklists in quick task 260716-djj.
- A `dualRoles`-authorized non-primary role (e.g. `site_pm` on the merged Materials/Delivery Readiness step) can still submit, since `canActOnGraphStep` honors both the step's primary `role` and its `dualRoles`.
- `confirmDualRoleStepAs` no longer does a SELECT-then-JS-array-push-then-upsert; it now does a single atomic `onConflictDoUpdate` with a parameterized `sql` CASE/`array_append` expression, so two simultaneous confirmations (factory_pm and site_pm submitting at the same moment) can no longer silently lose one caller's confirmation to a stale overwrite.
- The last dual-role confirmation still correctly advances `projects.currentStep`; earlier ones remain no-ops on project advancement while still persisting partial progress.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add authorization gate to submitReadinessAction + tests** - `0f4fb6e` (feat)
2. **Task 2: Make confirmDualRoleStepAs atomic + tests** - `d2684a3` (fix)
3. **Task 3: Full-suite verification sweep** - no source changes (verification only, no commit)

## Files Created/Modified
- `actions/readiness.ts` - Added the `canActOnGraphStep` authorization gate for step-linked submissions, resolved via `getLiveWorkflowSteps`/`findStep`.
- `actions/workflow.ts` - Replaced `confirmDualRoleStepAs`'s SELECT+JS-push+upsert with a single atomic `array_append` CASE upsert, read back via `.returning()`.
- `tests/actions/readiness.test.ts` - Added `getLiveWorkflowSteps` mock + 3 new tests (unauthorized role rejected with zero writes, dualRoles non-primary role succeeds, non-step-linked submission unaffected).
- `tests/actions/workflow.test.ts` - Restructured the `insert` mock to be table-aware (structural `confirmedRoles`-column check, not object identity) and added a `confirmDualRoleStepAs` describe block covering first confirmation (no advance), second/completing confirmation (advances to step 18), and unauthorized-role rejection.

## Decisions Made
- The readiness auth gate is placed after photo/signature validation but before the DB insert — matches the existing validation-then-persist ordering in the file and keeps client-facing validation errors first.
- `confirmedRoles` after the upsert is read from the DB via `.returning()` rather than assumed from the input `role`, so the `allConfirmed` check is always driven by the authoritative post-write row, not a value computed before the write landed.
- The test mock dispatches `db.insert(table)` to a `workflowStepStates`-specific mock using a structural check (`'confirmedRoles' in table`) instead of `table === workflowStepStates` object identity — `vi.resetModules()` in `beforeEach` causes `@/actions/workflow`'s dynamic import to pull a fresh `@/db/schema` module instance per test, so the test file's static top-level import of `workflowStepStates` is a different object identity by the time the mock function actually runs. This was found and fixed during Task 2 (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock's table-identity check failed due to module-reload semantics**
- **Found during:** Task 2 (workflow.test.ts mock restructuring)
- **Issue:** The plan's specified mock shape (`insert: (table) => table === workflowStepStates ? ... : ...`, comparing against a top-level `import { workflowStepStates } from '@/db/schema'`) failed at runtime with `db.insert(...).values(...).onConflictDoUpdate is not a function`. Root cause: `beforeEach` calls `vi.resetModules()`, so every dynamic `await import('@/actions/workflow')` in a test re-evaluates `@/db/schema` as a brand-new module instance; the table object `actions/workflow.ts` passes to `db.insert()` is therefore never `===` the test file's stale top-level `workflowStepStates` binding.
- **Fix:** Switched the branch condition to a structural check — `table && typeof table === 'object' && 'confirmedRoles' in table` — since `confirmedRoles` is a column unique to `workflowStepStates` among this file's insert targets (`projectStepCompletions` has no such column), and pgTable's column shape is preserved across module reloads even though object identity isn't. Removed the now-unused top-level `workflowStepStates` import from the test file to avoid an unused-import lint/tsc error.
- **Files modified:** tests/actions/workflow.test.ts
- **Verification:** `npx vitest run tests/actions/workflow.test.ts` — all 9 tests pass, including the 6 pre-existing `advanceProjectStep` tests unmodified in behavior.
- **Committed in:** d2684a3 (Task 2 commit)

**2. [Rule 1 - Bug] TS2339/TS2493 on `onConflictDoUpdateMock.mock.calls[0][0]` destructure**
- **Found during:** Task 3 (tsc verification sweep) — actually caught before Task 3 during local `npx tsc --noEmit` re-check after Task 2's test additions, but documented here since it's part of the same test-mock work.
- **Issue:** `vi.fn(() => ({ returning: returningMock }))` (no-arg implementation) caused TypeScript to infer the mock's call-argument tuple as `[]`, so `.mock.calls[0][0]` in the new "records the first confirmation atomically" test failed to typecheck (`set` destructure error).
- **Fix:** Gave the mock implementation an explicit parameter type — `vi.fn((_opts: { target: unknown[]; set: Record<string, unknown> }) => ({ returning: returningMock }))` — so `.mock.calls[0][0]` resolves to the correct shape.
- **Files modified:** tests/actions/workflow.test.ts
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** d2684a3 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — blocking bugs in the test-mock scaffolding, not the shipped `actions/*.ts` source). No scope creep; both fixes were required to make Task 2's own required test coverage runnable and typecheck-clean.

## Issues Encountered
None beyond the two auto-fixed test-mock issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both reliability gaps on workflow step 17 (materials_readiness / dual-confirmation) are closed: unauthorized step-linked readiness submissions are rejected server-side with zero DB writes, and two simultaneous dual-role confirmations can no longer race and lose an update.
- Full verification sweep (`npx tsc --noEmit && npm run lint && npx vitest run`) is green: 16 test files, 136 tests passed, 1 pre-existing todo, 0 lint errors (1 pre-existing unrelated warning in `app/layout.tsx`, 1 new low-risk warning in the test mock's unused `_opts` param).
- No follow-up work identified for this fix; no blockers for other in-flight quick tasks.

---
*Phase: quick-260716-g5l*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: actions/readiness.ts
- FOUND: actions/workflow.ts
- FOUND: tests/actions/readiness.test.ts
- FOUND: tests/actions/workflow.test.ts
- FOUND: .planning/quick/260716-g5l-fix-materials-readiness-dual-confirmatio/260716-g5l-SUMMARY.md
- FOUND commit: 0f4fb6e
- FOUND commit: d2684a3
