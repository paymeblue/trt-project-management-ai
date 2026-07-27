---
phase: quick-260727-g7a
plan: 01
subsystem: auth
tags: [workflow-engine, authorization, drizzle, vitest, position-gate]

requires:
  - phase: quick-260714-bpq
    provides: renameable-positions table (users.position free text, positions table for slug+label)
provides:
  - "Shared server-side position gate (stepPositionMismatch + POSITION_MISMATCH_MESSAGE) consulted by BOTH engines"
  - "Legacy engine (checklist/readiness/ack sole-kind steps) now enforces requiredPosition — previously silently ignored it"
  - "Anti-stranding pre-submit gates on checklist/readiness pages + submit actions"
affects: [workflow, workflow-graph, checklists, readiness, position-authorization]

tech-stack:
  added: []
  patterns:
    - "Fresh-from-DB position check (never session/JWT), mirrored across both engines via a shared helper instead of duplicated inline logic"
    - "Reject-above-the-insert pattern for anti-stranding: authorization check runs before any DB write, both at the page (pre-fill) and action (pre-submit) layers"

key-files:
  created: []
  modified:
    - lib/workflow-graph.ts
    - actions/workflow.ts
    - actions/checklists.ts
    - actions/readiness.ts
    - "app/(app)/checklists/[slug]/page.tsx"
    - "app/(app)/factory-pm/readiness/page.tsx"
    - tests/actions/workflow.test.ts
    - tests/actions/readiness.test.ts

key-decisions:
  - "POSITION_MISMATCH_MESSAGE duplicated (not imported) from actions/workflow-graph.ts's ENGINE_ERROR_MESSAGES, since that module is 'use server' and every export there must be an async action — lib/workflow-graph.ts is the correct home for a plain string constant shared by both engines."
  - "actions/workflow-graph.ts (authorizeStep, the graph engine) left completely untouched — verified via empty git diff — this quick task only closes the gap on the LEGACY engine."

requirements-completed: [QT-260727-g7a]

duration: ~35min
completed: 2026-07-27
---

# Phase quick-260727-g7a: Enforce requiredPosition on Legacy Check Summary

**Closed an elevation-of-privilege hole where the legacy workflow engine (checklist/readiness/ack sole-kind steps) never consulted `workflow_step_definitions.required_position` — live step 19 `approval_installation` was actionable by any operations/super_admin account regardless of title.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 8 (2 engine files, 4 UI/action call sites, 2 test files)

## Accomplishments

