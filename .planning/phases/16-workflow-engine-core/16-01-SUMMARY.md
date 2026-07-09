---
phase: 16-workflow-engine-core
plan: 01
subsystem: database
tags: [drizzle, postgres, neon, schema, workflow-engine]

# Dependency graph
requires: []
provides:
  - fulfillment_kind enum (7 values: creation, checklist, readiness, ack, yes_no_upload, approval, assignment)
  - workflow_step_definitions table (order, key, label, role, fulfillment kind, optional flag, per-graph namespace)
  - workflow_step_edges table (explicit predecessor->successor adjacency, native parallel/join support)
  - workflow_step_states table (per-project runtime state for yes_no_upload/approval/assignment kinds)
  - project_step_completions extended with step_def_id/graph/skipped (legacy step_key/step_n preserved)
affects: [16-02 (read engine), 16-03, 16-04, 16-05, phase-17-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Explicit short foreign-key names via drizzle-orm's foreignKey() table-config helper when the default generated FK name would exceed Postgres' 63-char identifier limit (avoids silent truncation and drizzle-kit push churn on every re-run)"

key-files:
  created: []
  modified:
    - db/schema.ts

key-decisions:
  - "Named 3 new FK constraints explicitly (psc_step_def_id_fk, wse_from_step_id_fk, wss_step_def_id_fk) because their default auto-generated names exceeded Postgres' 63-byte identifier limit, silently truncated, and caused drizzle-kit push to drop+recreate them on every run"
  - "Left project_step_completions.step_key/step_n untouched for backward compatibility with legacy 'live' rows; graph-engine rows will key by step_def_id instead"

patterns-established:
  - "New workflow-graph tables namespaced by a `graph` text column (default 'live') so the Phase 16 test graph never collides with the live production graph"

requirements-completed: [WF-01, WF-03, WF-05]

# Metrics
duration: 25min
completed: 2026-07-09
---

# Phase 16 Plan 01: Workflow Graph Schema Summary

**Added `fulfillment_kind` enum + 3 new Drizzle tables (workflow_step_definitions/edges/states) plus extended project_step_completions, pushed live to Neon Postgres — the schema foundation for the configurable workflow engine.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-09T11:47:00+01:00
- **Completed:** 2026-07-09T12:04:00+01:00
- **Tasks:** 2 completed
- **Files modified:** 1 (`db/schema.ts`)

## Accomplishments
- `fulfillment_kind` enum covering all 7 step kinds (4 existing + 3 new: yes_no_upload, approval, assignment) — WF-01
- `workflow_step_edges` table makes parallel/join branching a native adjacency graph (predecessor→successor edges), not step-number arithmetic — WF-05
- `workflow_step_states` table gives the 3 new fulfillment kinds a place to record runtime state (answer/upload, send/receive/act) per project — WF-03
- `project_step_completions` extended with `step_def_id`, `graph`, `skipped` while preserving `step_key`/`step_n` for legacy live rows
- Schema pushed to the live Neon database and verified idempotent on repeated re-runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the workflow-graph schema (enum + 3 tables + extend completions)** - `b2a943b` (feat)
2. **Task 2: [BLOCKING] Push schema to the database** - no file changes (database-only action); the FK-naming fix required to make the push idempotent was committed separately - `064c5ce` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `db/schema.ts` - Added `fulfillmentKindEnum`; added `workflowStepDefinitions`, `workflowStepEdges`, `workflowStepStates` tables; extended `projectStepCompletions` with `stepDefId`/`graph`/`skipped`; named 3 long FK constraints explicitly to avoid Postgres 63-char truncation

## Decisions Made
- New tables namespaced by `graph` (default `'live'`) so Phase 16's isolated test graph never collides with the eventual production graph migrated in Phase 17.
- `workflow_step_edges` is the sole source of adjacency — a join step is simply one with multiple incoming edges. No step-number arithmetic anywhere in the new schema.
- Explicit short FK constraint names (`psc_step_def_id_fk`, `wse_from_step_id_fk`, `wss_step_def_id_fk`) instead of Drizzle's auto-generated names, because the auto names for these 3 FKs (pointing at `workflow_step_definitions.id` from the new long table names) exceeded Postgres' 63-byte identifier limit and were silently truncated — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Named 3 long FK constraints explicitly to fix drizzle-kit push non-idempotency**
- **Found during:** Task 2 (pushing the schema)
- **Issue:** Drizzle's default auto-generated FK constraint names for `project_step_completions.step_def_id`, `workflow_step_edges.from_step_id`, and `workflow_step_states.step_def_id` (all referencing `workflow_step_definitions.id`) were 64-69 characters — over Postgres' 63-byte identifier limit. Postgres silently truncates over-limit identifiers on creation, so on every subsequent `drizzle-kit push`, drizzle-kit's live introspection saw the (untruncated) name it expected didn't match the (truncated) name in the DB and proposed a DROP+ADD cycle for these constraints every single run. This directly violated the plan's acceptance criterion that a second push report no outstanding changes.
- **Fix:** Used drizzle-orm's `foreignKey()` table-config helper to give these 3 constraints short, explicit names (`psc_step_def_id_fk`, `wse_from_step_id_fk`, `wss_step_def_id_fk`), all well under the 63-char limit.
- **Files modified:** `db/schema.ts`
- **Verification:** Ran `drizzle-kit push` a 5th time after the fix — exited 0 with `[✓] Changes applied` and no interactive prompt or diff at all for any of the new tables/constraints (confirmed idempotent, both via CLI output and by querying `pg_constraint` directly for the new constraint names).
- **Committed in:** `064c5ce`

**Note — out-of-scope pre-existing churn (not fixed, logged to deferred-items.md):** Two pre-existing tables unrelated to this plan (`checklist_template_items`, `checklist_responses`) have FK names that are also over the 63-char limit (66-67 chars) and will continue to churn on every `drizzle-kit push` — this predates Phase 16 and is out of this plan's scope (SCOPE BOUNDARY: only fix issues directly caused by this task's changes). `message_reactions`' unique constraint also re-appears in the diff on some runs despite being under the length limit; also pre-existing and out of scope. None of this affected my ability to verify Task 2's acceptance criteria, since my new tables/constraints are confirmed stable independent of this pre-existing churn.

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug), plus 1 pre-existing out-of-scope issue logged (not fixed)
**Impact on plan:** The FK-naming fix was necessary to make Task 2's idempotency acceptance criterion achievable for the tables this plan created. No scope creep — pre-existing unrelated table issues were left untouched and documented instead.

