---
phase: quick-260716-djj
plan: 01
subsystem: api
tags: [authorization, workflow-graph, checklists, server-actions, security]

# Dependency graph
requires:
  - phase: quick-260716-c6s
    provides: canActOnGraphStep as the correct dualRoles-aware authorization primitive (already used for page-level display gating)
provides:
  - Server-side authorization gate in submitChecklistAction closing an elevation-of-privilege gap
affects: [checklist-submission, workflow-step-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-derive authoritative state (live workflow step) server-side before any DB write, never trust client-supplied slug/step pairing"

key-files:
  created: []
  modified: [actions/checklists.ts]

key-decisions:
  - "Reused canActOnGraphStep (the dualRoles-aware primitive established in quick-260716-c6s) instead of the bare canRoleActOnStep, so dual-role steps stay correctly authorized on the persistence path too"
  - "Gate only applies when the submission is step-linked (projectId && expectedStepN) — non-step-linked/optional checklist submissions keep today's unchanged behavior per plan scope"

patterns-established:
  - "Server-action mutation gates: re-fetch live authoritative data (getLiveWorkflowSteps) and check server-side role/slug match before the insert, returning an early { status: 'error' } — no throw"

requirements-completed: [SEC-CHECKLIST-AUTH]

# Metrics
duration: 6min
completed: 2026-07-16
---

# Quick Task 260716-djj: Fix Checklist Submission Authorization Gap Summary

**Closed an elevation-of-privilege gap in `submitChecklistAction` by re-deriving the live workflow step server-side and gating the DB insert on `canActOnGraphStep`, rejecting unauthorized-role and slug-mismatched step-linked submissions before any row is written.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-16T09:44:00+01:00 (approx)
- **Completed:** 2026-07-16T09:50:18+01:00
- **Tasks:** 2 (1 code change, 1 verification-only)
- **Files modified:** 1

## Accomplishments
- `submitChecklistAction` now authorizes step-linked submissions (`projectId && expectedStepN`) against the live workflow graph before persisting any `checklists`/`checklistResponses` row
- Also rejects a client-supplied `slug` that doesn't match the live step's actual slug, closing a spoofing path
- Confirmed the reused `canActOnGraphStep`/`canRoleActOnStep` primitive is unregressed via the existing `tests/lib/workflow.test.ts` suite (19/19 passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add server-side authorization gate to submitChecklistAction before insert** - `7febc31` (fix)
2. **Task 2: Regression-check reused authorization primitive** - no code changes; verification-only (grep confirmed no direct `submitChecklistAction` test exists; `tests/lib/workflow.test.ts` run confirmed no regression — 19/19 passed)

**Plan metadata:** committed separately by the orchestrator (docs commit not made by this executor per constraints)

## Files Created/Modified
- `actions/checklists.ts` - `submitChecklistAction` destructures `role` from `verifySession()`, imports `getLiveWorkflowSteps` (`@/lib/workflow-graph`) and `findStep`/`canActOnGraphStep`/`UserRole` (`@/lib/workflow`), and inserts an authorization gate immediately after photo validation and before the insert `try` block: for step-linked submissions, re-derives the live step by `expectedStepN`, and returns `You are not authorized to submit this checklist for this step.` if the step doesn't exist, the slug doesn't match, or the caller's role can't act on it.

## Decisions Made
- Reused `canActOnGraphStep` (not the bare `canRoleActOnStep`) so dual-role steps (e.g. the merged Materials/Delivery Readiness step) remain correctly authorized on this persistence path, consistent with the page-level fix already shipped in quick task 260716-c6s.
- Scoped the gate strictly to step-linked submissions per the plan's threat model (T-djj-03: non-step-linked/optional checklist submissions are explicitly out of scope and left unchanged).

## Deviations from Plan

None - plan executed exactly as written. Diff matches the plan's specified insertion point, imports, and gate logic precisely.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- No blockers. The authorization gap (T-djj-01/T-djj-02) is closed at the persistence layer, matching the display-layer fix from 260716-c6s.
- `tsc --noEmit`, `eslint actions/checklists.ts`, and `tests/lib/workflow.test.ts` all pass clean.

---
*Phase: quick-260716-djj*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: actions/checklists.ts
- FOUND: 7febc31 (commit)
- FOUND: .planning/quick/260716-djj-fix-checklist-submission-authorization-g/260716-djj-SUMMARY.md
