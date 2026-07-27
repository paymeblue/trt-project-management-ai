---
phase: quick-260727-dps
plan: 01
subsystem: workflow-engine
tags: [drizzle, neon, tsx, workflow-graph, verification-harness, seed-data]
status: complete

requires: []
provides:
  - LIVE_WORKFLOW_STEPS[10] (confirmation_correction) now carries slug='confirmation_drawing', restoring verify:live-workflow parity
  - db/seed-workflow-graph.ts rebuilt: correct 21-step/20-edge live chain, --force destructive-run guard, re-synced ASSIGNMENT_STEP_CONFIG/ADDITIONAL_KINDS_CONFIG
  - scripts/verify-workflow-engine.ts fulfills checklist/readiness/ack before completing state-gated test steps, plus a STATE_GATED_KINDS regression lock
  - scripts/verify-design-pipeline.ts no longer references the removed design_meeting step; requiredPosition/next-actionable-step assertions corrected to match the real live graph
affects: [future-workflow-graph-changes, future-quick-tasks-touching-seed-or-verify-scripts]

tech-stack:
  added: []
  patterns:
    - "fulfillKind() harness helper wrapping wg.recordAdditionalRequirement to mirror live app fulfillment before completeGraphStep, stated once per harness"
    - "fail-loud pre-delete guard pattern (count existing rows, require --force) for any seeder that deletes-then-reinserts a graph namespace"

key-files:
  created: []
  modified:
    - db/workflow-live-steps.ts
    - db/seed-workflow-graph.ts
    - scripts/verify-workflow-engine.ts
    - scripts/verify-design-pipeline.ts

key-decisions:
  - "Widened ASSIGNMENT_STEP_CONFIG's scope (not its name) to also carry requiredPosition for non-assignment-kind steps (set_delivery_timeline, internal_approval, send_for_production, project_review_authorisation, approval_installation) discovered via read-only live inspection, since it's the map that already writes requiredPosition to the DB — this was the narrowest way to honor the plan's literal 'the two per-step config maps' scope while still reproducing live requiredPosition values faithfully."
  - "Did NOT add a third config map for materials_readiness's dualRoles=[factory_pm, site_pm] — explicitly out of this task's stated two-map scope; documented as a known gap in the seeder's comments so a future --force run isn't silently incomplete."
  - "Fixed two additional pre-existing staleness bugs in verify-design-pipeline.ts beyond the stated design_meeting removal (requiredPosition 'head_designer' -> 'head_of_design' rename from quick task 260714-bpq; post-design_stage actionable step 'confirmation' -> 'ops_design_confirmation' from quick task 260714-qe4's restructure) — both were only reachable once the design_meeting startup throw was removed, and both block the plan's stated 'exits 0' truth, so treated as Rule 1 (auto-fix bugs) within this file's existing scope."

requirements-completed: [AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04]

duration: ~20min
completed: 2026-07-27
---

# Quick Task 260727-dps: Sync Workflow Canonical Array, Seeder, and Verification Harnesses Summary

**Restored three failing CLI verification harnesses and defused a destructive stale seeder by syncing all four files to the live workflow graph as it actually exists on 2026-07-27, with zero runtime app behavior change.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-27
- **Tasks:** 3/3 completed
- **Files modified:** 4

## Accomplishments

