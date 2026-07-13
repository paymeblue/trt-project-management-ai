---
phase: quick/260713-ekr
plan: 01
subsystem: auth
tags: [authorization, workflow-graph, drizzle, next.js, security-fix]

# Dependency graph
requires:
  - phase: v2.0 Phase 22c (ad hoc, commit 0d8bacd)
    provides: the design pipeline itself (assign_designer_brief -> brief_taking -> design_initiation -> kickoff_meeting -> design_stage) and the assignment-kind step engine (assignUser) this gate reads assignedUserId from
provides:
  - Server-side assignee gate (lib/workflow-graph.ts getStepAssigneeGate + assigneeGoverningStepKey) scoping brief_taking/kickoff_meeting/design_stage to the one person assigned at the preceding assignment step
  - authorizeStep (actions/workflow-graph.ts) enforcement at the server-action boundary — the non-negotiable fix
  - Defense-in-depth denial in the workflow/step page render path
  - getMyWork(role, userId) gatedToUserId filtering so the forcing modal and header switcher stop nagging the wrong person
  - Read-only live-DB verification script (scripts/verify-assignee-gate.ts)
affects: [workflow-graph, my-work, header-project-switcher, design-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Assignee gate as a deliberately narrow hardcoded map (ASSIGNEE_GATED_STEPS), not a generic assignee-scoping framework — mirrors the codebase's existing preference for targeted exceptions (canRoleActOnStep's Operations/Architect special cases) over general hierarchies"
    - "Gate computed once per project in getMyWork and reused for both activeProjects.gatedToUserId and the pending filter, avoiding a duplicate DB round trip per project"

key-files:
  created:
    - tests/lib/workflow-graph-assignee-gate.test.ts
    - scripts/verify-assignee-gate.ts
  modified:
    - lib/workflow-graph.ts
    - actions/workflow-graph.ts
    - app/(app)/workflow/step/page.tsx
    - lib/workflow.ts
    - lib/my-work.ts
    - app/api/my-work/route.ts
    - app/(app)/layout.tsx
    - app/_components/header-project-switcher.tsx

key-decisions:
  - "ASSIGNEE_GATED_STEPS is a hardcoded Record<string,string>, not a DB column or generic framework — matches the plan's explicit scope boundary and the codebase's existing pattern of small, well-commented hardcoded exceptions"
  - "No super_admin bypass added — canRoleActOnStep already denies super_admin at the role gate before the assignee gate is ever reached, consistent with every existing gate in this codebase"
  - "project-steps-board.tsx / lib/projects-board.ts left untouched (deliberately out of scope per plan) — its only viewers (factory_pm/site_pm) never match a design-role gate, so it exposes no live bug today"

requirements-completed: [BUGFIX-assignee-scope]

# Metrics
duration: 5min
completed: 2026-07-13
---

# Quick Task 260713-ekr: Scope Design/Architect Steps to the Assigned Person Summary

