---
status: complete
---

# Quick Task 260716-c6s: Fix dual-role step confirmation gate

## What changed

Two page-level step-authorization gates used the bare `canRoleActOnStep(step.role, role)`
check, which only matches a step's single primary `role` column. For steps with
`dualRoles` configured (e.g. `materials_readiness`, `dualRoles: ['factory_pm', 'site_pm']`),
this incorrectly blocked the non-primary role from ever reaching the form to submit their
independent confirmation — even though the backend action (`confirmDualRoleStepAs` in
`actions/workflow.ts`) already correctly accepts any role listed in `dualRoles`.

`lib/workflow.ts` already exports `canActOnGraphStep(step, userRole)` for exactly this case
(falls back to checking `step.dualRoles?.includes(userRole)`), and its doc comment explicitly
flags every "can this user act on this step" check as required to use it. Two call sites had
been missed in that migration.

## Files changed

- `app/(app)/checklists/[slug]/page.tsx` — swapped `canRoleActOnStep(step.role, role as UserRole)`
  for `canActOnGraphStep(step, role as UserRole)`; import updated accordingly (`canEditChecklist`
  import preserved).
- `app/(app)/factory-pm/readiness/page.tsx` — same swap, same reasoning (defense-in-depth; this
  page is currently only reachable by `factory_pm` via `stepHref` routing, but the gate should
  still honor the documented `dualRoles` contract).
- `scripts/inspect-factory-pm-gap.ts` — deleted (throwaway, untracked investigation script used
  only to diagnose this bug; confirmed via live DB query that `factory_pm` users and the
  `dualRoles` step config already exist correctly, so no data/schema fix was needed).

## Commit

`727672f` — fix(quick-260716-c6s): swap both page gates to dualRoles-aware canActOnGraphStep

## Verification (run in the executor's worktree)

- `npx tsc --noEmit` — clean
- `npx eslint` on both changed files — clean
- `npx vitest run tests/lib/workflow.test.ts` — 19/19 passed (no regression on `canRoleActOnStep`,
  which is unaffected — still used correctly in the single-role-only call sites)

## Out of scope (intentionally untouched)

`actions/workflow-graph.ts`, `actions/bypass.ts`, `app/(app)/workflow/step/page.tsx` — these gate
step kinds (`approval`, `assignment`, `yes_no_upload`, `timeline_setting`) that don't support
`dualRoles`, so the bare `canRoleActOnStep` check is correct there.
