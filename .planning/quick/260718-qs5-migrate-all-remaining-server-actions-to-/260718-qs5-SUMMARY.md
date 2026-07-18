---
quick_id: 260718-qs5
slug: migrate-all-remaining-server-actions-to-
status: complete
date: 2026-07-18
commits:
  - bf50b33 feat(auth): migrate ALL Server Actions to the bound per-tab-token pattern (D-20.1-04-A fast-follow)
---

# Summary — 260718-qs5

The D-20.1-04-A scope limitation is CLOSED: per-tab session tabs are now completely
separate from the shared cookie identity for EVERY mutation, not just profile +
notifications.

## What changed (53 files, commit bf50b33)

- **lib/dal.ts** — new `requireAdminForAction(tabToken)`.
- **16 action files** (38 DAL call sites) — every mutating Server Action takes a
  required `tabToken: string | null` first param and resolves identity via
  `verifySessionForAction`/`requireAdminForAction`: admin-users, bypass, checklists,
  content, disputes, email-formats, escalation, issues, positions, processes,
  product-readiness, projects, readiness, workflow, workflow-config, workflow-graph.
  Internal cross-action calls (checklists/readiness → advanceOrConfirmDualRole →
  confirmDualRoleStep/advanceProjectStep; workflow-graph's shared authorizeStep;
  checklists' authorizeChecklistEdit/authorizeItemEdit; workflow-config's
  requireUnlockedAdmin) all thread the token.
- **workflow-config PIN unlock** — cookie validation split into `isUnlockedFor(userId)`
  so a per-tab admin's unlock cookie is validated against the per-tab identity;
  `isConfiguratorUnlocked()` (server-component path) keeps header-aware `requireAdmin`.
- **~25 client components** — programmatic calls pass `getTabToken()`; `useActionState`
  sites bind it; new **`app/_components/tab-token-form.tsx`** wraps the 7
  server-component-rendered forms (site-pm issues create/toggle/escalate, admin issues
  toggle, disputes post, about edit, email-formats edit).
- **Tests** — dal mocks widened, call sites updated, readiness assertion fixed, plus
  5 NEW tests: escalation token-forwarding assertion and 4 `requireAdminForAction`
  cases (admin token passes, non-admin token FORBIDDEN, cookie fallback both ways).

## Compile-time guarantee

`tabToken` is a REQUIRED first parameter — an unmigrated or future call site fails
`tsc`, so this class of silent identity bug cannot be reintroduced unnoticed.

## Gates & live proof

- `tsc --noEmit` 0 errors · lint 0 errors (4 pre-existing warnings) · `npm test`
  28 files, 233 passed + 1 todo.
- **Cross-identity live proof**: shared cookie qa.factory (factory_pm, NON-admin) +
  per-tab qa.ops2 (operations, admin). About-page edit via TabTokenForm SAVED with
  `static_content.updated_by = qa.ops2` — the shared-cookie identity could not have
  performed that admin-gated write. Content reverted after the proof.
- `requireAdminForAction` live: configurator PIN gate returned "Incorrect PIN." in the
  per-tab tab (auth via token passed; wrong-PIN logic ran).
- Shared-cookie regression sweep: 5 migrated pages rendered with zero errors and zero
  restore-bounces after clearing sessionStorage.

## Exemptions (by design)

`auth.ts`/`tab-auth.ts`/`email-auth.ts` (session establishment), `signOutAction`
(signs out the shared cookie session; per-tab tabs use TabSignOutButton),
`isConfiguratorUnlocked` (server component, header-aware path),
`confirmDualRoleStepAs` (auth-free core for the CLI verify harness).
`addProductFileAction` was found to be pre-existing dead code (no callers) — migrated
for consistency, not removed.