- `npm run verify:live-workflow` now exits 0 (was failing parity on step 11's missing slug)
- `db/seed-workflow-graph.ts` no longer references 3 removed step keys and 20-edge chain now matches the real live graph exactly; a bare re-run against a populated `graph='live'` now aborts before deleting anything, requiring an explicit `--force` flag
- `npm run verify:workflow-engine` now exits 0 (was failing 7 assertions against the 2026-07-22 STATE_GATED_KINDS fix) and gained a regression lock proving the fix can't silently regress
- `npx tsx scripts/verify-design-pipeline.ts` now exits 0 (was throwing at startup on the removed `design_meeting` step), plus two additional stale assertions (position slug rename, actual post-design_stage successor) corrected
- Full verification sweep green: `verify:live-workflow`, `verify:workflow-engine`, `verify-design-pipeline`, `tsc --noEmit`, `lint`, `npm test` (308 passed, 1 todo)
- `lib/`, `app/`, `actions/`, `components/` byte-unchanged — confirmed via `git diff --name-only` showing only the 4 `files_modified` entries across all 3 commits

## Task Commits

1. **Task 1: Sync canonical array entry + rebuild the seeder with a destructive-run guard** - `6d9b888` (fix)
2. **Task 2: Fix the workflow-engine harness to record fulfillment, and lock the 07-22 gate with a regression assertion** - `81c101f` (fix)
3. **Task 3: Drop the removed design_meeting step from the design-pipeline harness, then run the full verification sweep** - `7e6255a` (fix)

## Files Created/Modified

- `db/workflow-live-steps.ts` - Added missing `slug: 'confirmation_drawing'` to the `confirmation_correction` entry (step 11), with a why-comment on the un-representable `additionalKinds=['checklist']` live field
- `db/seed-workflow-graph.ts` - Replaced the stale 22-step/22-edge EDGES list with the real 21-step/20-edge live chain; added a fail-loud `--force`-gated guard as the first statement in `main()`; re-synced `ASSIGNMENT_STEP_CONFIG` (corrected positions: `head_of_design`, `head_of_projects`, `operations_manager_admin`, `chief_production_officer`) and `ADDITIONAL_KINDS_CONFIG` (`payment_confirmation`, `checklist`) from a read-only live DB query
- `scripts/verify-workflow-engine.ts` - Added `fulfillKind()` helper + 4 fulfillment calls before the now-gated `completeGraphStep` calls on `test_branch_a`/`test_branch_b`/`test_join`; added a `STATE_GATED_KINDS` regression-lock assertion
- `scripts/verify-design-pipeline.ts` - Removed the `design_meeting` lookup/assertions; corrected the requiredPosition assertion (`head_designer` -> `head_of_design`) and the post-design_stage actionable-step assertion (`confirmation` -> `ops_design_confirmation`)

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] verify-design-pipeline.ts's requiredPosition assertion used a stale position slug**
- **Found during:** Task 3
- **Issue:** After removing the `design_meeting` startup throw, the harness's `requiredPosition === 'head_designer'` check failed — live data actually carries `'head_of_design'` (renamed by quick task 260714-bpq's positions-table migration, which unified a duplicate `head_designer`/"Head of design" pair). This failure was unreachable before this task because the harness threw at Setup before it.
- **Fix:** Updated the assertion (and its recordPass label + header docblock) to check for `'head_of_design'`.
- **Files modified:** `scripts/verify-design-pipeline.ts`
- **Verification:** `npx tsx scripts/verify-design-pipeline.ts` — assertion now passes
- **Committed in:** `7e6255a` (part of Task 3 commit)

**2. [Rule 1 - Bug] verify-design-pipeline.ts's post-design_stage assertion targeted the wrong next step**
- **Found during:** Task 3
- **Issue:** The harness asserted `'confirmation'` becomes actionable immediately after `design_stage` completes. The real live chain (already correct in the DB before this task) is `design_stage -> ops_design_confirmation -> confirmation` (quick task 260714-qe4's restructure inserted `ops_design_confirmation` between them). Also unreachable before this task due to the earlier startup throw.
- **Fix:** Changed the assertion's target key to `'ops_design_confirmation'` and updated the surrounding label, header docblock, and final `RESULT: PASS` message to match.
- **Files modified:** `scripts/verify-design-pipeline.ts`
- **Verification:** `npx tsx scripts/verify-design-pipeline.ts` — assertion now passes
- **Committed in:** `7e6255a` (part of Task 3 commit)

## Verification Sweep Results

All 6 required commands exit 0 / pass:

1. `npm run verify:live-workflow` — PASS (PARITY 21/21, both dualRoles orders)
2. `npm run verify:workflow-engine` — PASS (WF-03/04/05, incl. new regression lock)
3. `npx tsx scripts/verify-design-pipeline.ts` — PASS (5-step Design pipeline, lands on ops_design_confirmation)
4. `npx tsc --noEmit` — clean
5. `npm run lint` — clean (3 pre-existing unrelated warnings only, 0 errors)
6. `npm test` — 308 passed, 1 todo (37 files)

Guard verification (`npx tsx db/seed-workflow-graph.ts`, no flag): exited non-zero with the guard message; live graph confirmed still at 21 definitions / 20 edges afterward via a re-run of `verify:live-workflow`.

`git diff --name-only` across all 3 task commits lists exactly the 4 `files_modified` entries — no `lib/`, `app/`, `actions/`, or `components/` changes.

## Known Stubs

None — no hardcoded empty/placeholder values introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. The seeder's destructive-run guard (T-260727-01) and the harness's fulfillment mirroring (T-260727-02) were the threat_model's stated mitigations, both applied as specified.

## Self-Check: PASSED

- FOUND: db/workflow-live-steps.ts
- FOUND: db/seed-workflow-graph.ts
- FOUND: scripts/verify-workflow-engine.ts
- FOUND: scripts/verify-design-pipeline.ts
- FOUND: commit 6d9b888
- FOUND: commit 81c101f
- FOUND: commit 7e6255a
