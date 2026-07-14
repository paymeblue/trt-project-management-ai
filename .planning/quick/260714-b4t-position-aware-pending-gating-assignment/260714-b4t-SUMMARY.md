---
phase: quick-260714-b4t
plan: 01
subsystem: workflow
tags: [drizzle, postgres, next.js, react-server-components]

requires:
  - phase: quick-260713-ekr
    provides: assignee-scoped gating (gatedToUserId) that this plan layers position-awareness on top of
provides:
  - Position-aware pending filter in getMyWork excluding steps where the caller's users.position doesn't match step.requiredPosition (with an approval-step receiver carve-out)
  - Same position gate applied client-side to header-project-switcher's mine/youract signals
  - LiveWorkflowStep type now carries requiredPosition/receiverRequiredPosition end to end
  - Auto-seeded projectStepDeadlines for assign_designer_brief/brief_taking/invoice_upload at project creation
affects: [countdown-timer, workflow-configurator, my-work]

tech-stack:
  added: []
  patterns:
    - "Position gate expression (exclude when requiredPosition set AND caller !== requiredPosition AND (no receiverRequiredPosition OR caller !== receiverRequiredPosition)) shared between server (getMyWork) and client (header-project-switcher matchesPosition helper)"
    - "Client components consume server-only types via `import type` (erased at compile time) instead of casting — used to widen WorkflowStepsProvider from WorkflowStep to LiveWorkflowStep"

key-files:
  created: []
  modified:
    - lib/my-work.ts
    - app/(app)/layout.tsx
    - app/_components/header-project-switcher.tsx
    - app/_components/workflow-steps-provider.tsx
    - lib/workflow-graph.ts
    - actions/projects.ts

key-decisions:
  - "LiveWorkflowStep (not the legacy WorkflowStep) grew requiredPosition/receiverRequiredPosition fields, since it's the DB-backed type actually consumed by client components via useWorkflowSteps()"
  - "viewerPosition is threaded through the existing `me` query in app/(app)/layout.tsx rather than adding a second DB round trip"

requirements-completed: [BUGFIX-position-pending, FEAT-auto-deadlines]

duration: 4min
completed: 2026-07-14
---

# Phase quick-260714-b4t: Position-Aware Pending Gating + Auto-Seeded Early Deadlines Summary

**Position-gated pending/header "your turn" signals (with an approval-receiver carve-out) plus auto-seeded +1d/+2d/+2d deadlines on new projects, both resolved by step_key against the live DB-driven workflow graph.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-14T07:03:24Z
- **Completed:** 2026-07-14T07:07:35Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments
- The "Action required" forcing modal and header "your turn" pill now only fire for the user whose `users.position` actually matches `step.requiredPosition` — a design/architect user who isn't the Head Designer no longer sees the assign_designer_brief gate.
- Approval-kind steps (e.g. send_for_production: requiredPosition=head_of_operations, receiverRequiredPosition=chief_production_officer) still surface as pending to the receiver, via an explicit carve-out.
- New projects now get 3 `projectStepDeadlines` rows automatically (assign_designer_brief +1d, brief_taking +2d, invoice_upload +2d, all from creation time), resolved by step_key so the countdown timer (next plan) has something to count immediately.
- `authorizeStep` (actions/workflow-graph.ts) was not touched — the server-side authorization boundary is unchanged; this plan is a visibility/nagging fix plus a data-seeding feature.

## Task Commits

Each task was committed atomically:

1. **Task 1: Position-aware pending filter + header switcher** - `d8b9955` (fix)
2. **Task 2: Auto-create deadlines for steps 2-4 at project creation** - `4bb1a8a` (feat)

**Plan metadata:** (this SUMMARY.md + STATE.md update, committed separately by the orchestrator)

