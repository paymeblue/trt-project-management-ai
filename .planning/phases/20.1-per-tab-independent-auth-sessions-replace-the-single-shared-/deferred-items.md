# Phase 20.1 — Deferred Items

Found during 20.1-04's Task 4 live checkpoint verification (real two-tab
browser test against the running dev server, 2026-07-17). Both are
**pre-existing** bugs in Wave 2 (Plan 03) code, outside Plan 04's
`files_modified` list (`lib/dal.ts`, `lib/use-tab-token.ts`, `actions/profile.ts`,
`app/_components/profile-form.tsx`, `app/(app)/profile/page.tsx`, tests).
Per the executor's scope-boundary rule ("only auto-fix issues directly
caused by the current task's changes"), neither was fixed in this plan —
both are logged here for a follow-up fast-follow.

## 1. Silent refresh drops the `role` claim (HIGH — undermines D-06/D-07 for any long-lived tab)

**File:** `app/api/auth/tab-refresh/route.ts`, line 32:

```ts
const accessToken = await mintTabAccessToken(payload.sub, payload.role ?? '')
```

`payload` here is the **decoded refresh token**. Refresh tokens are minted by
`lib/tab-session.ts`'s `mintTabRefreshToken(userId)`, which deliberately
carries only `{ sub, typ: "refresh" }` — no `role` field, by design. So
`payload.role` is **always `undefined`** for a refresh token, and every
silently-refreshed access token is minted with `role: ''` (empty string)
baked in.

**Impact:** `ACCESS_TTL_S` is 20 minutes. Any tab holding a per-tab session
for longer than ~18 minutes (`REFRESH_BUFFER_MS` fires 2 minutes before
expiry) gets a refreshed access token whose `role` claim is silently wiped
to `''`. Every subsequent `isAdminRole('')`, `role === 'x'` check, etc.
resolves false — the tab doesn't crash or log out, but the user's role
authorization silently breaks (e.g. an `operations` user loses admin-area
access mid-session; a `factory_pm` user's role-gated content stops
rendering as expected). This is the exact "shows the wrong
identity/permissions" bug class Phase 20.1 exists to fix, now reintroduced
via the refresh path specifically.

**Suggested fix (not applied here):** look up the user's current role from
the DB inside the refresh handler (mirroring `mintTabAccessToken`'s
original call at sign-in, which sources role fresh from
`verifyCredentials`), or have `verifyTabToken`/refresh-token minting also
carry role (accepting minor staleness risk if a role changes mid-session,
same tradeoff `verifySession()`'s cookie path already accepts via JWT
claims).

## 2. Intermittent 403 on `/admin/dashboard` after repeated soft-navigation (MEDIUM — reproducibility unclear)

Observed during live verification: a per-tab `operations` session
(confirmed via direct JWT decode: `role: "operations"`, not expired,
`typ: "access"`) intermittently received a `forbidden()` (403) response
from `app/(app)/admin/layout.tsx`'s `requireAdmin()` on repeat
soft-navigations to `/admin/dashboard`, despite the exact same bearer
token successfully resolving on `/profile` in the same window. First
navigation immediately after sign-in (via the `new-session-form.tsx` +
`TAB_SESSION_ACTIVATE_EVENT` flow) rendered correctly every time; later
re-navigations to the same route intermittently failed.

Root cause not conclusively identified in this session — candidates
considered and not yet ruled in/out: React `cache()` request-scoping
edge case under Next 16.2.9 webpack dev mode, a race in
`TabSessionProvider`'s fetch override under concurrent polling traffic
(`/api/notifications`, `/api/my-work`, `/api/messages/conversations` all
fire in bursts), or Next's client Router Cache serving a stale
segment for one part of the tree while re-fetching another (the layout's
own known Router-Cache issue, already partially addressed in Plan 03 via
`router.refresh()` at sign-in time, may not cover every subsequent
navigation). Did not reproduce for `/profile` in the same session under
the same conditions.

**Suggested next step (not applied here):** reproduce with `NODE_ENV`
production build (rules out dev-mode HMR/cache quirks) and/or add
request-scoped logging inside `resolveTabIdentity`/`requireAdmin` to
capture the actually-resolved role per request during a repro run.
