---
status: resolved
trigger: "Auth session is single-slot across browser tabs — users must open an incognito window to sign in as a second user, because signing in on a new tab overwrites/replaces the first user's session rather than each tab holding its own independent auth token. Expected: every tab should be able to hold and use its own auth token concurrently, so multiple different users can be logged in at the same time in different tabs of the same browser."
created: 2026-07-17
updated: 2026-07-17
---

# Debug Session: auth-single-session-multi-tab

## Symptoms

**Expected behavior:** A user should be able to open two (or more) tabs in the same browser and sign in as two different users, each tab keeping its own independent auth session/token, so different-role work (e.g. Factory PM in one tab, Site PM in another) can proceed concurrently without incognito.

**Actual behavior:** Signing in as a new user in a tab does not correctly establish that tab as the new user. Instead, the app "overrides the newly logged in user and presents the previous user on log in" — i.e. after completing sign-in as User B, the UI shows User A (the previously-logged-in user) rather than User B. User believes this may be a stale browser cookie or cached session state that isn't being cleared/updated on new sign-in.

**Error messages:** Not checked yet (user hasn't inspected console/network/server logs). No specific error text available — investigate cookie behavior, session callback, and any client-side caching (RSC cache, session context) directly.

**Timeline:** Has always behaved this way since auth was first built (Phase 1, NextAuth v5 / Auth.js Credentials + JWT). Not a regression.

**Reproduction:**
1. Tab A: sign in as User 1 (e.g. factory_pm)
2. Tab B (same browser, not incognito): navigate to sign-in, sign in as User 2 (e.g. site_pm)
3. Observed: the app shows/presents User 1 (the previous user) instead of User 2 (the newly signed-in user) — described by the user as an "override" that "presents the previous user on log in"

## Current Focus

reasoning_checkpoint:
  hypothesis: "The session cookie (`authjs.session-token`, JWT strategy) is a single browser-wide cookie by HTTP cookie semantics — every tab of the same non-incognito browser shares the exact same cookie jar, so only one authenticated identity can exist per browser at a time. There is no server-side bug that merges/corrupts tokens between users; the reported 'shows previous user' symptom is explained by `app/(auth)/sign-in/page.tsx` unconditionally redirecting any tab that already carries a valid session cookie straight to `/dashboard` (`if (session?.user) redirect('/dashboard')`), so a second tab opened to deliberately sign in as a different user gets silently bounced to the FIRST user's dashboard without ever reaching the sign-in form (or, if a stale/previously-loaded form is submitted anyway, it works and correctly overwrites the *entire browser's* single session — 'overriding' every other tab, not just the one being used)."
  confirming_evidence:
    - "Read @auth/core credentials-callback source (node_modules/@auth/core/lib/actions/callback/index.js:247-259): `defaultToken` is built fresh from ONLY the newly-authorized `user` object (name/email/picture/sub) — it is never spread from/merged with the prior session's decoded token. No code path exists that could blend User A's fields into User B's token."
    - "Live empirical test against `npm run dev` on port 3177 with real cookie jars: (1) signed in as qa.factory (User1) — jar recorded a session-token; (2) with that SAME jar still valid (no sign-out), POSTed credentials directly to /api/auth/callback/credentials as qa.site (User2) — response Set-Cookie replaced the token with a wholly different value; (3) GET /dashboard with the updated jar rendered ONLY 'QA Site Tester' / role 'site_pm' — zero leakage of User1's name/role. Confirms the server-side sign-in path is 100% correct, no merge/override defect."
    - "Live test of the sign-in PAGE itself: with User1's session cookie still present in the jar, GET /sign-in returned `307 Temporary Redirect` -> `location: /dashboard` (SignInPage's own `if (session?.user) redirect('/dashboard')` check) — meaning a second tab navigating to /sign-in while another user is active in the same browser never even reaches the credentials form; it silently lands on the CURRENTLY-cookied user's dashboard, exactly matching the reported 'shows the previous user' symptom."
  falsification_test: "If the hypothesis were wrong, POSTing valid User2 credentials while a User1 cookie was active would either fail outright or produce a session containing a mix of User1/User2 fields (e.g. User1's name with User2's role). Neither occurred — the resulting session was cleanly and entirely User2 in every test run."
  fix_rationale: "There is no code defect to patch that would make the user's stated expectation (independent auth tokens per browser tab, non-incognito) achievable — this is inherent to cookie-based sessions, which are stored once per browser origin and shared by every tab/window by HTTP specification. No server-side change can give two tabs of the same non-incognito browser two different active cookies. Achieving true per-tab independent sessions would require abandoning cookie-based sessions in favor of a per-tab, manually-attached token scheme (e.g. token held in `sessionStorage` + attached as an `Authorization` header on every fetch/Server Action) — a substantial auth-architecture change, not a bug fix, and out of scope without explicit user sign-off given the size and security-review burden of that change."
  blind_spots: "Could not test in an actual browser (no browser automation tool available in this session) — only verified server-side cookie/session behavior via curl against a local dev server. Could not rule out an additional, separate client-side Router-Cache/prefetch staleness contributing to perceived staleness in a tab that remains open without a reload (this is standard SPA behavior — a rendered page doesn't know the cookie changed underneath it until it re-navigates/reloads — not itself a defect, but could compound the confusion). Not tested against a production build, where Next.js's automatic `<Link>` prefetching (dev-only-disabled) is active and could theoretically prefetch stale content, though no `<Link>` to protected routes exists on the /sign-in page itself so this was not applicable here."

## Evidence

- timestamp: 2026-07-17
  checked: auth.ts, auth.config.ts, actions/auth.ts, lib/dal.ts, proxy.ts (full read)
  found: JWT `session: { strategy: "jwt" }`; jwt() callback only sets token.id/token.role when `user` is present (standard NextAuth pattern, not a bug); signoutAction already manually clears every known cookie-name variant + chunk suffixes with a comment explicitly describing this exact suspected bug class ("a browser that later signs in as a different test account can end up with a stale/ambiguous token still attached").
  implication: prior mitigation already exists for sign-out; no equivalent issue found needed on sign-in path since new tokens are built fresh (see next entries).

- timestamp: 2026-07-17
  checked: node_modules/@auth/core/lib/actions/callback/index.js (credentials provider POST handling, lines 227-278)
  found: "`defaultToken = { name: user.name, email: user.email, picture: user.image, sub: user.id }` is constructed solely from the just-authorized `user` — never merged with any previously-decoded token. The custom `jwt()` callback in auth.config.ts then only assigns `token.id`/`token.role` on top of this fresh object."
  implication: Server-side JWT construction cannot produce a token that blends two different users' identities. Rules out a token-merge bug.

- timestamp: 2026-07-17
  checked: "Live reproduction via `npm run dev -p 3177` + curl cookie jars simulating two tabs of one browser (shared cookie jar)"
  found: "(1) Sign in as User1 -> valid session-token set, /dashboard correctly shows 'QA Factory Tester'/factory_pm. (2) With that same cookie still active (no sign-out), GET /sign-in -> 307 redirect straight to /dashboard (never renders the sign-in form). (3) With that same cookie still active, directly POSTing User2 credentials to /api/auth/callback/credentials succeeds, Set-Cookie fully replaces the token, and subsequent /dashboard fetch shows ONLY 'QA Site Tester'/site_pm — no residual User1 data anywhere in the rendered payload (confirmed via full-text grep of the HTML/RSC payload)."
  implication: Root cause is NOT a server-side session bug. It is (a) the inherent one-cookie-per-browser nature of cookie-based sessions, compounded by (b) `SignInPage`'s unconditional `redirect('/dashboard')` when any session cookie exists, which prevents a second tab from ever reaching the sign-in form to authenticate as a different user — producing the exact "shows the previous user" symptom reported.

## Eliminated

- hypothesis: "NextAuth's jwt() callback merges the previous session's token fields with the newly-authenticated user's fields, producing a corrupted/blended identity."
  evidence: "Read @auth/core credentials callback source — defaultToken is built fresh from only the new `user` object, never spread from a prior token. Empirically confirmed via curl: signing in as User2 while User1's cookie was still active produced a session containing 100% User2 data, zero User1 leakage."
  timestamp: 2026-07-17

## Resolution

root_cause: |
  Not a code defect in the token/session construction logic — that path is verified correct.
  The reported behavior is fully explained by two facts working together:
  1. Cookie-based JWT sessions (`authjs.session-token`) are stored once per browser origin and
     shared by ALL tabs/windows of the same non-incognito browser by HTTP specification — there
     is no mechanism for a browser to hold two independent session cookies for the same origin
     across different tabs. This is fundamental to how cookies work, not a bug.
  2. `app/(auth)/sign-in/page.tsx` contains `if (session?.user) redirect('/dashboard')`. Because
     of (1), a second tab that already carries the first user's session cookie navigating to
     /sign-in gets silently bounced straight to that first user's dashboard, without ever
     rendering the credentials form — producing the observed "shows the previous user on log in"
     symptom. If a user instead submits a stale/already-loaded sign-in form for a second user
     while the first user's cookie is still active, the sign-in DOES succeed server-side and
     correctly and completely overwrites the browser's one shared session cookie to the second
     user — but since that cookie is shared, this silently switches the identity seen by every
     other open tab too (including the original tab, on its next request), which is the
     "overrides" behavior described.
  Conclusion: true independent, concurrently-authenticated sessions in different tabs of the SAME
  non-incognito browser are not achievable with the current (or any) cookie-based session
  strategy. This is a browser/HTTP-level constraint, not a fixable application bug, given the
  stated goal of "every tab holding its own independent auth token."
fix: |
  No code fix was applied. Implementing what the user actually wants (independent per-tab
  sessions in the same browser) would require replacing cookie-based sessions with a
  manually-attached, per-tab token scheme (e.g. token held in `sessionStorage` and sent as an
  `Authorization` header on every request/Server Action instead of relying on the shared cookie
  jar) — a significant auth-architecture change with real security-review implications
  (CSRF posture changes, every fetch/Server Action call site needs the header attached, SSR
  Server Components can no longer read the session via `cookies()` alone). This is a scoped
  feature request, not a bug fix, and needs explicit user sign-off before implementation.
  Recommended interim workaround (already the team's established practice per QA notes): use
  separate browser profiles or an incognito window per concurrent user session, since incognito
  windows get their own isolated cookie jar.
verification: "Root cause confirmed via direct server-side reproduction (see Evidence). No code changed. Awaiting user decision on how to proceed (see checkpoint below)."
files_changed: []
