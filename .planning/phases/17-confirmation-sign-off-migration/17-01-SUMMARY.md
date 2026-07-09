---
phase: 17-confirmation-sign-off-migration
plan: 01
subsystem: database
tags: [drizzle, postgres, neon, tsx, cli-harness, workflow-engine, migration-foundation]

# Dependency graph
requires:
  - phase: 16-workflow-engine-core
    provides: lib/workflow-graph.ts read/write engine (getGraphSteps/getActionableSteps/completeGraphStep) proven against an isolated graph='test' fan-out/join
provides:
  - lib/workflow-graph.ts getLiveWorkflowSteps() — adapter projecting graph='live' GraphStep rows into the legacy WorkflowStep shape (+ stepDefId)
  - lib/workflow.ts findStep/lastStepN/projectComplete — pure array-argument helper variants, additive alongside the legacy array-closure versions
  - db/seed-workflow-graph.ts — corrected live graph edges natively encoding the Delivery Readiness + Delivery Project Checklist -> Project Check Report parallel/join
  - scripts/verify-live-workflow.ts (npm run verify:live-workflow) — repeatable PARITY (adapter == legacy array) + live-graph JOIN (both completion orders) proof
affects: [17-02, 17-03, 17-04, 17-05 (later Phase 17 plans that cut live callers over to the graph engine)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration adapter pattern: getLiveWorkflowSteps() projects DB rows into the exact legacy shape consumers already expect, proven byte-identical via an automated PARITY assertion, before any caller is touched — de-risks a cutover by proving equivalence first, changing behavior second"
    - "Explicit by-key edge list (not a positional n->n+1 loop) is required whenever a graph has a fan-out/join — db/seed-workflow-graph.ts now enumerates all 11 live edges by step key so the delivery cluster's parallel/join is structural, not incidental to array ordering"
    - "CLI harnesses that import a server-only-marked module (lib/workflow-graph.ts) outside Next's build must patch node:module's Module._load via a plain require() (not a static import, which tsx hoists) — reused unchanged from scripts/verify-workflow-engine.ts (Phase 16 Plan 04)"

key-files:
  created:
    - scripts/verify-live-workflow.ts
  modified:
    - lib/workflow-graph.ts
    - lib/workflow.ts
    - db/seed-workflow-graph.ts
    - package.json

key-decisions:
  - "Verified before touching anything: the 25 pre-existing graph='live' project_step_completions rows all have stepDefId=null (they're legacy stepKey/stepN-keyed audit rows, not FK-linked to workflow_step_definitions), so the Task 2 reseed's delete+reinsert of workflow_step_definitions cannot cascade-affect them — confirmed via a direct DB query before and after reseeding"
  - "verify-live-workflow.ts completes delivery_readiness/delivery_project directly via completeGraphStep without first completing their own predecessors (new_project/confirmation/materials_readiness) — completeGraphStep doesn't gate on predecessor actionability for non-STATE_GATED_KINDS (checklist/readiness/creation/ack), only getActionableSteps derives that; this matches the plan's literal instruction to 'complete predecessor steps' meaning the two branch steps feeding the join, not the whole chain above them"
  - "Rubber-stamp guard performed manually per the plan's acceptance criteria: temporarily edited WORKFLOW_STEPS's sign_off label in lib/workflow.ts in-memory, re-ran verify:live-workflow (exit 1, PARITY correctly failed on the label mismatch), then reverted via a scratchpad backup copy (git diff clean afterward) and re-ran to a clean pass"

requirements-completed: [WF-06]

# Metrics
duration: ~9min
completed: 2026-07-09
---

# Phase 17 Plan 01: Migration Foundation (Adapter + Corrected Edges + Verification) Summary

**Additive adapter (`getLiveWorkflowSteps()`) proven byte-identical to the legacy `WORKFLOW_STEPS` array, live graph edges corrected to natively encode the Delivery Readiness + Delivery Project Checklist → Project Check Report parallel/join, and a repeatable `npm run verify:live-workflow` CLI harness proving both claims against the real 'live' graph — zero legacy callers touched, zero real project rows modified.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-09T14:26:49Z
- **Completed:** 2026-07-09T14:35:31Z
- **Tasks:** 3 completed
- **Files modified:** 4 (`lib/workflow-graph.ts`, `lib/workflow.ts`, `db/seed-workflow-graph.ts`, `package.json`); 1 created (`scripts/verify-live-workflow.ts`)

## Accomplishments
- `lib/workflow-graph.ts` gained `LiveWorkflowStep` type + `getLiveWorkflowSteps()`, mapping `graph='live'` `GraphStep` rows (via the existing `getGraphSteps('live')`) into the exact legacy `WorkflowStep` shape plus a `stepDefId` back-reference — every existing export in the file is untouched.
- `lib/workflow.ts` gained three pure, array-argument helpers (`findStep`, `lastStepN`, `projectComplete`) alongside the untouched legacy `WORKFLOW_STEPS`/`stepByN`/`isProjectComplete`/`FIRST_ACTION_STEP`/`LAST_STEP` — confirmed via `grep -n "^import"` that the file still has zero imports (fully client-safe).
- `db/seed-workflow-graph.ts`'s edge generation replaced with an explicit 11-edge list keyed by step name: every step stays sequential except `materials_readiness`, which fans out to both `delivery_readiness` and `delivery_project`, both converging on `project_check_report` — verified directly against the DB post-reseed (11 defs, 11 edges, exact edge list confirmed by a direct query, old `delivery_readiness -> delivery_project` edge gone).
- `scripts/verify-live-workflow.ts` (new `npm run verify:live-workflow`) proves two things against the real live graph, no mocks: PARITY (`getLiveWorkflowSteps()` deep-equals `WORKFLOW_STEPS` on n/key/label/role/kind/slug for all 11 steps in order) and JOIN in both completion orders (`project_check_report` becomes actionable only once both `delivery_readiness` and `delivery_project` are complete, regardless of which finishes first) — reusing the `server-only` `Module._load` shim pattern from Phase 16's `verify-workflow-engine.ts`.
- Manually confirmed the harness is not a rubber stamp: temporarily broke `WORKFLOW_STEPS[10].label` in memory, re-ran the script (exit 1, PARITY assertion failed exactly on the label field), reverted (`git diff` clean), re-ran to a clean pass.
- Verified before and after the edge reseed that no real project data was at risk: the 25 pre-existing `graph='live'` `project_step_completions` rows all have `stepDefId: null` (legacy `stepKey`/`stepN`-keyed audit rows, not linked to `workflow_step_definitions`), so the reseed's cascade-delete FK could not touch them; confirmed `projects.currentStep` for all 4 real projects (3, 5, 12, 12) unchanged before and after every step of this plan; confirmed `graph='test'` (8 definitions) untouched throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getLiveWorkflowSteps() adapter + pure helper variants (additive only)** - `5ba5efb` (feat)
2. **Task 2: Correct the live graph edges to model the parallel/join (D-03)** - `feb8dc9` (feat)
3. **Task 3: verify-live-workflow.ts — parity + live-graph join assertions** - `ea9e1ea` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/workflow-graph.ts` - Added `LiveWorkflowStep` type and `getLiveWorkflowSteps()`, the migration adapter projecting `graph='live'` rows into the legacy `WorkflowStep` shape.
- `lib/workflow.ts` - Added `findStep`/`lastStepN`/`projectComplete` pure array-argument helpers; every legacy export unchanged; still zero imports (client-safe).
- `db/seed-workflow-graph.ts` - Replaced the linear `n->n+1` edge loop with an explicit 11-edge list by step key, natively encoding the delivery parallel/join; step definitions/orderIndex unchanged.
- `scripts/verify-live-workflow.ts` (new) - CLI harness: PARITY assertion (adapter vs. legacy array) + JOIN assertions in both completion orders, against two uniquely-named throwaway projects on the real live graph; cleans up its own rows in a `finally` block.
- `package.json` - Added `verify:live-workflow` script.

## Decisions Made
- Confirmed the 25 pre-existing `graph='live'` `project_step_completions` rows are legacy (`stepDefId: null`) before running the Task 2 reseed, to guarantee the delete+reinsert of `workflow_step_definitions` could not cascade-delete real audit-trail data.
- The verification script completes `delivery_readiness`/`delivery_project` directly (not their upstream predecessors) since `completeGraphStep` doesn't gate non-`STATE_GATED_KINDS` completions on prior actionability — only `getActionableSteps` derives that, which is exactly what's under test.
- Performed the plan's rubber-stamp guard manually (temporary in-memory label break, confirmed exit 1, reverted, confirmed clean pass) rather than adding a permanent "break mode" flag to the script — matches the plan's own phrasing ("executor confirms once, then reverts").

## Deviations from Plan

None - plan executed exactly as written. One verification-script quirk worth noting: the plan's own literal automated check for Task 1 (`! grep -q "server-only" lib/workflow.ts`) has a pre-existing false-positive against line 5's header comment ("keep it free of any server-only imports") — not an actual import. Confirmed the real acceptance criterion (no `server-only`/`db` import) holds via `grep -n "^import" lib/workflow.ts`, which returns nothing. No code change was needed; this is a note about the plan's grep pattern, not a deviation in the implementation.

## Issues Encountered

None beyond the pre-existing 25 `graph='live'` `project_step_completions` rows not being mentioned in the plan's "Verified DB state" context — investigated immediately before proceeding with Task 2's reseed (see Decisions Made), confirmed zero risk, and continued.

## User Setup Required

None - no external service configuration required. Ran directly against the existing `.env.local` `DATABASE_URL`.

## Next Phase Readiness
- `getLiveWorkflowSteps()` is proven byte-identical to `WORKFLOW_STEPS`, and the live graph's delivery parallel/join is proven to resolve correctly in both orders — the two preconditions the rest of Phase 17 (cutting real callers over to the graph engine) depends on.
- `npm run verify:live-workflow` is repeatable — re-run any time (e.g., after each subsequent Phase 17 plan lands a caller cutover) to regression-test that the live graph still matches the legacy array and the join still resolves correctly.
- No blockers. Real projects (currentStep 3, 5, 12, 12) are completely unaffected; `graph='test'` is untouched; every legacy `lib/workflow.ts`/`lib/workflow-graph.ts` export and caller is unchanged — the repo compiles and behaves identically to before this plan.

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: lib/workflow-graph.ts
- FOUND: lib/workflow.ts
- FOUND: db/seed-workflow-graph.ts
- FOUND: scripts/verify-live-workflow.ts
- FOUND: .planning/phases/17-confirmation-sign-off-migration/17-01-SUMMARY.md
- FOUND: commit 5ba5efb (feat(17-01): add getLiveWorkflowSteps() adapter + pure workflow helpers)
- FOUND: commit feb8dc9 (feat(17-01): correct live graph edges to model delivery parallel/join)
- FOUND: commit ea9e1ea (feat(17-01): add verify-live-workflow.ts (parity + live join assertions))
