---
phase: 01-foundation-auth-roles-schema-dal
plan: "05"
subsystem: auth-surface
tags: [nextauth, server-actions, rbac, bcrypt, role-whitelist, seed, route-groups]
dependency_graph:
  requires:
    - 01-02 (auth.ts signIn/signOut, auth.config.ts)
    - 01-04 (lib/auth/email-flows.ts sendVerificationEmail)
    - 01-01 (db/schema.ts users table, db/index.ts)
  provides:
    - actions/auth.ts (signUpAction, signinAction, signoutAction)
    - db/seed-admin.ts (CLI super_admin provisioner)
    - app/dashboard/page.tsx (role-based redirect)
    - app/(factory-pm)/layout.tsx + dashboard/page.tsx
    - app/(site-pm)/layout.tsx + dashboard/page.tsx
    - app/(admin)/layout.tsx + dashboard/page.tsx
    - tests/actions/auth.test.ts (AUTH-01, AUTH-02, AUTH-04)
  affects:
    - Phase 2 checklist/project pages (will extend role dashboard stubs)
tech_stack:
  added: []
  patterns:
    - Server Action ('use server') with useActionState-compatible (prevState, formData) => state signature
    - Zod v4 z.enum(ALLOWED_ROLES) whitelist as server-side privilege-escalation guard
    - Zod v4 z.email() top-level function (not deprecated z.string().email())
    - bcrypt.hash(password, 10) before any DB insert; hash never logged
    - sendVerificationEmail() called after insert, errors swallowed (non-blocking)
    - CLI seed script bypasses server-only guard by instantiating its own drizzle client
    - Route-group layouts as second RBAC layer: requireRole() via DAL (proxy is optimistic only)
key_files:
  created:
    - actions/auth.ts
    - db/seed-admin.ts
    - app/dashboard/page.tsx
    - app/(factory-pm)/layout.tsx
    - app/(factory-pm)/dashboard/page.tsx
    - app/(site-pm)/layout.tsx
    - app/(site-pm)/dashboard/page.tsx
    - app/(admin)/layout.tsx
    - app/(admin)/dashboard/page.tsx
    - tests/actions/auth.test.ts (replaced todo stubs)
  modified: []
decisions:
  - "Seed script imports @neondatabase/serverless + drizzle directly (not @/db) to bypass the server-only guard — the guard throws unconditionally in Node CLI contexts"
  - "z.email() (zod v4 top-level) used in SignupSchema per STACK.md; existing email-auth.ts uses deprecated z.string().email() but was not modified (out of scope)"
  - "grep -c super_admin actions/auth.ts == 0 enforced: the privilege-escalation guard comment was reworded to not mention super_admin"
  - "sendVerificationEmail failures are swallowed with .catch() so signup succeeds even if Resend is misconfigured (verification can be re-sent)"
  - "AUTH-03 todo removed from auth.test.ts — it was already implemented in tests/actions/email-auth.test.ts per plan directive"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-20"
  tasks_completed: 2
  files_created: 10
---

# Phase 01 Plan 05: Auth Surface — Signup/Signin/Signout, Seed Script, RBAC Route Groups Summary

**One-liner:** Role-whitelisted signup (factory_pm|site_pm only) with bcrypt+verification email, NextAuth signin/signout actions, CLI-only super_admin seed script, and three DAL-enforced role route-group layouts with Phase 2 placeholder dashboard stubs.

## What Was Built

### Task 1: Auth Actions + Seed Script + Dashboard Redirect + Tests

**`actions/auth.ts`** (`'use server'`):
- `signUpAction(prevState, formData)`: validates via `z.enum(ALLOWED_ROLES)` where `ALLOWED_ROLES = ['factory_pm', 'site_pm'] as const` — `super_admin` is absent from the whitelist and rejected at the schema layer before any bcrypt/insert/email. On valid input: lowercases email, `bcrypt.hash(password, 10)`, `db.insert(users).returning({ id })`, `sendVerificationEmail(row.id, email)` (errors swallowed), `signIn('credentials', { ..., redirect: false })`, then `redirect('/dashboard')`.
- `signinAction(prevState, formData)`: calls `signIn('credentials', { email, password, redirectTo: '/dashboard' })`; catches `AuthError` and returns a generic error message (no field enumeration).
- `signoutAction()`: calls `signOut({ redirectTo: '/sign-in' })`.

**`db/seed-admin.ts`** (CLI-only, no `'use server'`): Reads `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` from env; `bcrypt.hash(password, 10)`; `db.insert(users).values({ ..., role: 'super_admin', emailVerified: new Date() }).onConflictDoNothing()`. Instantiates its own Drizzle client (bypasses `server-only` guard). Never web-reachable.

**`app/dashboard/page.tsx`**: `export const dynamic = 'force-dynamic'`; calls `verifySession()` from DAL, redirects to role-specific dashboard URL.

