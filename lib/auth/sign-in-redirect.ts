// Pure, framework-free extraction of the /sign-in page's redirect-vs-render
// decision (D-01/D-03). No `server-only` needed — no secrets, no I/O.
//
// D-01: a normal /sign-in visit (no newSession) with an existing session
//       still redirects to /dashboard — default single-user convenience
//       unaffected.
// D-03: /sign-in?newSession=1 always reaches the credentials form, even when
//       a shared-cookie session already exists in that tab.
export function shouldRedirectFromSignIn(
  hasSession: boolean,
  newSession: boolean,
): boolean {
  return hasSession && !newSession;
}
