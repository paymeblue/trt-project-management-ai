---
phase: 16-workflow-engine-core
plan: 02
subsystem: database
tags: [drizzle, postgres, neon, workflow-engine, server-only]

# Dependency graph
requires:
  - phase: 16-01
    provides: fulfillment_kind enum + workflow_step_definitions/edges/states tables + extended project_step_completions
provides:
  - lib/workflow-graph.ts — server-only read engine (getGraphSteps, getGraphEdges, getStepById/Key, getCompletedStepIds, getActionableSteps, getFirstActionStep, getLastStep)
  - Extended lib/workflow.ts shared types (StepKind with 3 new kinds, GraphStep type, graphStepHref helper) — additive only, all legacy exports unchanged
  - db/seed-workflow-graph.ts — structural seed of the current 11 live steps + linear edges into the 'live' graph
affects: [16-03, 16-04, 16-05, phase-17-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-engine functions query the DB live on every call (no module-level array cache), so a step inserted directly into the tables is reflected without a code deploy (WF-02)"
    - "Join-readiness computed purely from workflow_step_edges adjacency: a step is actionable iff every incoming edge's fromStepId is in the completed set — no step-number arithmetic anywhere in the engine"

key-files:
  created:
    - lib/workflow-graph.ts
    - db/seed-workflow-graph.ts
  modified:
    - lib/workflow.ts
    - package.json

key-decisions:
  - "lib/workflow.ts stays client-safe: GraphStep/graphStepHref were added without importing db or 'server-only' — the DB-touching code lives exclusively in the new lib/workflow-graph.ts"
  - "GraphStep.role/targetRole are cast from the DB's roleEnum (6 values incl. design/production) to WorkflowRole (4 values) in workflow-graph.ts's mapping function, since workflow steps only ever assign one of the 4 roles that actually own steps"
  - "getCompletedStepIds includes skipped-optional-step completions as satisfied predecessors for join readiness, per the plan's must_haves"

patterns-established:
  - "Seed scripts for the graph tables are idempotent via delete-then-insert scoped to graph='live' (edges deleted before definitions to respect the FK), mirroring the existing db/seed-workflow-checklists.ts scaffold"

requirements-completed: [WF-01, WF-02, WF-05]

# Metrics
duration: ~15min
completed: 2026-07-09
---

# Phase 16 Plan 02: Workflow Graph Read Engine Summary

**Server-only DB read engine (lib/workflow-graph.ts) resolving join-readiness from explicit workflow_step_edges adjacency, plus extended client-safe types and a structural seed of the 11 live steps into the graph tables.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-09T11:05:00Z
- **Completed:** 2026-07-09T11:15:26Z
- **Tasks:** 3 completed
- **Files modified:** 4 (`lib/workflow.ts`, `lib/workflow-graph.ts`, `db/seed-workflow-graph.ts`, `package.json`)

## Accomplishments
- Extended `StepKind` to 7 values and added the client-safe `GraphStep` type + `graphStepHref` helper to `lib/workflow.ts` without touching any existing export or importing server-only/db code
- Built `lib/workflow-graph.ts`, the server-only read engine that loads steps/edges/completions live from Postgres on every call and derives `getActionableSteps` purely from edge adjacency — a join step becomes actionable only once ALL its predecessors are complete, regardless of completion order (WF-05)
- Seeded the 'live' graph with the current 11 workflow steps + 10 linear edges via `db/seed-workflow-graph.ts`, verified idempotent (11 definitions + 10 edges after two runs)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared workflow types (client-safe, additive only)** - `da8d60c` (feat)
2. **Task 2: Create the server-only read engine lib/workflow-graph.ts** - `8a4167d` (feat)
3. **Task 3: Seed the current 11 live steps into the graph tables (structural seed)** - `8416cac` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/workflow.ts` - Added 3 new `StepKind` values (`yes_no_upload`, `approval`, `assignment`), the `GraphStep` type, and `graphStepHref()`; every legacy export (`WORKFLOW_STEPS`, `stepByN`, `LAST_STEP`, `FIRST_ACTION_STEP`, `isProjectComplete`, `canRoleActOnStep`, `stepHref`, `workflowRoleLabel`, `Roles`) untouched
- `lib/workflow-graph.ts` - New server-only module (`import 'server-only'` first line): `getGraphSteps`, `getStepByKey`, `getStepById`, `getGraphEdges`, `getCompletedStepIds`, `getActionableSteps`, `getFirstActionStep`, `getLastStep` — all async, all read live from `db`
- `db/seed-workflow-graph.ts` - Structural seed script: copies `WORKFLOW_STEPS` 1:1 into `workflow_step_definitions` + a linear chain of `workflow_step_edges` under `graph='live'`, idempotent via delete-then-insert
- `package.json` - Added `db:seed-workflow-graph` script

## Decisions Made
- Cast `role`/`targetRole` from the DB's wider `roleEnum` (includes `design`/`production`) to the narrower `WorkflowRole` type in `workflow-graph.ts`'s row-mapping function, since workflow steps only ever assign one of the 4 roles that own steps — avoids widening `WorkflowRole` itself, which is used across many existing consumers
- `getCompletedStepIds` treats skipped-optional-step completions as satisfied predecessors for join readiness (per plan's must_haves), matching the `skipped` column added to `project_step_completions` in plan 16-01

## Deviations from Plan

None - plan executed exactly as written. The `role`/`targetRole` type cast (see Decisions above) was a straightforward type-compatibility fix required to make `toGraphStep` compile against the existing `roleEnum` schema type (Rule 1 - bug, discovered via `tsc --noEmit` during Task 2, fixed inline, not a scope change).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Seed script ran directly against the existing `.env.local` `DATABASE_URL`.

## Next Phase Readiness
- `lib/workflow-graph.ts` is ready for Phase 17's rewiring of the ~20 existing callers from the sync `WORKFLOW_STEPS` array to the DB engine (explicitly out of scope for this plan).
- The 'live' graph now holds real, verified data (11 definitions + 10 linear edges) for plans 16-03/16-04/16-05 to build against.
- No blockers.

---
*Phase: 16-workflow-engine-core*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: lib/workflow.ts (GraphStep, graphStepHref, extended StepKind)
- FOUND: lib/workflow-graph.ts
- FOUND: db/seed-workflow-graph.ts
- FOUND: commit da8d60c (feat(16-02): extend shared workflow types with GraphStep + graphStepHref)
- FOUND: commit 8a4167d (feat(16-02): add server-only workflow graph read engine)
- FOUND: commit 8416cac (feat(16-02): seed the 11 live workflow steps into the graph tables)
