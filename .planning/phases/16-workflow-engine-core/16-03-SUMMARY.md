---
phase: 16-workflow-engine-core
plan: 03
subsystem: api
tags: [drizzle, postgres, next-server-actions, workflow-engine, authorization]

# Dependency graph
requires:
  - phase: 16-02
    provides: lib/workflow-graph.ts read engine (getStepById, getGraphSteps, getActionableSteps) + GraphStep type
provides:
  - lib/workflow-graph.ts write engine — completeGraphStep (advancement + server-side required-vs-optional skip enforcement) + submitYesNoUpload/sendApproval/receiveApproval/assignUser kind handlers
  - actions/workflow-graph.ts — 5 'use server' actions gating every write on verifySession + canRoleActOnStep before delegating to the engine
affects: [16-04, 16-05, phase-17-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kind handlers (submitYesNoUpload/sendApproval/receiveApproval/assignUser) only record workflow_step_states runtime state — they never advance the project. completeGraphStep is the sole function that writes project_step_completions and re-derives the actionable set, keeping fulfillment and advancement independently testable."
    - "Skip enforcement lives entirely inside completeGraphStep (server-side), not in any action or client check — a forged skip=true on a required step throws before any row is written"
    - "workflow_step_states rows are upserted via onConflictDoUpdate on the (projectId, stepDefId) unique constraint, so re-submitting a yes/no answer or re-sending an approval overwrites in place rather than erroring"

key-files:
  created:
    - actions/workflow-graph.ts
  modified:
    - lib/workflow-graph.ts

key-decisions:
  - "completeGraphStep gates non-skip completions of the 3 new kinds (yes_no_upload/approval/assignment) on a workflow_step_states row already being status 'complete' — throws 'step-not-fulfilled' otherwise; legacy checklist/readiness/ack/creation kinds are accepted as already validated upstream (mirrors actions/workflow.ts's existing trust boundary)"
  - "receiveApproval additionally throws 'approval-not-sent' if no row exists yet or it isn't in 'sent' status, before checking the two-party rule — makes the reject reason distinct from a self-approval attempt"
  - "actions/workflow-graph.ts centralizes session+role gating in one authorizeStep() helper shared by all 5 actions rather than repeating verifySession+canRoleActOnStep inline 5 times, while still satisfying 'every action gates before mutating' since each action calls it first"

requirements-completed: [WF-02, WF-03, WF-04]

# Metrics
duration: ~12min
completed: 2026-07-09
---

# Phase 16 Plan 03: Workflow Graph Write Engine + Server Actions Summary

**Write half of the DB-driven workflow engine — completeGraphStep advancement with server-side required-vs-optional skip enforcement, 4 new fulfillment-kind state handlers (yes/no+upload, two-party approval, role-checked assignment), and 5 authorized server actions wrapping them.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-09T11:13:00Z
- **Completed:** 2026-07-09T11:25:42Z
- **Tasks:** 2 completed
- **Files modified:** 2 (`lib/workflow-graph.ts`, `actions/workflow-graph.ts`)

## Accomplishments
- `completeGraphStep` turns the read engine into a state machine: inserts a `project_step_completions` row (advancement) and returns the freshly re-derived actionable set from `getActionableSteps` — while rejecting `skip=true` on any step whose `isOptional` is `false` server-side, so a forged client flag can never bypass a required step (WF-04)
- Added the 3 new fulfillment-kind handlers (`submitYesNoUpload`, `sendApproval`/`receiveApproval`, `assignUser`) that record runtime state in `workflow_step_states` via upsert, independent of advancement — `receiveApproval` enforces the two-party rule (rejects the sender receiving their own approval) and `assignUser` enforces the assignee's role matches `step.targetRole` (WF-03)
- Wrapped all 5 write operations in `actions/workflow-graph.ts` server actions that verify the session and gate on `canRoleActOnStep` before any mutation, surfacing each distinct engine rejection reason (required-step-cannot-be-skipped, step-not-fulfilled, approval-not-sent, approval-requires-two-parties, assignee-role-mismatch) as its own user-facing message rather than a generic failure (WF-02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the write engine + fulfillment-kind handlers to lib/workflow-graph.ts** - `bb68d9b` (feat)
2. **Task 2: Server actions wrapping the write engine (session + role gating)** - `7095263` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `lib/workflow-graph.ts` - Appended the write engine: `completeGraphStep`, `submitYesNoUpload`, `sendApproval`, `receiveApproval`, `assignUser`. All read the DB live and none cache in-module state, consistent with the plan 02 read engine.
- `actions/workflow-graph.ts` - New `'use server'` module exporting `completeStepAction`, `submitYesNoUploadAction`, `sendApprovalAction`, `receiveApprovalAction`, `assignUserAction`. Shared `authorizeStep()` helper resolves the step, calls `verifySession`, and gates with `canRoleActOnStep` before every mutation; `engineErrorMessage()` maps thrown engine errors to distinct user-facing text.

## Decisions Made
- Kept kind-handlers and `completeGraphStep` fully decoupled (handlers never call completion/advancement themselves) per the plan's explicit instruction — this makes "step fulfilled but not yet completed" a valid, testable intermediate state for plan 04's harness.
- Added an `approval-not-sent` guard in `receiveApproval` (not explicitly named in the plan, but required by its own instruction to "require an existing row with status 'sent'") so a receive-before-send attempt gets a distinct, correct message instead of silently passing the two-party check on `undefined !== actorId`.
- Centralized session+role gating in one `authorizeStep()` helper in the actions module instead of repeating the verifySession/canRoleActOnStep pair inline in each of the 5 actions — reduces duplication while still satisfying the acceptance criterion that every action gates before mutating (each action calls the helper first, unconditionally).

## Deviations from Plan

None - plan executed exactly as written. The `approval-not-sent` guard (see Decisions above) is a direct, literal implementation of the plan's own instruction ("receiveApproval ... require an existing row with status 'sent'") rather than a scope addition.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `completeGraphStep` + the 4 kind-handlers + all 5 server actions are ready to be exercised end-to-end by plan 04's test graph + harness.
- Plan 05's minimal `/workflow/step` renderers can call `submitYesNoUploadAction`/`sendApprovalAction`/`receiveApprovalAction`/`assignUserAction` directly; `completeStepAction` (with `skip`) is the single advancement entry point for all kinds.
- No blockers. Existing live callers remain untouched (Phase 17 scope, as planned).

---
*Phase: 16-workflow-engine-core*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: lib/workflow-graph.ts
- FOUND: actions/workflow-graph.ts
- FOUND: commit bb68d9b (feat(16-03): add workflow graph write engine + fulfillment-kind handlers)
- FOUND: commit 7095263 (feat(16-03): add server actions wrapping the workflow graph write engine)
