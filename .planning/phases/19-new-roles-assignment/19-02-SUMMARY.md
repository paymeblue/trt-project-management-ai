---
phase: 19-new-roles-assignment
plan: "02"
subsystem: ui
tags: [nextjs, react, dashboard-shell, sidebar-nav, workflow-roles]

# Dependency graph
requires:
  - phase: 15-role-dashboard-shells
    provides: DashboardShell component + Phase 15 per-role dashboard pattern (design/production/architect)
  - phase: 19-01
    provides: users.position DB enum (unrelated to this plan's files, but same phase/wave ordering)
provides:
  - Dedicated dashboard shells (nav + landing page) for factory_operations and factory_manager, replacing their fallback to /production/dashboard
  - About page organogram entries for both new roles
affects: [phase-22-production-pipeline, phase-19-03, phase-19-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase 15 dashboard-shell pattern (auth() + DashboardShell + Tile[] const) copied verbatim for two more roles"

key-files:
  created:
    - "app/(app)/factory-operations/dashboard/page.tsx"
    - "app/(app)/factory-manager/dashboard/page.tsx"
  modified:
    - "lib/workflow.ts"
    - "app/_components/sidebar-nav.tsx"
    - "app/(app)/about/page.tsx"

key-decisions:
  - "trt-flow-diagram.tsx required no changes — ROLE_COLOR, the role legend ordering array, and DETAIL blurbs for production_process/factory_manager_readiness were already shipped ad hoc in Phase 22e, ahead of this plan"

patterns-established: []

requirements-completed: [ROLE-01]

# Metrics
duration: 15min
completed: 2026-07-11
---

# Phase 19 Plan 02: Factory Operations & Factory Manager Dashboard Shells Summary

**Dedicated `/factory-operations/dashboard` and `/factory-manager/dashboard` shells (nav + landing page) replace both roles' prior fallback to `/production/dashboard`, completing ROLE-01.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-11T21:15:00+01:00 (approx.)
- **Completed:** 2026-07-11T21:30:24+01:00
- **Tasks:** 2/2 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `factory_operations` and `factory_manager` each land on their own dashboard shell with their own 4-item sidebar nav (Dashboard/Processes/Profile/About), no longer sharing Production's dashboard
- `ROLE_DASHBOARD` map in `lib/workflow.ts` updated; the now-inaccurate "reuse Production dashboard" comment removed
- About page organogram (`ROLES` array) gained Factory Operations and Factory Manager entries, describing their real, already-live workflow steps (Production Process checklist and Quality Control readiness forms respectively — both shipped ad hoc in Phase 22e)
- Confirmed `trt-flow-diagram.tsx` needed zero changes — its `ROLE_COLOR`, legend ordering, and `DETAIL` blurbs for `production_process`/`factory_manager_readiness` already cover both roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the two dashboard shells, ROLE_DASHBOARD entries, and sidebar nav** - `7690b99` (feat)
2. **Task 2: Add Factory Operations and Factory Manager to the About organogram** - `2c97a26` (docs)

_No plan-metadata commit yet — this SUMMARY.md and STATE.md are committed as part of this same execution, per orchestrator instruction not to touch ROADMAP.md/REQUIREMENTS.md (deferred to plan 19-04)._

## Files Created/Modified
- `lib/workflow.ts` - `ROLE_DASHBOARD.factory_operations` -> `/factory-operations/dashboard`, `ROLE_DASHBOARD.factory_manager` -> `/factory-manager/dashboard`; removed stale "reuse Production" comment
- `app/_components/sidebar-nav.tsx` - Added `factory_operations` and `factory_manager` NAV entries (Dashboard/Processes/Profile/About), mirroring the `production`/`architect` shape
- `app/(app)/factory-operations/dashboard/page.tsx` (new) - Server component, `auth()` + `DashboardShell`, `role="factory_operations"`, tiles referencing the Production Process checklist
- `app/(app)/factory-manager/dashboard/page.tsx` (new) - Server component, `auth()` + `DashboardShell`, `role="factory_manager"`, tiles referencing the Quality Control readiness forms
- `app/(app)/about/page.tsx` - `ROLES` array gained Factory Operations and Factory Manager entries before Super Admin

## Decisions Made
- Kept blurb text for both new About-page entries honest about steps already being live in the DB graph (Phase 22e shipped `production_process` and `factory_manager_readiness` ad hoc before this plan ran) rather than describing them as "coming in Phase 22" — that would have been inaccurate given STATE.md's Decisions log.
- Made no changes to `trt-flow-diagram.tsx` per the plan's own conditional instruction (Task 2b) — verified by direct grep that `ROLE_COLOR`, the `ROLES` legend-ordering array, and `DETAIL` already had `factory_operations`/`factory_manager` entries, all shipped ad hoc in Phase 22e.

## Deviations from Plan

### Notable but non-fixing observation (not a Rule 1-4 deviation)

**Task 1's literal acceptance criterion `grep -c "/production/dashboard" lib/workflow.ts == 0` cannot be satisfied without regressing the pre-existing `production` role.**
- **Found during:** Task 1 verification
- **Issue:** `lib/workflow.ts`'s `ROLE_DASHBOARD` map still legitimately contains `production: '/production/dashboard'` (the `production` role's own, correct dashboard route, shipped in Phase 15) — this line alone makes the literal file-wide grep count 1, not 0, even though both `factory_operations` and `factory_manager` no longer reference `/production/dashboard` anywhere.
- **Resolution:** Did NOT remove or alter the `production` role's own dashboard mapping — doing so to satisfy the literal grep would have broken the live Production dashboard route, a clear regression outside this plan's scope. Verified instead with the narrower, correct checks (`grep -c "factory_operations: '/factory-operations/dashboard'"` == 1, `grep -c "factory_manager: '/factory-manager/dashboard'"` == 1, and manual inspection confirming neither new role's entry mentions `/production/dashboard` any longer), which is what the plan's own must-haves truth ("Neither new role's dashboard falls back to /production/dashboard any longer") actually requires.
- **Files modified:** None beyond the planned `lib/workflow.ts` change.
- **Verification:** Manual grep + `npx tsc --noEmit` + `npm run lint`, both clean.
- **Committed in:** `7690b99` (Task 1 commit)

---

**Total deviations:** 0 auto-fixes (Rules 1-4 did not trigger); 1 documented acceptance-criterion discrepancy, resolved in favor of the plan's own stated intent (must_haves truth) over an overly broad literal grep.
**Impact on plan:** None on scope — no unplanned code changes were made; only a verification-method judgment call.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ROLE-01 requirement complete for `factory_operations` and `factory_manager` — both now have first-class dashboard shells matching the Phase 15 pattern used by `design`, `production`, `architect`, and `customer_care`.
- Ready for Phase 22 to wire real checklist/readiness content into these dashboards' "Project flows" tiles (currently pointing at pending-work-only, no operational data rendered, matching the threat model's `accept`/`mitigate` dispositions for T-19-05/T-19-06).
- REQUIREMENTS.md ROLE-01..07 checkboxes intentionally left untouched — that's plan 19-04's job per the orchestrator's instructions for this execution.

---
*Phase: 19-new-roles-assignment*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: app/(app)/factory-operations/dashboard/page.tsx
- FOUND: app/(app)/factory-manager/dashboard/page.tsx
- FOUND: commit 7690b99 (Task 1)
- FOUND: commit 2c97a26 (Task 2)