**`tests/actions/auth.test.ts`**: All 5 AUTH-01/02/04 tests implemented (AUTH-03 todo removed — already in email-auth.test.ts). Mocks: `@/db`, `@/auth`, `bcryptjs`, `@/lib/auth/email-flows`, `next/navigation`. Tests assert: bcrypt called, insert called with correct role+hash, sendVerificationEmail called, signIn called (AUTH-01); none of these called when role=super_admin (AUTH-02); signinAction delegates to signIn, signoutAction delegates to signOut, AuthError produces generic message (AUTH-04).

### Task 2: Role Route-Group Layouts + Dashboard Stubs

Three route groups, each with:
- `layout.tsx`: async Server Component calling `await requireRole('<role>')` from `@/lib/dal`, then returning `<>{children}</>`.
- `dashboard/page.tsx`: `export const dynamic = 'force-dynamic'` + `<h1>[Role] Dashboard</h1>` placeholder (Phase 2 content).

| Route group | Layout requireRole | Dashboard heading |
|-------------|-------------------|-------------------|
| `app/(factory-pm)/` | `requireRole('factory_pm')` | Factory PM Dashboard |
| `app/(site-pm)/` | `requireRole('site_pm')` | Site PM Dashboard |
| `app/(admin)/` | `requireRole('super_admin')` | Admin Dashboard |

Cross-role access returns `forbidden()` via the DAL — the proxy (`proxy.ts`) remains optimistic and is never the sole defense.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seed script server-only guard**
- **Found during:** Task 1 implementation
- **Issue:** `db/index.ts` has `import 'server-only'` which throws unconditionally at runtime in any non-React-Server-Component context, including CLI scripts run with `tsx`. Importing `@/db` in `seed-admin.ts` would cause the script to abort before doing any work.
- **Fix:** `seed-admin.ts` instantiates its own `neon()` + `drizzle()` client directly (same pattern as `db/index.ts` minus the `server-only` guard), rather than importing `@/db`.
- **Files modified:** `db/seed-admin.ts`

**2. [Rule 2 - Comment rewording] grep -c super_admin actions/auth.ts**
- **Found during:** Post-implementation acceptance check
- **Issue:** Plan requires `grep -c "super_admin" actions/auth.ts` == 0 (privilege-escalation guard). An initial comment mentioning "super_admin is NEVER public" would make that count 1.
- **Fix:** Reworded the comment to not mention the string "super_admin".
- **Files modified:** `actions/auth.ts` (comment only)

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| `app/(factory-pm)/dashboard/page.tsx` | `<h1>Factory PM Dashboard</h1>` | Phase 2 placeholder per plan directive |
| `app/(site-pm)/dashboard/page.tsx` | `<h1>Site PM Dashboard</h1>` | Phase 2 placeholder per plan directive |
| `app/(admin)/dashboard/page.tsx` | `<h1>Admin Dashboard</h1>` | Phase 2 placeholder per plan directive |

These stubs are intentional (plan-directed). They will be replaced with real Phase 2 content in later plans.

## Threat Surface Scan

No new trust boundaries beyond those listed in the plan's `<threat_model>`. All STRIDE mitigations (T-01-05 through T-01-11) are present:
- T-01-05: `z.enum(ALLOWED_ROLES)` whitelist enforced; `grep -c super_admin actions/auth.ts == 0`
- T-01-06: `requireRole()` in all three role layouts
- T-01-07: DAL re-verifies in every layout; proxy is optimistic
- T-01-08: `db.insert(users)` awaited before `signIn()`
- T-01-09: `super_admin` only written by CLI seed (no HTTP path)
- T-01-10: `bcrypt.hash(password, 10)` before insert; error messages generic
- T-01-11: `ADMIN_PASSWORD` read from `process.env` only; no `NEXT_PUBLIC_`

## Self-Check

Files created:
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/actions/auth.ts: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/db/seed-admin.ts: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/dashboard/page.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(factory-pm)/layout.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(factory-pm)/dashboard/page.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(site-pm)/layout.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(site-pm)/dashboard/page.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(admin)/layout.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/app/(admin)/dashboard/page.tsx: FOUND
- /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/tests/actions/auth.test.ts: FOUND

Acceptance criteria verified:
- grep -c "super_admin" actions/auth.ts == 0: PASS
- z.enum(ALLOWED_ROLES in actions/auth.ts: PASS
- bcrypt.hash + sendVerificationEmail in actions/auth.ts: PASS
- super_admin + bcrypt.hash + onConflictDoNothing in db/seed-admin.ts: PASS
- force-dynamic + verifySession in app/dashboard/page.tsx: PASS
- requireRole('factory_pm') in app/(factory-pm)/layout.tsx: PASS
- requireRole('site_pm') in app/(site-pm)/layout.tsx: PASS
- requireRole('super_admin') in app/(admin)/layout.tsx: PASS
- force-dynamic in all three dashboard stubs: PASS

## Self-Check: PASSED
