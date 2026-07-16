---
phase: quick-260716-hwh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/workflow.ts
  - app/_components/admin-users-table.tsx
  - app/_components/admin-create-user.tsx
  - actions/admin-users.ts
autonomous: true
requirements: [QUICK-260716-hwh]
must_haves:
  truths:
    - "Both admin role <select> dropdowns render all 10 roles, alphabetically sorted by label"
    - "A super_admin can create Super Admin and Operations accounts through the Create User form (UI + server accept)"
    - "Neither component declares its own local role list — both derive from one exported source"
  artifacts:
    - path: "lib/workflow.ts"
      provides: "Exported ALL_USER_ROLES derived+sorted from private USER_ROLE_LABELS"
      contains: "export const ALL_USER_ROLES"
    - path: "app/_components/admin-users-table.tsx"
      provides: "Users-table role select consuming ALL_USER_ROLES"
    - path: "app/_components/admin-create-user.tsx"
      provides: "Create-user role select consuming ALL_USER_ROLES"
    - path: "actions/admin-users.ts"
      provides: "createUserAction accepting super_admin/operations"
  key_links:
    - from: "app/_components/admin-users-table.tsx"
      to: "lib/workflow.ts"
      via: "import { ALL_USER_ROLES }"
      pattern: "ALL_USER_ROLES"
    - from: "app/_components/admin-create-user.tsx"
      to: "lib/workflow.ts"
      via: "import { ALL_USER_ROLES }"
      pattern: "ALL_USER_ROLES"
---

<objective>
Fix duplicated, drifted role dropdown lists in the two admin components by
deriving both from a single new exported source in `lib/workflow.ts`. Sort
alphabetically and restore full 10-role parity to the Create User form (currently
missing `super_admin` and `operations`), including relaxing the server-side
`CREATABLE_ROLES` allowlist so those roles are actually accepted on submit.

Purpose: A super admin must be able to create Super Admin / Operations accounts;
the two hand-duplicated lists must never drift apart again.
Output: One shared `ALL_USER_ROLES` export consumed by both components; server
action accepts all assignable roles.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@lib/workflow.ts
@app/_components/admin-users-table.tsx
@app/_components/admin-create-user.tsx
@actions/admin-users.ts

<interfaces>
From lib/workflow.ts (confirmed via source read):
- `export type UserRole` (line 54) — already exported.
- `const USER_ROLE_LABELS: Record<UserRole, string>` (line 217) — module-private,
  KEEP private. Complete map of all 10 roles → labels.
- `export function userRoleLabel(role: string): string` (line 230).

From actions/admin-users.ts (confirmed via source read):
- `const ASSIGNABLE_ROLES: UserRole[]` (line 14) — already lists ALL 10 roles,
  used by `updateUserRoleAction`.
- `const CREATABLE_ROLES: UserRole[]` (line 29) — currently EXCLUDES
  `Roles.SuperAdmin` and `Roles.Operations` (comment line 27-28 says "the
  admin/operations accounts still come from seeds"). `createUserAction` rejects
  with `if (!CREATABLE_ROLES.includes(role))` at line 62. THIS is the server-side
  gate that must be relaxed.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Export ALL_USER_ROLES, swap both components, relax CREATABLE_ROLES</name>
  <files>lib/workflow.ts, app/_components/admin-users-table.tsx, app/_components/admin-create-user.tsx, actions/admin-users.ts</files>
  <action>
  1. `lib/workflow.ts` — Add a new exported const near `userRoleLabel` (line ~230),
     derived from the existing private `USER_ROLE_LABELS` so it can never drift:
     `export const ALL_USER_ROLES: { value: UserRole; label: string }[]` built from
     `Object.entries(USER_ROLE_LABELS).map(([value, label]) => ({ value: value as UserRole, label })).sort((a, b) => a.label.localeCompare(b.label))`.
     Include a comment noting it is the single source of truth for admin role
     `<select>` dropdowns and must not be hand-duplicated. Do NOT export
     `USER_ROLE_LABELS` itself.

  2. `app/_components/admin-users-table.tsx` — Delete the local `ROLES` const
     entirely. Add `import { ALL_USER_ROLES } from '@/lib/workflow'` (merge with any
     existing `@/lib/workflow` import if present). Replace the single call site
     `{ROLES.map(...)}` with `{ALL_USER_ROLES.map(...)}`. Leave `ADMIN_ROLES` and
     everything else untouched.

  3. `app/_components/admin-create-user.tsx` — Delete the local (incomplete) `ROLES`
     const entirely. Add `import { ALL_USER_ROLES } from '@/lib/workflow'` (merge
     with existing workflow import if present). Replace `{ROLES.map(...)}` with
     `{ALL_USER_ROLES.map(...)}`. Match this file's existing style (semicolons etc.);
     do not impose the other file's conventions.

  4. `actions/admin-users.ts` — Relax `CREATABLE_ROLES` (line 29) so a super admin
     can create any role per the user's explicit decision. Simplest correct fix:
     make `createUserAction` validate against `ASSIGNABLE_ROLES` (which already lists
     all 10) instead of `CREATABLE_ROLES`, OR add `Roles.SuperAdmin` and
     `Roles.Operations` to `CREATABLE_ROLES`. Update the now-stale comment at
     line 27-28 ("still come from seeds"). Do not weaken the `requireAdmin` guard.
  </action>
  <verify>
    <automated>grep -q "export const ALL_USER_ROLES" lib/workflow.ts && ! grep -q "const ROLES" app/_components/admin-users-table.tsx && ! grep -q "const ROLES" app/_components/admin-create-user.tsx && grep -q "ALL_USER_ROLES" app/_components/admin-users-table.tsx && grep -q "ALL_USER_ROLES" app/_components/admin-create-user.tsx</automated>
  </verify>
  <done>
  `ALL_USER_ROLES` exported and sorted; both components import and use it with no
  local `ROLES` const remaining; `ADMIN_ROLES` untouched; `createUserAction` accepts
  `super_admin` and `operations`; stale seeds comment updated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Typecheck and lint</name>
  <files>(no new files)</files>
  <action>
  Run `npx tsc --noEmit` and `npm run lint`. Fix any errors introduced by the
  changes (e.g. unused import if a component previously imported nothing from
  workflow, or a dangling reference to the removed `ROLES`). No test file exists for
  either component or for admin-users (confirmed: `tests/` has no admin-users test),
  and none is required for this pure dropdown-content fix. In SUMMARY.md, note which
  server-side case applied: `CREATABLE_ROLES` was relaxed (it previously excluded
  super_admin/operations — confirmed) — state exactly how it was changed.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>`npx tsc --noEmit` passes and `npm run lint` passes with no new errors.</done>
</task>

</tasks>

<verification>
- Both dropdowns render 10 alphabetically sorted roles from `ALL_USER_ROLES`.
- Create User form now offers Super Admin and Operations; server accepts them.
- No local `ROLES` const remains in either component; `ADMIN_ROLES` unchanged.
- `USER_ROLE_LABELS` remains module-private.
- tsc + lint clean.
</verification>

<success_criteria>
A super_admin can create Super Admin and Operations accounts via the Create User
form; both admin role dropdowns are sorted and complete; the two lists derive from
one exported source and cannot drift again.
</success_criteria>

<output>
Create `.planning/quick/260716-hwh-fix-duplicated-drifted-role-dropdown-lis/260716-hwh-SUMMARY.md` when done.
</output>
