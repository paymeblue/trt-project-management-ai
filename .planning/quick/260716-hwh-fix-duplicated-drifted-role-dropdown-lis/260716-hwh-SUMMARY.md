---
phase: quick-260716-hwh
plan: 01
subsystem: ui
tags: [react, nextjs, admin, forms, drizzle]

# Dependency graph
requires: []
provides:
  - "ALL_USER_ROLES exported from lib/workflow.ts as single source of truth for admin role dropdowns"
  - "Full 10-role parity between the users-table role editor and the create-user form"
  - "createUserAction accepting all 10 assignable roles, including super_admin and operations"
affects: [admin-users-table, admin-create-user, admin-users-actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive UI option lists from an existing private label map (Object.entries + sort) instead of hand-duplicating arrays across components"

key-files:
  created: []
  modified:
    - lib/workflow.ts
    - app/_components/admin-users-table.tsx
    - app/_components/admin-create-user.tsx
    - actions/admin-users.ts

key-decisions:
  - "Removed CREATABLE_ROLES entirely rather than adding super_admin/operations to it — createUserAction now validates against the existing ASSIGNABLE_ROLES (already the full 10-role list used by updateUserRoleAction), avoiding a second near-duplicate role list"

patterns-established:
  - "Single source of truth for role option lists: ALL_USER_ROLES (lib/workflow.ts), derived + sorted from the private USER_ROLE_LABELS map; components import it rather than declaring local ROLES consts"

requirements-completed: [QUICK-260716-hwh]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Quick Task 260716-hwh: Fix Duplicated/Drifted Role Dropdown Lists Summary

**Unified both admin role `<select>` dropdowns behind one exported, alphabetically-sorted `ALL_USER_ROLES` list and relaxed server-side role validation so a super admin can create Super Admin and Operations accounts.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T11:46:00Z (approx)
- **Completed:** 2026-07-16T11:58:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added `export const ALL_USER_ROLES` in `lib/workflow.ts`, derived from the existing private `USER_ROLE_LABELS` map (`Object.entries(...).map(...).sort((a, b) => a.label.localeCompare(b.label))`) so the dropdown list can never drift from the canonical label map again
- Removed the two hand-duplicated, drifted local `ROLES` consts in `admin-users-table.tsx` and `admin-create-user.tsx`; both now import and render `ALL_USER_ROLES`, giving both dropdowns all 10 roles in alphabetical order
- Relaxed server-side role validation in `createUserAction` so `super_admin` and `operations` are accepted on submit, closing the gap where the UI now offers roles the server previously rejected

## Task Commits

Each task was committed atomically:

1. **Task 1: Export ALL_USER_ROLES, swap both components, relax CREATABLE_ROLES** - `b36c4af` (fix)
2. **Task 2: Typecheck and lint** - no code changes; verification-only task (see below)

_Note: Task 2 was a pure verification task (`npx tsc --noEmit` + `npm run lint`) with no file changes, so it produced no separate commit._

## Files Created/Modified
- `lib/workflow.ts` - Added exported `ALL_USER_ROLES: { value: UserRole; label: string }[]`, derived + sorted from the still-private `USER_ROLE_LABELS`
- `app/_components/admin-users-table.tsx` - Removed local `ROLES` const, imports and renders `ALL_USER_ROLES` in the role `<select>`; `ADMIN_ROLES` guard logic untouched
- `app/_components/admin-create-user.tsx` - Removed local (incomplete, 8-role) `ROLES` const, imports and renders `ALL_USER_ROLES`; preserved file's existing semicolon style
- `actions/admin-users.ts` - Removed `CREATABLE_ROLES` (previously excluded `super_admin`/`operations` with a stale "still come from seeds" comment); `createUserAction` now validates against `ASSIGNABLE_ROLES` (the pre-existing full 10-role list already used by `updateUserRoleAction`)

## Decisions Made
- **Server-side validation approach:** The plan offered two options — add `super_admin`/`operations` to `CREATABLE_ROLES`, or validate against `ASSIGNABLE_ROLES` instead. Chose the latter: `ASSIGNABLE_ROLES` already contained all 10 roles and was already the source of truth for `updateUserRoleAction`. Keeping `CREATABLE_ROLES` around with all 10 roles would have made it a second, functionally-identical list — exactly the drift pattern this task fixes. Deleted `CREATABLE_ROLES` and pointed `createUserAction`'s check at `ASSIGNABLE_ROLES` instead, and updated the stale comment.
- **`USER_ROLE_LABELS` stayed private** as instructed by the plan; only the derived `ALL_USER_ROLES` array is exported.
- **`ADMIN_ROLES` in `admin-users-table.tsx` left untouched** — it's a separate protection-guard list (`['super_admin', 'operations']`) unrelated to the dropdown-options drift being fixed here.

## Deviations from Plan

None - plan executed exactly as written. The plan explicitly offered a choice between two equally valid server-side fixes for `CREATABLE_ROLES` ("Simplest correct fix: make `createUserAction` validate against `ASSIGNABLE_ROLES`... OR add `Roles.SuperAdmin` and `Roles.Operations` to `CREATABLE_ROLES`"); the `ASSIGNABLE_ROLES` option was selected per the plan's own "simplest correct fix" framing, so this is not a deviation.

## Issues Encountered
None. `npx tsc --noEmit` and `npm run lint` both passed cleanly after the changes — no new errors or warnings introduced (pre-existing unrelated warnings in `app/layout.tsx` and `tests/actions/workflow.test.ts` are out of scope and untouched).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both admin role dropdowns are now guaranteed to stay in sync via `ALL_USER_ROLES`; any future role addition only requires editing `USER_ROLE_LABELS` once.
- A super admin can now create Super Admin and Operations accounts end-to-end (UI offers the option, server accepts it, `ASSIGNABLE_ROLES` already covered downstream role-update flows).
- No blockers for follow-on work.

---
*Phase: quick-260716-hwh*
*Completed: 2026-07-16*

## Self-Check: PASSED

All modified files (`lib/workflow.ts`, `app/_components/admin-users-table.tsx`, `app/_components/admin-create-user.tsx`, `actions/admin-users.ts`) exist on disk, and commit `b36c4af` is present in `git log --oneline --all`.