## Files Created/Modified
- `lib/my-work.ts` - fetches caller's position fresh from `users`, excludes position-mismatched steps from `pending` (with the approval receiver carve-out)
- `app/(app)/layout.tsx` - passes `viewerPosition={me?.position ?? null}` to `HeaderProjectSwitcher`, reusing the layout's existing `me` query
- `app/_components/header-project-switcher.tsx` - new `viewerPosition` prop; shared `matchesPosition()` helper gates both `mine` and `youract`
- `app/_components/workflow-steps-provider.tsx` - widened from `WorkflowStep[]` to `LiveWorkflowStep[]` via `import type` (no runtime server-only import) so client consumers see `requiredPosition`/`receiverRequiredPosition` without casting
- `lib/workflow-graph.ts` - `LiveWorkflowStep` type and `getLiveWorkflowSteps()` mapper now carry `requiredPosition`/`receiverRequiredPosition` forward from `GraphStep`
- `actions/projects.ts` - `createProjectIntentAction` inserts 3 `projectStepDeadlines` rows (by step_key, `onConflictDoNothing`) after the step-1 completion insert

## Decisions Made
- Extended `LiveWorkflowStep` (the DB-backed type actually flowing through `useWorkflowSteps()`) rather than the legacy array-based `WorkflowStep`, since the plan's own context flagged the row mapper needed to carry the fields through — this was in fact necessary: `getLiveWorkflowSteps()`'s existing mapper dropped `requiredPosition`/`receiverRequiredPosition` even though `toGraphStep()` (one layer down) already produced them.
- Threaded the new type via `import type` in the client provider instead of a server import or a cast, avoiding pulling `lib/workflow-graph.ts` (marked `server-only`) into the client bundle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getLiveWorkflowSteps()` mapper silently dropped requiredPosition/receiverRequiredPosition**
- **Found during:** Task 1 (Position-aware pending filter + header switcher)
- **Issue:** The plan's context stated "the live-step row mapper includes requiredPosition," but on fresh read, `toGraphStep()` (the DB row → `GraphStep` mapper) includes it, while the separate `getLiveWorkflowSteps()` mapper (DB `GraphStep` → `LiveWorkflowStep`) did not forward those two fields — so `findStep(steps, ...).requiredPosition` would have been `undefined` for every live step, silently no-opping the entire filter.
- **Fix:** Added `requiredPosition`/`receiverRequiredPosition` to the `LiveWorkflowStep` type and to the object literal returned by `getLiveWorkflowSteps()`.
- **Files modified:** lib/workflow-graph.ts
- **Verification:** `npx tsc --noEmit` clean; `lib/my-work.ts`'s filter now reads real values end to end (confirmed via type flow, no `undefined` widening).
- **Committed in:** d8b9955 (Task 1 commit)

**2. [Rule 3 - Blocking] WorkflowStepsProvider's context type didn't carry the new fields to client components**
- **Found during:** Task 1
- **Issue:** `useWorkflowSteps()` returned `WorkflowStep[]` (the legacy type, no position fields), even though it's actually seeded with `LiveWorkflowStep[]` server-side — `header-project-switcher.tsx` couldn't read `step.requiredPosition` without a cast, which the plan explicitly said to avoid.
- **Fix:** Widened `WorkflowStepsProvider`/`useWorkflowSteps()`/its context to `LiveWorkflowStep[]`, importing the type with `import type` (compile-time only, doesn't trigger the `server-only` guard at runtime).
- **Files modified:** app/_components/workflow-steps-provider.tsx
- **Verification:** `npx tsc --noEmit` clean across all 4 consumers of `useWorkflowSteps()` (header-project-switcher, pending-step-gate, project-steps-board, invoice-timeline-form) — structural widening, no breaking changes since `LiveWorkflowStep` is a superset of `WorkflowStep`.
- **Committed in:** d8b9955 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were necessary for the filter to function at all — without them, `step.requiredPosition` would always have been `undefined` client-side and server-side, making the entire fix a silent no-op. No scope creep beyond what's needed for correctness.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `item.deadline` / `selected.deadline` (already existing on `PendingWork`/`ActiveProject`) are now reliably populated for new projects from creation, which is exactly what quick task 260713-s2l's countdown timer needs to render immediately instead of showing "No deadline" until step 4.
- No blockers for 260713-s2l, which touches only `pending-step-gate.tsx` and `header-project-switcher.tsx` (the latter already modified here — re-read fresh before editing, as instructed).

---
*Phase: quick-260714-b4t*
*Completed: 2026-07-14*
