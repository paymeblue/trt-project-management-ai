---
phase: 19-new-roles-assignment
plan: "03"
subsystem: ui
tags: [drizzle, postgres-enum, react, forms, workflow-configurator]

# Dependency graph
requires:
  - phase: 19-new-roles-assignment (19-01)
    provides: POSITION_VALUES/PositionValue/POSITION_LABELS in lib/workflow.ts and the users.position DB enum
provides:
  - Self-service profile position <select> constrained to POSITION_VALUES, with server-side validation coercing any non-enum value to null
  - Admin user-creation flow with position removed entirely (createUserAction no longer accepts/writes it)
  - Workflow Configurator requiredPosition control converted from free-text-fallback buttons to an enum-backed <select>
affects: [19-04, any future work touching users.position or requiredPosition/receiverRequiredPosition gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enum-constrained position UI: every position-picking control (profile select, Configurator requiredPosition select) sources its options directly from lib/workflow.ts's POSITION_VALUES/POSITION_LABELS — no hardcoded position lists in components"

key-files:
  created: []
  modified:
    - "app/(app)/profile/page.tsx"
    - "actions/profile.ts"
    - "app/_components/admin-create-user.tsx"
    - "actions/admin-users.ts"
    - "app/_components/workflow-configurator-shared.tsx"

key-decisions:
  - "D-19-03-A: Profile select offers ALL POSITION_VALUES (not role-scoped) — role-scoping is out of scope for Phase 19"
  - "D-19-03-B: Configurator drops the __custom__ free-text fallback entirely so a requiredPosition gate can never be set to a non-enum, never-matching value"

patterns-established:
  - "Position-picking UI derives its option list from lib/workflow.ts POSITION_VALUES/POSITION_LABELS, never a component-local hardcoded array"

requirements-completed: [ROLE-05]

# Metrics
duration: 6min
completed: 2026-07-11
---

# Phase 19 Plan 03: Enum-Constrained Position UI Summary

**Profile position field converted to a POSITION_VALUES-backed `<select>` with server-side enum validation; position removed from admin user creation; Workflow Configurator's requiredPosition control rebuilt as an enum-only select, dropping the free-text `__custom__` fallback that could author a never-matching gate.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-11T21:32:00+01:00
- **Completed:** 2026-07-11T21:36:00+01:00
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- `app/(app)/profile/page.tsx` now renders a `<select>` populated from `POSITION_VALUES`/`POSITION_LABELS` instead of a free-text input + `<datalist>` — a user can no longer type an arbitrary position string.
- `actions/profile.ts` guards the incoming `position` value against `POSITION_VALUES` before writing — any forged/out-of-enum value is coerced to `null` server-side (defense in depth alongside the DB enum from 19-01).
- `app/_components/admin-create-user.tsx` no longer collects a position at all; `actions/admin-users.ts`'s `createUserAction` no longer accepts or writes `position` — admin-created users start with `position: null`, satisfying "not collected at account creation."
- `app/_components/workflow-configurator-shared.tsx`'s `requiredPosition` control is now a plain enum-backed `<select>` (`Anyone with this role` + `POSITION_VALUES`); the `KNOWN_POSITIONS` array, the `__custom__` free-text branch, and the `customPosition` state were all removed since nothing else imported `KNOWN_POSITIONS` after Task 1 stripped its only other consumer.

## Task Commits

Each task was committed atomically:

1. **Task 1: Profile self-service position select + server-side validation; strip position from admin creation** - `b1b1f7d` (feat)
2. **Task 2: Convert the Workflow Configurator requiredPosition control to an enum-backed select** - `721554f` (feat)

## Files Created/Modified
- `app/(app)/profile/page.tsx` - position `<input list=datalist>` replaced with `<select>` sourced from `POSITION_VALUES`/`POSITION_LABELS`
- `actions/profile.ts` - `updateProfileAction` validates incoming position against `POSITION_VALUES`, coercing invalid values to `null`
- `app/_components/admin-create-user.tsx` - position field, state, and `KNOWN_POSITIONS` datalist import removed; form now collects only name, email, role
- `actions/admin-users.ts` - `createUserAction` input type, destructure, and `db.insert` no longer reference `position`
- `app/_components/workflow-configurator-shared.tsx` - `requiredPosition` control converted to an enum-backed `<select>`; `KNOWN_POSITIONS` export, `__custom__` branch, and `customPosition` state removed

## Decisions Made
- D-19-03-A: Profile select intentionally offers the full `POSITION_VALUES` list (not scoped by the user's role) — role-scoping the offered titles is explicitly out of scope for this plan/phase.
- D-19-03-B: The Configurator's free-text `__custom__` fallback was removed rather than kept alongside the enum select, because `users.position` is now a DB enum — a non-enum `requiredPosition` could never match any real user and would silently become a dead (unreachable) gate.

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria grep checks and `npx tsc --noEmit` / `npm run lint` passed clean on the first attempt for both tasks.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROLE-05 is now fully satisfied: position is not collected at account creation, and the self-service profile flow is constrained to the position enum's valid values end-to-end (UI select + server-side guard + DB enum).
- The Configurator can no longer author a `requiredPosition` value outside the enum, closing the "silent dead gate" risk noted in the threat model (T-19-09).
- Plan 19-04 (REQUIREMENTS.md checkbox/traceability updates for ROLE-01..07) can now mark ROLE-05 complete; this plan intentionally left REQUIREMENTS.md untouched per orchestrator instruction.
- No blockers for remaining Phase 19 work.

---
*Phase: 19-new-roles-assignment*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 5 modified files confirmed present on disk; both task commits (`b1b1f7d`, `721554f`) confirmed present in `git log --oneline --all`.