## Issues Encountered
- `drizzle-kit push` prompts interactively ("Do you want to truncate...?") when it detects what it believes is a new unique constraint on a table with existing rows (`project_step_deadlines`, a pre-existing table this plan does not modify) — this prompt requires a TTY and fails non-interactively by default. Used `expect` to drive the prompt, selecting the safe default ("No, add the constraint without truncating the table"), which succeeded since no duplicate rows existed. Confirmed via direct `pg_constraint` query that the constraint was unaffected before and after. Resolved without needing `--force` (which would auto-approve destructive truncation and was avoided as too risky for an unrelated table).

## User Setup Required

None - no external service configuration required. `.env.local` already had a working `DATABASE_URL`.

## Next Phase Readiness
- The workflow-graph tables (`workflow_step_definitions`, `workflow_step_edges`, `workflow_step_states`) and the extended `project_step_completions` are live in the database, isolated under `graph = 'live'` default, ready for Plan 02's read engine (`lib/workflow-graph.ts`) to query.
- No blockers. The pre-existing `checklist_template_items`/`checklist_responses`/`message_reactions` push-churn (unrelated to this plan) is logged in `deferred-items.md` for awareness in a future phase, but does not block Phase 16 execution.

---
*Phase: 16-workflow-engine-core*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: db/schema.ts
- FOUND: .planning/phases/16-workflow-engine-core/16-01-SUMMARY.md
- FOUND: commit b2a943b (feat(16-01): add workflow-graph schema)
- FOUND: commit 064c5ce (fix(16-01): name long FK constraints explicitly)
