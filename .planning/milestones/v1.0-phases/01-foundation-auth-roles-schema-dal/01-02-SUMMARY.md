# Plan 01-02 Summary — NextAuth v5 Auth Core

**Status:** Complete
**Requirements:** AUTH-04, AUTH-05, AUTH-06, AUTH-07

## What was built
- `auth.config.ts` — edge-safe Auth.js v5 config (pages, `authorized`/`jwt`/`session` callbacks injecting `role` + `id` into the token and session).
- `auth.ts` — `NextAuth()` with Credentials provider (`authorize` looks up user by email via Drizzle `db`, `bcrypt.compare` on `hashedPassword`, returns `{id,email,role,name}` or null); JWT session strategy; exports `{ handlers, auth, signIn, signOut }`; `AUTH_SECRET` from env.
- `app/api/auth/[...nextauth]/route.ts` — `export const { GET, POST } = handlers` (corrected from a bad direct re-export during verification).
- `proxy.ts` (repo root, NOT middleware.ts) — optimistic redirect from edge-safe config, no db/bcrypt.
- `lib/dal.ts` (`server-only`) — authoritative `verifySession()` / `requireRole()` / ownership guard.
- `types/next-auth.d.ts` — Session/JWT augmentation so `session.user.role`/`id` are typed.
- `next.config.ts` — added `experimental.authInterrupts: true` (enables `forbidden()`/`unauthorized()`).
- `tests/lib/dal.test.ts` — implemented (AUTH-06 cross-role forbidden, AUTH-07 no-session rejected).

## Verification (run by orchestrator — executor lacked Bash)
- `npx vitest run tests/lib/dal.test.ts` → **8 passed, 0 failed**
- `npx tsc --noEmit` → clean (after fixing route handler to destructure `handlers`)
- `npm run lint` → clean

## Deviations
- Executor created files but could not run verify/commit (Bash denied in its session); orchestrator verified, fixed the route handler export, and committed.