- Added `stepPositionMismatch()` + `POSITION_MISMATCH_MESSAGE` to `lib/workflow-graph.ts`, mirroring the graph engine's `authorizeStep` fresh-from-DB position check, and enforced it in both legacy write paths (`advanceProjectStep`, `confirmDualRoleStepAs`) before any completion insert or project advance.
- Added anti-stranding pre-submit gates: the checklist and readiness pages now show the restriction notice BEFORE the user fills the form, and `submitChecklistAction`/`submitReadinessAction` reject the submission above their respective inserts if posted anyway.
- Added regression tests proving: wrong-position rejection with zero DB writes, correct-position pass-through unchanged, and zero extra queries when `requiredPosition` is unset (byte-identical behavior preserved for the other ~20 legacy steps).
- `actions/workflow-graph.ts` (the graph engine's `authorizeStep`) is completely untouched — confirmed via `git diff --stat` returning empty.

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared position gate + legacy-engine enforcement** - `7372600` (feat)
2. **Task 2: Pre-submit visibility (anti-stranding) on pages + submit actions** - `f15c22b` (feat)
3. **Task 3: Regression tests + full verification** - `fefc901` (test)

**Plan metadata:** (this commit, docs)

_Note: Task 3 is `tdd="true"` but was authored by the plan as regression coverage added AFTER the Task 1/2 implementation (not a literal RED-before-GREEN cycle) — see "TDD Gate Compliance" below._

## Files Created/Modified

- `lib/workflow-graph.ts` - Added `POSITION_MISMATCH_MESSAGE` constant + `stepPositionMismatch(userId, step)` async gate (zero-query short-circuit when `requiredPosition` is unset; fresh `users.position` SELECT otherwise)
- `actions/workflow.ts` - `advanceProjectStep` gates on `stepPositionMismatch` right after the role check, returning `false`; `confirmDualRoleStepAs` gates symmetrically after the `dualRoles` membership check, returning `{ ok: false, advanced: false, message: POSITION_MISMATCH_MESSAGE }`
- `actions/checklists.ts` - `submitChecklistAction`'s step-linked authorization block now rejects a position mismatch above the `checklists` insert
- `actions/readiness.ts` - `submitReadinessAction`'s step-linked authorization block now rejects a position mismatch above the `readinessForms` insert
- `app/(app)/checklists/[slug]/page.tsx` - `workflowNotice` gate chain gained a `stepPositionMismatch` branch between the assignee-gate check and the success branch
- `app/(app)/factory-pm/readiness/page.tsx` - same insertion in its `workflowNotice` chain
- `tests/actions/workflow.test.ts` - new `positionStepDefRows` fixture (step 2 patched with `requiredPosition: 'head_designer'`) + `describe('requiredPosition gate (quick task 260727-g7a)')` blocks under both `advanceProjectStep` and `confirmDualRoleStepAs`
- `tests/actions/readiness.test.ts` - added a `stepPositionMismatch` mock (defaulting to `false`) to the file's full `@/lib/workflow-graph` mock — this file was not in the plan's `files_modified` list but broke as a direct consequence of Task 2's change to `actions/readiness.ts` (see Deviations)

## Decisions Made

- `POSITION_MISMATCH_MESSAGE` is a duplicated string constant in `lib/workflow-graph.ts`, not imported from `actions/workflow-graph.ts`'s `ENGINE_ERROR_MESSAGES` — the latter module is `'use server'`, so importing a plain constant from it is not viable; the plan called this out explicitly and it was followed as specified.
- `stepPositionMismatch` was kept as a REAL (non-mocked) function in `tests/actions/workflow.test.ts`'s partial `@/lib/workflow-graph` mock, so the new tests exercise the actual `users.position` fetch through the existing `selectLimitMock` sequencing rather than a stubbed boolean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `tests/actions/readiness.test.ts` broke after Task 2's change to `actions/readiness.ts`**
- **Found during:** Task 3's full verification suite (`npm test`)
- **Issue:** `actions/readiness.ts`'s `submitReadinessAction` now calls `stepPositionMismatch` (added in Task 2), but `tests/actions/readiness.test.ts` fully replaces `@/lib/workflow-graph` with `vi.mock('@/lib/workflow-graph', () => ({...}))` (not a partial mock via `importOriginal`), so `stepPositionMismatch` was `undefined` at call time — 5 tests failed with "No stepPositionMismatch export is defined on the mock".
- **Fix:** Added a `stepPositionMismatchMock` to the file's hoisted mocks, wired it into the `@/lib/workflow-graph` mock alongside a `POSITION_MISMATCH_MESSAGE` string, and defaulted it to `mockResolvedValue(false)` in `beforeEach` so none of the existing (non-position) test cases are affected.
- **Files modified:** `tests/actions/readiness.test.ts`
- **Verification:** `npm test` — all 37 test files / 311 tests + 1 todo pass.
- **Committed in:** `fefc901` (part of Task 3's commit)

## TDD Gate Compliance

Task 3 carries `tdd="true"`, but per the plan's own instructions the tests were written and committed AFTER Tasks 1 and 2's implementation already existed and was committed (`test(...)` commit `fefc901` lands after `feat(...)` commits `7372600`/`f15c22b`), rather than a literal test-first RED-before-GREEN cycle. This mirrors the plan's explicit task ordering (gate implementation → UI wiring → regression coverage) and the `<done>` criterion, which asks to confirm the new tests would fail "by reasoning over the assertions, not by reverting" — i.e., these are regression tests locking in already-shipped behavior, not a driver for new implementation. Confirmed by reasoning: removing the `if (await stepPositionMismatch(userId, step)) return false` line from `advanceProjectStep` would make the "rejects a right-role caller holding the WRONG position" test's `ok` assertion fail (it would return `true` and call `insertValuesMock`/`setMock`), and removing the symmetric check from `confirmDualRoleStepAs` would make its dual-role wrong-position test return `{ ok: true, advanced: false, ... }` instead of the expected rejection.

## Verification Results

1. `npx tsc --noEmit` — clean (0 errors)
2. `npm run lint` — clean (0 errors; 3 pre-existing warnings unrelated to this task: `app/layout.tsx` custom-font warning, `netlify/functions/send-call-reminders.mts` anonymous-default-export warning, and a pre-existing `_opts` unused-var warning in `tests/actions/workflow.test.ts` line 55 that predates this plan)
3. `npm test` — 37 test files, 311 passed + 1 todo (was 306 passed + 1 todo before this plan's 5 new tests)
4. `git diff --stat actions/workflow-graph.ts` — empty (graph engine untouched, confirmed after every task)
5. Diff review — every new block carries a `260727-g7a` why-comment; no unrelated edits found

## Known Stubs

None.

## Threat Flags

None — this plan closes an existing gap (T-g7a-01 through T-g7a-05 in the plan's threat register, all disposed `mitigate`) and introduces no new network endpoints, auth paths, or schema changes. `T-g7a-SC` (package-install tampering) is `n/a` — no new dependencies were added.

## Self-Check: PASSED

- FOUND: `lib/workflow-graph.ts` contains `stepPositionMismatch` / `POSITION_MISMATCH_MESSAGE`
- FOUND: `actions/workflow.ts` awaits `stepPositionMismatch` in both `advanceProjectStep` and `confirmDualRoleStepAs`
- FOUND: commit `7372600` in `git log --oneline`
- FOUND: commit `f15c22b` in `git log --oneline`
- FOUND: commit `fefc901` in `git log --oneline`
- FOUND: `git diff --stat actions/workflow-graph.ts` is empty
