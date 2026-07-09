---
phase: 17-confirmation-sign-off-migration
plan: 06
subsystem: workflow-engine
tags: [nextjs, typescript, vitest, drizzle, workflow-engine, migration-cutover]

# Dependency graph
requires:
  - phase: 17-confirmation-sign-off-migration (plan 01)
    provides: getLiveWorkflowSteps() adapter + findStep/lastStepN/projectComplete pure array-argument helpers
  - phase: 17-confirmation-sign-off-migration (plan 05)
    provides: all live callers (server + client) cut over to the DB graph; WORKFLOW_STEPS had zero remaining live consumers outside lib/workflow.ts
provides:
  - db/workflow-live-steps.ts — LIVE_WORKFLOW_STEPS, the relocated canonical 11-step seed/bootstrap data
  - lib/workflow.ts — client-safe module with only pure helpers, types, and role/label helpers (no step-data literal)
  - tests/lib/workflow-live.test.ts — structure assertions against LIVE_WORKFLOW_STEPS
  - tests/lib/workflow.test.ts — pure-helper tests retargeted at findStep/lastStepN/projectComplete
affects: [18-workflow-configurator (reads/writes graph='live' definitions this plan finalized as the sole source of truth)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed-only bootstrap modules (db/workflow-live-steps.ts) hold literal data consumed exclusively by seed/verify scripts, never imported by app runtime code — enforced by the compiler once the app-facing literal is deleted"

key-files:
  created:
    - db/workflow-live-steps.ts
    - tests/lib/workflow-live.test.ts
  modified:
    - lib/workflow.ts
    - lib/workflow-graph.ts
    - db/seed-workflow-graph.ts
    - scripts/verify-live-workflow.ts
    - tests/lib/workflow.test.ts
    - tests/actions/workflow.test.ts

key-decisions:
  - "tests/actions/workflow.test.ts (not listed in the plan's files_modified) also imported WORKFLOW_STEPS to build mock DB rows; retargeted its import to LIVE_WORKFLOW_STEPS from db/workflow-live-steps.ts as a Rule-3 blocking fix, since tsc --noEmit fails project-wide otherwise"
  - "lib/workflow-graph.ts's LiveWorkflowStep doc comment referenced the now-deleted WORKFLOW_STEPS literal; updated wording to describe the array-based WorkflowStep shape generically instead of naming the removed export"

requirements-completed: [WF-06]

# Metrics
duration: ~30min
completed: 2026-07-09
---

# Phase 17 Plan 06: Retire the Literal + Relocate Seed Data + Tests Summary

**The hardcoded 11-step `WORKFLOW_STEPS` array, `LAST_STEP`, and legacy `stepByN`/`isProjectComplete` are deleted from `lib/workflow.ts`; the canonical step data now lives only in `db/workflow-live-steps.ts` as seed/bootstrap data, consumed by the seed script and the verification harness — zero app-runtime import of the literal remains, and human verification confirms zero visual/behavioral regression on real projects.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 of 3 complete
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- Created `db/workflow-live-steps.ts` exporting `LIVE_WORKFLOW_STEPS` — the 11-step array relocated verbatim from `lib/workflow.ts`, typed via `WorkflowStep` imported from `@/lib/workflow`.
- `db/seed-workflow-graph.ts` and `scripts/verify-live-workflow.ts` now import `LIVE_WORKFLOW_STEPS` from the seed-data module instead of `WORKFLOW_STEPS` from `lib/workflow.ts`.
- Deleted `WORKFLOW_STEPS`, `LAST_STEP`, `stepByN`, and `isProjectComplete` from `lib/workflow.ts`. Kept `FIRST_ACTION_STEP` (already a plain literal, no change needed), all types (`WorkflowStep`, `WorkflowRole`, `StepKind`, `GraphStep`, `UserRole`), `Roles`, `findStep`/`lastStepN`/`projectComplete`, and every role/label helper (`workflowRoleLabel`, `userRoleLabel`, `roleDashboard`, `isAdminRole`, `canEditChecklist`, `canRoleActOnStep`, `stepHref`, `graphStepHref`, `REQUIRED_PHOTOS`). `lib/workflow.ts` remains free of any server-only import.
- Rewrote `tests/lib/workflow.test.ts`: pure-helper tests (`canRoleActOnStep`, `stepHref`, `workflowRoleLabel`, `userRoleLabel`, `roleDashboard`, `isAdminRole`, `canEditChecklist`, `REQUIRED_PHOTOS`) now use `findStep(LIVE_WORKFLOW_STEPS, n)` / `lastStepN(LIVE_WORKFLOW_STEPS)` / `projectComplete(x, lastN)` in place of the deleted `stepByN`/`LAST_STEP`/`isProjectComplete`.
- Created `tests/lib/workflow-live.test.ts` holding the structure assertions (11 steps in order, exact key/role order, sign_off is step 11 super_admin ack, materials_readiness is the first factory_pm step, no design/production step) targeting `LIVE_WORKFLOW_STEPS`.
- Fixed `tests/actions/workflow.test.ts` (not in the plan's file list, discovered during Task 1's `tsc` check) — it also imported `WORKFLOW_STEPS` to build mock `workflowStepDefinitions` rows; retargeted to `LIVE_WORKFLOW_STEPS`.
- Fixed a stale doc comment in `lib/workflow-graph.ts` (`LiveWorkflowStep` type) that referenced the deleted `WORKFLOW_STEPS` name.
- `npx tsc --noEmit` clean. `npm test`: 10 test files, 76 passed + 1 todo. `npm run db:seed-workflow-graph` re-run clean: 11 defs + 11 edges (unchanged from prior seeds).
- Grep confirms zero remaining `WORKFLOW_STEPS`/`LAST_STEP` references anywhere in `app/`, `lib/`, `actions/` (only `LIVE_WORKFLOW_STEPS` and historical comments in the new seed-data module remain).

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate seed data + delete the literal from lib/workflow.ts** - `1188663` (feat)
2. **Task 2: Update tests + prove zero remaining literal references** - `23da515` (test)
3. **Task 3: Before/after zero-regression verification of real projects** - `4d84029` (docs — human-verify checkpoint approved by orchestrator; no code changes)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `db/workflow-live-steps.ts` - NEW. Exports `LIVE_WORKFLOW_STEPS: WorkflowStep[]`, the canonical 11-step bootstrap data, consumed only by the seed script and verify harness.
- `lib/workflow.ts` - Removed `WORKFLOW_STEPS`, `LAST_STEP`, `stepByN`, `isProjectComplete`; kept every other export; still client-safe.
- `lib/workflow-graph.ts` - Updated a stale doc comment referencing the deleted `WORKFLOW_STEPS` name (no behavior change).
- `db/seed-workflow-graph.ts` - Imports `LIVE_WORKFLOW_STEPS` from `./workflow-live-steps` instead of `WORKFLOW_STEPS` from `../lib/workflow`.
- `scripts/verify-live-workflow.ts` - Repointed the parity reference import to `LIVE_WORKFLOW_STEPS` from `../db/workflow-live-steps`.
- `tests/lib/workflow.test.ts` - Pure-helper tests rewritten against `findStep`/`lastStepN`/`projectComplete` + `LIVE_WORKFLOW_STEPS`.
- `tests/lib/workflow-live.test.ts` - NEW. Structure assertions (11 steps, order, sign_off, materials_readiness, no design/production step) against `LIVE_WORKFLOW_STEPS`.
- `tests/actions/workflow.test.ts` - Retargeted mock-row-building import from `WORKFLOW_STEPS` to `LIVE_WORKFLOW_STEPS`.

## Decisions Made
- `tests/actions/workflow.test.ts`'s import was not in the plan's `files_modified` list but broke compilation the instant `WORKFLOW_STEPS` was deleted (it built mock DB rows from the array). Fixed as a Rule 3 (blocking issue) auto-fix rather than treating it as scope creep — the plan's own Task 1 verification (`npx tsc --noEmit`) cannot pass without it.
- Kept the `FIRST_ACTION_STEP` definition as-is (`export const FIRST_ACTION_STEP = 2`) since it was already a plain literal, not derived from `WORKFLOW_STEPS` — no redefinition needed as anticipated in the plan's action text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tests/actions/workflow.test.ts's broken WORKFLOW_STEPS import**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** This test file (outside the plan's `files_modified` list) imported `WORKFLOW_STEPS` from `@/lib/workflow` to build mock `workflowStepDefinitions.$inferSelect`-shaped rows; deleting the literal broke its compilation.
- **Fix:** Changed the import to `LIVE_WORKFLOW_STEPS` from `@/db/workflow-live-steps` and renamed the local `liveStepDefRows` derivation accordingly; updated the adjacent comment.
- **Files modified:** `tests/actions/workflow.test.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm test` — all 10 test files pass (76 passed + 1 todo).
- **Committed in:** `1188663` (Task 1 commit)

**2. [Rule 1 - Bug/doc accuracy] Fixed stale WORKFLOW_STEPS reference in lib/workflow-graph.ts comment**
- **Found during:** Task 1 grep sweep
- **Issue:** `LiveWorkflowStep`'s doc comment described itself as standing in for "the hardcoded WORKFLOW_STEPS array," which no longer exists after this plan.
- **Fix:** Reworded to describe the array-based `WorkflowStep` shape generically, without naming the removed export.
- **Files modified:** `lib/workflow-graph.ts`
- **Verification:** Comment-only change; `npx tsc --noEmit` unaffected.
- **Committed in:** `1188663` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 doc accuracy)
**Impact on plan:** Both fixes were necessary for Task 1's own verification command to pass. No scope creep — no other files touched beyond what compilation required.

## Issues Encountered
None beyond the two auto-fixes above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

All three tasks complete. Task 3's human-verify checkpoint was approved by the orchestrator, who signed in as Super Admin against the real dev server and real DB data and confirmed:
- Header project switcher: "Usuma — Step 5/11: Delivery Project Checklist · Factory PM" — correct.
- `/admin/timeline`: "Test" project shows "Materials / Accessories Readiness · 3/11 · Waiting on Factory PM"; "Usuma" shows "Delivery Project Checklist · 5/11 · Waiting on Factory PM"; "Bilaad Test Project" and "My ShowRoom" both show "Delivered" — all match expected pre-migration currentStep values (3, 5, 12, 12) exactly; no project's currentStep changed.
- `/about`: flow diagram renders all 11 steps in original order, labels/roles/blurbs word-for-word identical to the old hardcoded DETAIL map; Roles organogram shows all 6 roles.
- `/admin/projects/new`: 11 per-step deadline date-picker groups render correctly.

No drift found. WF-06 is fully satisfied: the hardcoded array is retired, the DB graph is the sole source of truth via `getLiveWorkflowSteps()`/`useWorkflowSteps()`, the delivery parallel/join is native and verified, and pre-/post-migration projects behave identically (human-approved).

**Phase 17 (Confirmation → Sign Off Migration) is complete** — all 6 plans done, ROADMAP.md and REQUIREMENTS.md updated accordingly. Ready for Phase 18 (Workflow Configurator).

No blockers.

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: db/workflow-live-steps.ts
- FOUND: tests/lib/workflow-live.test.ts
- FOUND: .planning/phases/17-confirmation-sign-off-migration/17-06-SUMMARY.md
- FOUND: commit 1188663 (feat(17-06): relocate seed data + delete WORKFLOW_STEPS literal from lib/workflow.ts)
- FOUND: commit 23da515 (test(17-06): retarget workflow tests at LIVE_WORKFLOW_STEPS and surviving helpers)
- FOUND: commit 4d84029 (docs(17-06): document Tasks 1-2 completion, Task 3 checkpoint pending)
