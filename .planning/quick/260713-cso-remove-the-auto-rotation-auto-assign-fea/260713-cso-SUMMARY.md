---
phase: quick-260713-cso
plan: 01
subsystem: workflow-engine
tags: [workflow, assignment, engine, drizzle, next.js]

# Dependency graph
requires:
  - phase: v2.0 Phase 22 (ad hoc)
    provides: The `AUTO_ASSIGN_STEP_KEYS`/`autoAssignIfConfigured`/`triggerEntryAutoAssign` round-robin auto-assign feature being removed here
provides:
  - assign_designer_brief now behaves like every other ordinary assignment-kind step — sits pending until the Head Designer manually assigns via /workflow/step
affects: [workflow-graph, project-creation, flow-diagram, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - lib/workflow-graph.ts
    - actions/projects.ts
    - app/_components/trt-flow-diagram.tsx
    - lib/workflow.ts
    - db/workflow-live-steps.ts
    - lib/notifications.ts

key-decisions:
  - "Also reworded the stale auto-assign comment above setInvoiceTimelineAction in actions/projects.ts (not explicitly listed in the plan's files_modified) because it directly referenced the deleted autoAssignIfConfigured function and would have failed the plan's own zero-hits 'auto.assign' grep verification."

patterns-established: []

requirements-completed: [QUICK-260713-CSO]

# Metrics
duration: 12min
completed: 2026-07-13
---

# Quick Task 260713-cso: Remove auto-rotation auto-assign feature Summary

**Deleted the round-robin auto-assign engine (`AUTO_ASSIGN_STEP_KEYS`, `autoAssignIfConfigured`, `triggerEntryAutoAssign`) so `assign_designer_brief` is always manually assigned by the Head Designer, and updated every stale comment/UI blurb that still described it as automatic.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-13T08:09:00Z
- **Completed:** 2026-07-13T08:21:00Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments
- Removed all executable auto-assign code paths (engine function, allowlist constant, entry-trigger, call sites, and now-dead `inArray`/`getGraphSteps`/`autoAssignIfConfigured` imports) — `grep` for all three symbol names returns zero non-`node_modules` hits.
- New projects now park at `assign_designer_brief` (still `FIRST_ACTION_STEP = 2`) with the step sitting pending, exactly like any other `assignment`-kind step, until the Head Designer manually assigns via the normal `/workflow/step` UI.
- Updated every stale doc/UI-copy reference (flow-diagram blurb, `FIRST_ACTION_STEP` comment, two migration-history comment blocks in `db/workflow-live-steps.ts`, and `notifyUser`'s self-exclusion rationale in `lib/notifications.ts`) so no source file anywhere claims automatic assignment — `grep -rni "auto.assign"` across the repo returns zero hits.
- `tsc --noEmit`, `npm run lint`, `npm test` (77 passed, 1 todo), and `npm run build` all pass clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete the auto-assign engine and its call sites** - `6c5b858` (fix)
2. **Task 2: Update stale comments and UI copy, then run full verification** - `3b49179` (docs)

_Note: no plan-metadata commit created here — orchestrator handles the docs commit for SUMMARY.md/STATE.md separately._

## Files Created/Modified
- `lib/workflow-graph.ts` - Removed `AUTO_ASSIGN_STEP_KEYS`, `autoAssignIfConfigured`, and the `if (!done) { ... }` auto-assign call inside `syncProjectCurrentStepAfterCompletion`; narrowed `drizzle-orm` import to drop unused `inArray`.
- `actions/projects.ts` - Removed `triggerEntryAutoAssign` and its call site in `createProjectIntentAction`; narrowed `@/lib/workflow-graph` import to only `getLiveWorkflowSteps`; reworded the stale auto-assign comment above `setInvoiceTimelineAction`.
- `app/_components/trt-flow-diagram.tsx` - `assign_designer_brief` blurb now reads "Head Designer manually assigns a Designer or Architect to take the client's brief (5-day target)" instead of "(auto-assigned, 5-day max)".
- `lib/workflow.ts` - Reworded the comment above `FIRST_ACTION_STEP` to drop the `triggerEntryAutoAssign` reference and describe manual assignment.
- `db/workflow-live-steps.ts` - Reworded the Phase 22b and 22c historical migration-note comment blocks to stop claiming Assign Designer/Brief Taking were auto-assigned.
- `lib/notifications.ts` - Reworded `notifyUser`'s self-exclusion comment from "covers the auto-assign path" to a general "in case an actor assigns a step to themselves"; `notifyUser` logic itself unchanged.

## Decisions Made
- Extended Task 1's actions/projects.ts edits to also fix the stale comment above `setInvoiceTimelineAction` (not in the plan's literal file-line list for that function, but in the same file, same task's file scope, and directly referencing the deleted `autoAssignIfConfigured`) — required to satisfy the plan's own zero-hits verification grep for `auto.assign` and to avoid leaving a dangling reference to deleted code. Documented as a deviation below (Rule 1: bug fix — dangling reference to removed symbol).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale comment in actions/projects.ts referenced the deleted `autoAssignIfConfigured`**
- **Found during:** Task 1 (Delete the auto-assign engine and its call sites)
- **Issue:** The comment directly above `setInvoiceTimelineAction` said "Steps 3/4 (Assign Designer, Brief Taking) are already done by the time this runs — they're auto-assigned with an implicit 5-day SLA (see lib/workflow-graph.ts autoAssignIfConfigured)". This is now a dangling reference to a function that no longer exists, and it would have failed the plan's `auto.assign` grep verification (a check literally shared with Task 2).
- **Fix:** Reworded to "Steps 3/4 (Assign Designer, Brief Taking) are handled manually (Head Designer assigns; the assigned designer takes the brief) before this runs, so no deadline is set for them here."
- **Files modified:** `actions/projects.ts`
- **Verification:** `grep -rni "auto.assign"` returns zero hits; `tsc --noEmit` passes.
- **Committed in:** `6c5b858` (part of Task 1 commit)

## Self-Check: PASSED

Verified files exist and commits exist:
- FOUND: lib/workflow-graph.ts
- FOUND: actions/projects.ts
- FOUND: app/_components/trt-flow-diagram.tsx
- FOUND: lib/workflow.ts
- FOUND: db/workflow-live-steps.ts
- FOUND: lib/notifications.ts
- FOUND: 6c5b858 (git log)
- FOUND: 3b49179 (git log)

## Next Steps
None — this quick task is fully self-contained. `assign_designer_brief` now behaves identically to every other manual assignment-kind step; no follow-on work is implied.
