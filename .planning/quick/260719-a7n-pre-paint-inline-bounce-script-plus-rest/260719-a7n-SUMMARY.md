---
quick_id: 260719-a7n
slug: pre-paint-inline-bounce-script-plus-rest
status: complete
date: 2026-07-19
commits:
  - 9e72759 fix(auth): pre-paint restore bounce + expired-token identity recovery; fix(checklists): all admin roles can edit
---

# Summary — 260719-a7n: bulletproof per-tab restore + two user reports

## Why the user still saw the wrong user after refresh

Two client-side dependencies remained after aa3de81, and either one produces
"refresh shows the other tab's user":

1. **Hydration dependency.** The bounce lived in TabSessionProvider's mount
   effect. The user's browser runs a DOM-mutating extension (`jf-ext-*`
   attributes, visible as hydration-mismatch errors in the dev log) — if
   hydration degrades, the effect never runs and the wrong-identity render
   sticks. Clean test browsers (no extensions) always passed, which is why the
   bug reproduced for the user but not in verification.
2. **Expired-token chain.** Background-tab timers are throttled, so a tab idle
   >20min holds a dead access token. The restore navigation then failed closed
   to /sign-in, whose cookie-holder redirect forwarded the tab to the COOKIE
   user's dashboard — a silent identity swap to exactly the other tab's user.

## Fix (commit 9e72759)

- **Pre-paint inline bounce**: a `beforeInteractive` script in the root
  layout head (like the theme-init precedent) redirects token-holding tabs to
  `/tab-session/restore?to=<path+search>` before first paint. Inline in the
  HTML document → always current, no hydration, no stale bundles, no flash.
  The provider keeps its effect-time bounce as a fallback.
- **Restore-page token refresh**: if the access token is within 60s of expiry
  (or past it) and a refresh token exists, the restore page refreshes FIRST,
  then soft-navigates — idle tabs recover their own identity. A dead refresh
  token (>8h) clears the session and falls through natively (honest cookie
  identity, never a silent swap).

## Also fixed (user reports, same session)

- **canEditChecklist → isAdminRole** (lib/workflow.ts): operations-role
  admins (e.g. position operations_manager_admin) were locked out of
  /admin/checklists while the page promised "a super admin or Operations can
  edit". Live-proven: operations user now gets the full editor. Supersedes
  v1.1's super-admin-only decision per explicit user request.
- **"No Head of Design" report**: verified NOT a bug — "Head of Design" is a
  POSITION (data-driven positions table, confirmed present in the live DB and
  in the /admin/users Position dropdown, live). The screenshot showed the
  ROLE dropdown, where titles intentionally don't live (locked v2.0 decision:
  titles are `users.position`; the workflow engine's step gates depend on it).

## Live proof (real browser)

- Native navigation to /admin/checklists in a token tab was caught mid-bounce
  at `/tab-session/restore?to=%2Fadmin%2Fchecklists` — the PRE-PAINT script
  drove it.
- Expired-token recovery: t1 (qa.ops2 token, expiry forced past) reloaded
  while the cookie belonged to qa.factory — came back as QA Ops Tester 2 via
  a real /api/auth/tab-refresh round trip, NOT the cookie user.
- Regression: t2 (qa.factory) reload keeps QA Factory; operations user edits
  checklists; "Head of Design" present in the live Position dropdown.

## Gates

247 passed + 1 todo (5 new restore-page jsdom tests), tsc 0 errors, lint 0
errors (4 pre-existing warnings).