**Closed a live, security-critical authorization gap: brief_taking/kickoff_meeting/design_stage were role-gated only (any design/architect user could complete another project's assigned step); now they're scoped server-side to the one person chosen at the preceding assignment step, with the forcing modal and header switcher fixed to match.**

## Performance

- **Duration:** ~5 min (task execution; git commit timestamps 14:43:04 -> 14:47:25)
- **Started:** 2026-07-13T14:43:04+01:00
- **Completed:** 2026-07-13T14:47:25+01:00
- **Tasks:** 3
- **Files modified:** 8 (+ 2 created)

## Accomplishments
- `getStepAssigneeGate` + `assigneeGoverningStepKey` (lib/workflow-graph.ts) — the single source of truth resolving a gated step's required assignee, read-only, never throws on not-yet-assigned
- `authorizeStep` (actions/workflow-graph.ts) enforces the gate at the real security boundary, after role + position checks, across all 5 call sites (complete/submitYesNoUpload/sendApproval/receiveApproval/assignUser actions); `assignee-mismatch` added to `ENGINE_ERROR_MESSAGES`
- `app/(app)/workflow/step/page.tsx` denies a non-assignee before rendering the form (defense-in-depth)
- `getMyWork(role, userId)` now filters `pending` and emits `gatedToUserId` per active project; `HeaderProjectSwitcher` gates its "mine"/"your turn" signal on `viewerUserId === gatedToUserId`
- Live-DB verification (`scripts/verify-assignee-gate.ts`) reproduced the exact reported bug scenario against real data: project "Test Project" is sitting at `brief_taking`, and `getStepAssigneeGate` correctly resolves to the assignee recorded on `assign_designer_brief` — confirming the fix closes the gap the user actually hit

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side assignee gate — the security boundary** - `02497e7` (feat)
2. **Task 2: Fix the forcing modal + header switcher** - `8d48a95` (fix)
3. **Task 3: Full verification gate + read-only live-DB check** - `2537df3` (test)

_Docs commit (SUMMARY.md/STATE.md) handled separately by the orchestrator._

## Files Created/Modified
- `lib/workflow-graph.ts` - Added `ASSIGNEE_GATED_STEPS` map, `assigneeGoverningStepKey` (pure), `getStepAssigneeGate` (async, read-only)
- `actions/workflow-graph.ts` - `authorizeStep` now takes `projectId`, enforces the gate; `assignee-mismatch` error message; all 5 call sites updated
- `app/(app)/workflow/step/page.tsx` - Denies non-assignees before rendering the step form
- `lib/workflow.ts` - `ActiveProject` gained `gatedToUserId: string | null`
- `lib/my-work.ts` - `getMyWork(role, userId)`; per-project gate computed once, reused for `activeProjects` and the `pending` filter
- `app/api/my-work/route.ts` - Passes `userId` from `verifySession()` to `getMyWork`
- `app/(app)/layout.tsx` - Passes `session.user.id` to `getMyWork` and `viewerUserId` to `HeaderProjectSwitcher`
- `app/_components/header-project-switcher.tsx` - New `viewerUserId` prop; `mine`/`youract` now also require `gatedToUserId === null || gatedToUserId === viewerUserId`
- `tests/lib/workflow-graph-assignee-gate.test.ts` (new) - Pure unit tests for `assigneeGoverningStepKey`
- `scripts/verify-assignee-gate.ts` (new) - Read-only live-DB harness: re-confirms governance adjacency, checks a real project's gate resolution, confirms a non-gated key resolves to null

## Decisions Made
- Kept `ASSIGNEE_GATED_STEPS` as a small hardcoded map (not a DB column) — matches plan scope and existing codebase convention for targeted, well-commented exceptions
- No super_admin bypass — consistent with `canRoleActOnStep` already denying super_admin on design-role steps before the assignee gate is reached
- `project-steps-board.tsx` deliberately untouched — confirmed by the plan's pre-planning sweep as not exposing this bug today (its only viewers never match a design-role gate)

## Deviations from Plan

None - plan executed exactly as written. The test-file `vi.mock('server-only', ...)` / `vi.mock('@/db', ...)` setup and the dynamic `await import(...)` pattern in `tests/lib/workflow-graph-assignee-gate.test.ts` were necessary implementation detail to make the pure-unit-test import work (mirroring the existing `tests/actions/workflow.test.ts` mocking pattern) — not a deviation from the plan's intent ("Do not import the DB-touching getStepAssigneeGate in the unit test — keep the test pure"), which was honored: only the pure `assigneeGoverningStepKey` helper is exercised.

## Issues Encountered
None. The live-DB verification script ran cleanly on the first attempt and immediately confirmed the fix against the real "Test Project" bug scenario described in the plan's objective.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Security-critical gap closed and verified against live production data.
- Deferred by design (documented in the plan, not a gap): `project-steps-board.tsx` gatedToUserId wiring — add only if/when a design-role projects board ships.
- Ready for Phase 20 (Payment & Timeline Gating), per STATE.md's existing position.

---
*Phase: quick/260713-ekr*
*Completed: 2026-07-13*

## Self-Check: PASSED

All 10 created/modified files confirmed present on disk; all 3 task commits (02497e7, 8d48a95, 2537df3) confirmed in git log.
