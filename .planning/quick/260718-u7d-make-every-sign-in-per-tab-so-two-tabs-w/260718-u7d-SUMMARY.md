---
quick_id: 260718-u7d
slug: make-every-sign-in-per-tab-so-two-tabs-w
status: complete
date: 2026-07-18
commits:
  - aa3de81 fix(auth): every sign-in is now per-tab — two tabs with different users finally just works
---

# Summary — 260718-u7d: universal per-tab sign-in

## Why "it's still happening" after the hard-refresh fix

The per-tab machinery only ever engaged via the `/sign-in?newSession=1` flow. The
NORMAL sign-in form set only the browser-wide shared cookie — and `/sign-in`
redirects signed-in users away, so the natural way to get a second user into a
second tab was: sign out there (killing the cookie for EVERY tab), then sign in as
user B. Tab 1, holding no per-tab token of its own, became user B on its next
refresh. The hard-refresh restore bounce (260718-q20) was working correctly — the
tab simply had no token identity to restore.

Second latent bug found en route: the provider's silent-refresh timer captured the
refresh token at SCHEDULE time and did not re-arm when a tab switched users — so a
switched tab would silently revert to the PREVIOUS user's session ~18 minutes later.

## Fix (commit aa3de81)

1. **`signinAction`** verifies credentials directly (`verifyCredentials`), still
   sets the shared cookie (`signIn(..., { redirect: false })` — fallback identity
   for token-less tabs), AND mints per-tab tokens, returning them to the client.
   Bad credentials return early without touching the cookie.
2. **`sign-in-form.tsx`** stores the tokens, dispatches `TAB_SESSION_ACTIVATE_EVENT`,
   then `router.push('/dashboard')` + `router.refresh()` — the exact
   new-session-form contract. Every signed-in tab now owns its identity.
3. **`TabSessionProvider`**: `activate()` on an already-active tab re-arms the
   refresh timer against the new session's expiry; the timer callback reads the
   refresh token at FIRE time so a pending timer can never restore a previous
   user's session.
4. **`SignOutButton`** clears this tab's token session alongside the cookie
   sign-out.

## Live proof (real browser, both tabs via the NORMAL form)

t1 = designer@trtarredo.demo, t2 = qa.factory@trtarredo.demo (cookie ends as
qa.factory). Hard refresh t1 → still designer (navigation entry shows the
`/tab-session/restore?to=%2Fdesign%2Fdashboard` bounce); hard refresh t2 → still
qa.factory; re-check t1 → still designer. Two tabs, two users, fully independent.

## Gates

`tsc` 0 errors · lint 0 errors (4 pre-existing warnings) · `npm test` 234 passed +
1 todo (signin tests rewritten for the token-returning contract; 3 cases).

## Notes

- `qa.site@trtarredo.demo` was found deleted from the live DB (memory updated);
  used `designer@trtarredo.demo` for the two-tab proof instead.
- Known accepted edge: after ANY tab signs out (cookie cleared), other tabs keep
  working via their tokens on soft navigation, but a hard refresh routes them to
  /sign-in (native request carries neither cookie nor header). Safe direction —
  never a wrong identity.
