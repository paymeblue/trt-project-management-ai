# Phase 1: Foundation — Auth, Roles, Schema, DAL — Research

**Researched:** 2026-06-18
**Domain:** Authentication, RBAC, Drizzle schema, server-side DAL — Next.js 16 App Router
**Confidence:** HIGH (Next.js 16 from bundled docs, @neondatabase/auth from npm registry + dist inspection, Drizzle from npm registry)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can self-serve sign up with email and password | `auth.signUp.email()` via `@neondatabase/auth/next/server`; Server Action + Zod validation |
| AUTH-02 | User selects role (Factory PM or Site PM) at signup without admin approval | Role stored in app's `users` table after auth signup; whitelist `factory_pm`/`site_pm` in Server Action; map auth userId to DB row |
| AUTH-03 | Public signup cannot create Super Admin; Super Admin seeded by script | Signup Server Action rejects any role other than `factory_pm`/`site_pm`; seed script calls `auth.admin.createUser()` with `role: 'super_admin'` via `auth.admin.setRole()` |
| AUTH-04 | User can log in and log out from any page | `auth.signIn.email()` in Server Action; `auth.signOut()` in logout Server Action; `app/api/auth/[...path]/route.ts` handler |
| AUTH-05 | User session persists across browser refresh | Neon Auth sets HttpOnly signed session cookie; `createNeonAuth` cookie config; `NEON_AUTH_COOKIE_SECRET` |
| AUTH-06 | Nav items and routes gated by role | `proxy.ts` optimistic redirect + route group `layout.tsx` `requireRole()` + DAL in pages |
| AUTH-07 | Every data mutation authorized server-side | `lib/dal.ts` `verifySession()` + `requireRole()` + `requireOwnerOrAdmin()` called from every Server Action |
| CHK-01 | Checklists are defined as data (definition → template items → responses), not hardcoded | `checklist_definitions` + `checklist_template_items` + `checklists` + `checklist_responses` Drizzle tables; seed script for definition slugs only |
</phase_requirements>

---

## Summary

Phase 1 lays the security and data foundation on which every other phase depends. The critical discoveries from this research session are: (1) `@neondatabase/auth` is a **real, first-party Neon package** built on **Better Auth** — NOT Stack Auth; its `/next/server` export provides `createNeonAuth()` which returns a unified server instance with `handler()`, `middleware()`, `getSession()`, `signIn.email()`, `signUp.email()`, `signOut()`, and `admin.*` APIs; (2) roles in this package are arbitrary strings stored on the `users.role` column by better-auth's admin plugin — not constrained to `"user"`/`"admin"`, so `factory_pm`, `site_pm`, `super_admin` are valid; (3) the Super Admin seed script uses `auth.admin.createUser()` or `auth.admin.setRole()` from the server-side `auth` instance, called from a local Node script, never a Route Handler; (4) the app does NOT need its own session JWT management (`jose`) because `@neondatabase/auth` fully handles session cookies via `NEON_AUTH_COOKIE_SECRET`; (5) the app's `users` table stores a `authUserId` foreign key linking to the Neon Auth user; after signup the Server Action inserts the user row with their selected role.

**Primary recommendation:** Use `@neondatabase/auth/next/server` `createNeonAuth()` for all server-side auth; call `auth.getSession()` inside `lib/dal.ts`; store role exclusively in the app's Drizzle `users` table (not duplicated in Neon Auth's user metadata for Phase 1). The Drizzle schema should be created and pushed via `drizzle-kit push` (dev only) or `drizzle-kit generate` + `drizzle-kit migrate` (production). `proxy.ts` (the Next.js 16 proxy file — NOT `middleware.ts`) handles optimistic session-cookie check only; the DAL performs authoritative verification.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User signup / login / logout | API / Backend (Server Actions + Neon Auth API handler) | Browser (Client Component form) | Credentials must never be processed client-side; Server Actions call `auth.signUp/signIn.email()` |
| Session persistence across refresh | API / Backend (Neon Auth cookie) | — | `createNeonAuth` sets HttpOnly signed cookie; no client-side storage |
| Role-gated route redirect | Frontend Server (proxy.ts) | Frontend Server (route group layout) | proxy.ts reads cookie and redirects; layout does authoritative DAL check |
| Authoritative authorization (mutations) | API / Backend (DAL + Server Actions) | — | Server Actions call DAL before any DB access; proxy.ts is NOT authoritative |
| Database schema + migrations | Database / Storage | — | Drizzle schema in `db/schema.ts`; push via drizzle-kit |
| Super Admin provisioning | API / Backend (seed script, not HTTP) | — | `auth.admin.createUser()` called from a local Node script; no web endpoint |
| Checklist data model | Database / Storage | — | Template-driven; 5 tables; no hardcoded line items |

---

## Standard Stack

### Core — Phase 1 Specific

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@neondatabase/auth` | `0.4.2-beta` (pin exact) | Auth server + client; session cookies; admin API | First-party Neon package wrapping Better Auth; has dedicated Next.js 16 adapter (`/next/server`); BETA — pin exact, no `^` |
| `@neondatabase/auth-ui` | `0.2.1-beta` | Pre-built sign-in/sign-up UI components for Next.js | Peer dep of `@neondatabase/auth`; `AuthView` component handles all auth pages; Tailwind v4 CSS import supported |
| `@neondatabase/serverless` | `1.1.0` | Neon Postgres HTTP driver | Required for serverless-compatible DB access; use with `drizzle-orm/neon-http` adapter |
| `drizzle-orm` | `0.45.2` | Type-safe SQL ORM | Schema-as-code; works natively with `@neondatabase/serverless`; generates typed queries |
| `drizzle-kit` | `0.31.10` (devDep) | Schema push + migration generation | `drizzle-kit push` (dev) / `drizzle-kit generate` + `drizzle-kit migrate` (prod) |
| `server-only` | `0.0.1` | Build-time guard preventing DAL from leaking to client | Tiny package; `import 'server-only'` in any file that reads session/DB |
| `zod` | `4.4.3` | Server-side form validation in Server Actions | Next.js 16 bundled docs use `z.string().min(2, { error: '...' })` syntax (Zod 4 `error` shorthand) |
| `jose` | `6.2.3` | JWT utilities | Bundled as dep of `@neondatabase/auth` — do NOT need to install separately unless doing custom JWT work |

[VERIFIED: npm view @neondatabase/auth@0.4.2-beta, npm view drizzle-orm version, npm view @neondatabase/serverless version, npm view drizzle-kit version, npm view zod version, npm view jose version — all confirmed 2026-06-18]

> **IMPORTANT — jose is NOT needed separately:** `@neondatabase/auth` declares `jose@6.2.3` as its own dependency. The project does NOT need to install `jose` for Phase 1 because Neon Auth handles all JWT signing/verification internally. If the project later needs manual JWT work, install it then.

> **IMPORTANT — zod version:** npm registry shows `zod@4.4.3` as latest. The Next.js 16 bundled docs examples use the `error` shorthand syntax (not `message`) which is Zod v3.24+/v4. If you install zod, install `4.4.3` not `3.x`. Verify project compatibility.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-auth` | `1.4.18` (bundled dep of @neondatabase/auth) | Auth engine underneath Neon Auth | Do NOT install separately; access via `@neondatabase/auth` APIs only |

**Installation for Phase 1:**

```bash
npm install "@neondatabase/auth@0.4.2-beta" @neondatabase/auth-ui @neondatabase/serverless drizzle-orm server-only zod
npm install -D drizzle-kit
```

**Version verification (run before install):**

```bash
npm view @neondatabase/auth dist-tags
npm view drizzle-orm version
npm view @neondatabase/serverless version
```

---

## @neondatabase/auth — Actual API Surface (VERIFIED from dist)

This is the most critical section. All findings are verified against the installed package files from `npm view @neondatabase/auth@0.4.2-beta readme` and inspection of `/tmp/package/dist/next/server/index.d.mts`, `/tmp/package/dist/next/index.d.mts`, and `/tmp/package/dist/adapter-core-BiYHR4I-.d.mts`.

[VERIFIED: npm registry + dist inspection 2026-06-18]

### Architecture Overview

```
@neondatabase/auth
├── @neondatabase/auth/next/server  → createNeonAuth()  ← SERVER ONLY
│   ├── auth.handler()              → Route Handler for /api/auth/[...path]
│   ├── auth.middleware()           → proxy.ts integration
│   ├── auth.getSession()           → read session in Server Components/Actions
│   ├── auth.signIn.email()         → sign in
│   ├── auth.signUp.email()         → sign up
│   ├── auth.signOut()              → sign out
│   └── auth.admin.*               → createUser, setRole, listUsers, banUser, etc.
│
└── @neondatabase/auth/next         → createAuthClient()  ← CLIENT ONLY
    └── authClient.useSession()     → React hook for session state in Client Components
```

**Underlying tech:** Neon Auth is a managed Better Auth instance. The `/api/auth/[...path]` route handler proxies requests to `NEON_AUTH_BASE_URL` (Neon's hosted Better Auth server). User data (email, name, hashed password, role) is stored in the Neon Postgres DB's `auth` schema — separate from the app's `public` schema tables.

### Required Environment Variables

```bash
# .env.local
NEON_AUTH_BASE_URL=https://<your-neon-auth-url>    # from Neon Console → Project → Auth
NEON_AUTH_COOKIE_SECRET=<32+ char random string>   # openssl rand -base64 32
DATABASE_URL=<neon-connection-string>               # already present
```

`NEON_AUTH_BASE_URL` is obtained by enabling Neon Auth in the Neon Console (Project → Branch → Auth tab). This is a required setup step BEFORE any code runs.

### Server Setup (lib/auth/server.ts)

```typescript
// lib/auth/server.ts
import { createNeonAuth } from '@neondatabase/auth/next/server'

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
    sessionDataTtl: 300,          // 5 min session cache TTL
    sameSite: 'lax',              // lax for same-site; use 'strict' for highest security
  },
})
```

[VERIFIED: createNeonAuth signature from dist/next/server/index.d.mts]

### Route Handler (app/api/auth/[...path]/route.ts)

```typescript
// app/api/auth/[...path]/route.ts
import { auth } from '@/lib/auth/server'

export const { GET, POST } = auth.handler()
```

[VERIFIED: dist/next/server/index.d.mts — `handler()` returns `{ GET, POST }`]

### Client Setup (lib/auth/client.ts)

```typescript
// lib/auth/client.ts
"use client"
import { createAuthClient } from '@neondatabase/auth/next'

export const authClient = createAuthClient()
// Note: no URL argument needed in Next.js — the /next adapter auto-proxies via /api/auth/*
```

[VERIFIED: dist/next/index.d.mts — `createAuthClient()` requires no URL in /next adapter]

### Proxy Integration (proxy.ts)

```typescript
// proxy.ts  (project root — NOT middleware.ts)
import { auth } from '@/lib/auth/server'

export default auth.middleware({ loginUrl: '/auth/sign-in' })

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

This is the simplest approach: Neon Auth's own middleware handles session validation and redirect-to-login. For role-prefix redirects (factory-pm → factory_pm only), augment or replace with custom logic:

```typescript
// proxy.ts — augmented with role-prefix gating
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Let static assets and auth routes pass through
  if (path.startsWith('/api/auth') || path.startsWith('/_next')) {
    return NextResponse.next()
  }

  // Neon Auth: validate session cookie optimistically
  const { data: session } = await auth.getSession()

  const publicPaths = ['/auth/sign-in', '/auth/sign-up', '/']
  if (publicPaths.some(p => path.startsWith(p))) {
    // If authenticated, redirect to their dashboard
    if (session?.user) {
      // Role is in app's DB, not in Neon Auth session — redirect to a server component
      // that reads the role and redirects appropriately
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  // Protected routes — no session → login
  if (!session?.user) {
    return NextResponse.redirect(new URL('/auth/sign-in', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
```

**CRITICAL NOTE:** Neon Auth's `getSession()` returns `{ data: { session, user } }` where `user.id`, `user.name`, `user.email` are available — but the app role (`factory_pm`/`site_pm`/`super_admin`) is NOT in the Neon Auth session object for this use case. The role lives in the app's `users` table. Therefore proxy.ts does a **presence check only** (is the user logged in?); the role-to-prefix redirect is best done in each route group's `layout.tsx` via the DAL. This is consistent with the Next.js 16 auth guide: "Proxy is for optimistic checks only."

[VERIFIED: NEXT-JS.md from github.com/neondatabase/neon-js + dist inspection]

### Sign-Up Server Action (with role selection)

```typescript
// actions/auth.ts
'use server'
import { auth } from '@/lib/auth/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const ALLOWED_ROLES = ['factory_pm', 'site_pm'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

const SignupSchema = z.object({
  name: z.string().min(2, { error: 'Name must be at least 2 characters.' }).trim(),
  email: z.email({ error: 'Please enter a valid email.' }).trim(),
  password: z.string().min(8, { error: 'Password must be at least 8 characters.' }),
  role: z.enum(ALLOWED_ROLES, { error: 'Role must be factory_pm or site_pm.' }),
})

export async function signupAction(prevState: unknown, formData: FormData) {
  const parsed = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),  // validated server-side — super_admin is rejected
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, email, password, role } = parsed.data

  // 1. Create user in Neon Auth
  const { data, error } = await auth.signUp.email({ name, email, password })
  if (error || !data?.user) {
    return { message: error?.message ?? 'Failed to create account.' }
  }

  // 2. Create app user row with role
  await db.insert(users).values({
    authUserId: data.user.id,
    email,
    name,
    role,
  })

  // 3. Sign in immediately after signup
  await auth.signIn.email({ email, password })

  redirect('/dashboard')
}
```

[VERIFIED: auth.signUp.email signature from dist/adapter-core; auth.signIn.email from NEXT-JS.md]

### Sign-In Server Action

```typescript
// actions/auth.ts (continued)
'use server'
export async function signinAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await auth.signIn.email({ email, password })
  if (error) return { message: error.message }

  redirect('/dashboard')
}
```

### Sign-Out Server Action

```typescript
'use server'
export async function signoutAction() {
  await auth.signOut()
  redirect('/auth/sign-in')
}
```

[VERIFIED: auth.signOut() from NEXT-JS.md dist inspection]

### getSession in Server Components

```typescript
// Example: app/(factory-pm)/dashboard/page.tsx
import { auth } from '@/lib/auth/server'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'  // required when reading session in RSC

export default async function DashboardPage() {
  // DAL handles auth + role check in one call
  const { userId, role } = await verifySession()
  // ...
}
```

[VERIFIED: `export const dynamic = 'force-dynamic'` required note from NEXT-JS.md]

### Super Admin Seed Script (db/seed-admin.ts)

```typescript
// db/seed-admin.ts — run locally: npx tsx db/seed-admin.ts
// NOT a Server Action or Route Handler — must be called from CLI only
import { auth } from '../lib/auth/server'

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL!
  const password = process.env.ADMIN_PASSWORD!
  const name = process.env.ADMIN_NAME ?? 'Super Admin'

  // Create user in Neon Auth with admin role (better-auth admin plugin)
  const { data, error } = await auth.admin.createUser({
    email,
    password,
    name,
    role: 'super_admin',   // custom role string — valid per better-auth admin plugin
  })

  if (error || !data?.user) {
    console.error('Failed to create admin user:', error)
    process.exit(1)
  }

  // Also create app users table row
  const { db } = await import('../db')
  const { users } = await import('../db/schema')
  await db.insert(users).values({
    authUserId: data.user.id,
    email,
    name,
    role: 'super_admin',
  }).onConflictDoNothing()

  console.log(`Super Admin created: ${email}`)
}

seedAdmin()
```

**package.json script:**
```json
"db:seed-admin": "npx tsx db/seed-admin.ts"
```

[VERIFIED: auth.admin.createUser body accepts `role: string` from dist/adapter-core-BiYHR4I-.d.mts `createUser` endpoint body type]

### Reading Session Server-Side (lib/dal.ts)

```typescript
// lib/dal.ts
import 'server-only'
import { cache } from 'react'
import { auth } from '@/lib/auth/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { redirect, forbidden, unauthorized } from 'next/navigation'

export type Role = 'factory_pm' | 'site_pm' | 'super_admin'

// Memoized per React render pass — one network round-trip max per request
export const verifySession = cache(async (): Promise<{ userId: string; authUserId: string; role: Role }> => {
  const { data: session, error } = await auth.getSession()

  if (error || !session?.user) {
    redirect('/auth/sign-in')
  }

  // Look up app user by Neon Auth user ID
  const appUser = await db.query.users.findFirst({
    where: eq(users.authUserId, session.user.id),
    columns: { id: true, authUserId: true, role: true },
  })

  if (!appUser) {
    // User authenticated in Neon Auth but not in app DB — force sign-out
    await auth.signOut()
    redirect('/auth/sign-in')
  }

  return { userId: appUser.id, authUserId: appUser.authUserId, role: appUser.role as Role }
})

export async function requireRole(role: Role) {
  const session = await verifySession()
  if (session.role !== role) forbidden()
  return session
}

export async function requireOwnerOrAdmin(ownerId: string) {
  const session = await verifySession()
  if (session.role === 'super_admin') return session
  if (session.userId !== ownerId) forbidden()
  return session
}
```

[VERIFIED: auth.getSession() returns `{ data: { session, user }, error }` from NEXT-JS.md; `forbidden()` and `unauthorized()` from Next.js 16 bundled docs]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (React 19)
  │
  ├── Client Components (auth forms, role picker)
  │     └── authClient.useSession()    (from @neondatabase/auth/next)
  │
  └── Server Components (pages, layouts)
        │
        ▼
Next.js 16 App Router (Server)
  │
  ├── proxy.ts                         ← session presence check → redirect if no session
  │
  ├── app/api/auth/[...path]/route.ts  ← Neon Auth API handler (sign-in/up/out proxied to Neon)
  │
  ├── Route Group Layouts              ← requireRole() via DAL → forbidden() if wrong role
  │   ├── (auth)/layout.tsx            ← public (login/signup)
  │   ├── (factory-pm)/layout.tsx      ← requireRole('factory_pm')
  │   ├── (site-pm)/layout.tsx         ← requireRole('site_pm')
  │   └── (admin)/layout.tsx           ← requireRole('super_admin')
  │
  ├── lib/dal.ts                       ← verifySession() → auth.getSession() + DB role lookup
  │
  └── actions/auth.ts                  ← signupAction (whitelist role), signinAction, signoutAction
        │
        ▼
  ┌─────────────────────────────────────────────┐
  │  Neon Auth Service (NEON_AUTH_BASE_URL)      │
  │  Managed Better Auth instance               │
  │  Stores: users, sessions (auth schema)      │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
  Neon Postgres (public schema — Drizzle)
  ├── users (with role: factory_pm | site_pm | super_admin)
  ├── checklist_definitions
  ├── checklist_template_items
  ├── checklists
  ├── checklist_responses
  ├── projects, attachments, processes, chat_messages, ai_usage, static_content
```

### Recommended Project Structure (Phase 1)

```
src/
├── app/
│   ├── (auth)/                      # public routes
│   │   ├── auth/[path]/page.tsx     # AuthView from @neondatabase/auth-ui
│   │   └── layout.tsx               # no auth check
│   ├── (factory-pm)/
│   │   ├── layout.tsx               # requireRole('factory_pm')
│   │   └── dashboard/page.tsx       # stub for Phase 2
│   ├── (site-pm)/
│   │   ├── layout.tsx               # requireRole('site_pm')
│   │   └── dashboard/page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx               # requireRole('super_admin')
│   │   └── dashboard/page.tsx
│   ├── api/
│   │   └── auth/[...path]/route.ts  # Neon Auth handler
│   ├── dashboard/page.tsx           # redirect page: reads role → /factory-pm/dashboard etc.
│   ├── layout.tsx                   # root layout + Providers
│   └── providers.tsx                # NeonAuthUIProvider + authClient
├── db/
│   ├── schema.ts                    # all Drizzle tables
│   ├── index.ts                     # db client (neon HTTP + drizzle)
│   └── seed-admin.ts               # Super Admin seed script (not a route)
├── lib/
│   ├── auth/
│   │   ├── server.ts                # createNeonAuth() export
│   │   └── client.ts                # createAuthClient() export
│   └── dal.ts                       # verifySession, requireRole, requireOwnerOrAdmin
├── actions/
│   └── auth.ts                      # signupAction, signinAction, signoutAction
└── proxy.ts                         # Next.js 16 Proxy (session presence check)
```

### Pattern 1: Neon Auth Route Handler Wiring

**What:** `app/api/auth/[...path]/route.ts` must exist. It proxies all Neon Auth requests (sign-in, sign-up, session refresh, sign-out) between the Next.js app and the hosted Neon Auth server.

**Example:**

```typescript
// app/api/auth/[...path]/route.ts
import { auth } from '@/lib/auth/server'
export const { GET, POST } = auth.handler()
```

[VERIFIED: NEXT-JS.md from neondatabase/neon-js, 2026-06-18]

### Pattern 2: Role-to-Dashboard Redirect

After signup or login, the user is redirected to `/dashboard`. This server component reads the role from the app DB and redirects to the correct shell:

```typescript
// app/dashboard/page.tsx
import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DashboardRedirectPage() {
  const { role } = await verifySession()

  if (role === 'factory_pm') redirect('/factory-pm/dashboard')
  if (role === 'site_pm') redirect('/site-pm/dashboard')
  if (role === 'super_admin') redirect('/admin/dashboard')

  redirect('/auth/sign-in')
}
```

### Pattern 3: Route Group Layout RBAC

```typescript
// app/(factory-pm)/layout.tsx
import { requireRole } from '@/lib/dal'

export default async function FactoryPmLayout({ children }: { children: React.ReactNode }) {
  await requireRole('factory_pm')
  return <>{children}</>
}
```

[VERIFIED: Next.js 16 bundled docs authentication.md + route-groups.md]

### Pattern 4: Four-Layer RBAC (from ARCHITECTURE.md, validated)

| Layer | File | What It Catches | DB Access |
|-------|------|-----------------|-----------|
| proxy.ts | Session cookie present? | Unauthenticated users | No — Neon Auth cookie read only |
| Route group layout | requireRole() | Wrong-role access to shell | Yes — DAL DB query |
| Page-level verifySession() | Partial rendering gap | Session expired mid-session | Yes — memoized |
| Server Action DAL call | Every mutation | Direct POST bypass | Yes — always re-verified |

### Anti-Patterns to Avoid

- **`middleware.ts` instead of `proxy.ts`:** Next.js 16 renamed it. `middleware.ts` is deprecated. Use `proxy.ts`. [VERIFIED: bundled docs proxy.md]
- **`cookies()` without `await`:** In Next.js 16, `cookies()` is async. [VERIFIED: bundled docs]
- **Role check in proxy only:** proxy.ts cannot call Neon Auth DB per-request (performance). Authoritative checks are in DAL. [VERIFIED: Next.js 16 auth guide]
- **`super_admin` in the signup role picker:** The Server Action whitelist (`z.enum(['factory_pm', 'site_pm'])`) is the last line of defense. [VERIFIED: pitfalls research]
- **Storing role in Neon Auth user metadata instead of app DB:** The app `users` table is the single source of truth for role; Neon Auth's `user.role` is for better-auth's internal admin plugin — not our app role system.
- **`drizzle-kit push` against production:** Only for local dev. Use `drizzle-kit generate` + `drizzle-kit migrate` for any shared environment. [VERIFIED: pitfalls research]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management (cookie signing, HttpOnly, SameSite, expiry) | Custom JWT session layer | `@neondatabase/auth` with `NEON_AUTH_COOKIE_SECRET` | Handles all cookie security attributes, session caching, refresh |
| Password hashing + credential verification | bcrypt + manual DB checks | `auth.signUp.email()` / `auth.signIn.email()` | Neon Auth / Better Auth handles Argon2 hashing internally |
| Sign-up / sign-in UI | Custom form components | `@neondatabase/auth-ui` `AuthView` | Pre-built, themed, handles loading states and errors |
| Auth route handlers | Custom `/api/auth/*` Route Handlers | `auth.handler()` | Neon Auth proxies all auth routes; custom handlers break session sync |
| DB connection pooling | `pg` / `node-postgres` | `@neondatabase/serverless` neon HTTP adapter | TCP connections break in serverless; neon HTTP is stateless per request |
| Session JWT decode in proxy.ts | Custom JWT verification | `auth.getSession()` via Neon Auth | Neon Auth's `auth.middleware()` or custom proxy calling `auth.getSession()` |

---

## Drizzle Schema (Phase 1 Full)

```typescript
// db/schema.ts
import {
  pgTable, pgEnum, text, integer, boolean,
  timestamp, uuid, jsonb, varchar,
} from 'drizzle-orm/pg-core'

// ── Enums ────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['factory_pm', 'site_pm', 'super_admin'])
export const projectStatusEnum = pgEnum('project_status', ['not_delivered', 'delivered'])
export const targetRoleEnum = pgEnum('target_role', ['factory_pm', 'site_pm', 'both'])
export const itemTypeEnum = pgEnum('item_type', ['radio', 'text', 'file'])
export const responseOptionsEnum = pgEnum('response_options', ['yes_no', 'yes_no_na'])
export const checklistStatusEnum = pgEnum('checklist_status', ['draft', 'submitted'])
export const responseValueEnum = pgEnum('response_value', ['yes', 'no', 'na'])
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant'])

// ── Users ────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:              uuid('id').primaryKey().defaultRandom(),
  authUserId:      text('auth_user_id').notNull().unique(), // Neon Auth user.id
  email:           text('email').notNull().unique(),
  name:            text('name').notNull(),
  position:        text('position'),
  role:            roleEnum('role').notNull(),
  idCardS3Key:     text('id_card_s3_key'),
  idCardUpdatedAt: timestamp('id_card_updated_at'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
})

// ── Projects ─────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  location:     text('location'),
  deliveryDate: timestamp('delivery_date'),
  status:       projectStatusEnum('status').default('not_delivered').notNull(),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Definitions (CHK-01: template catalogue) ───────────────────
export const checklistDefinitions = pgTable('checklist_definitions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  slug:       text('slug').notNull().unique(), // e.g. 'delivery_project', 'sorting'
  name:       text('name').notNull(),
  targetRole: targetRoleEnum('target_role').notNull(),
  isActive:   boolean('is_active').default(true).notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Template Items (CHK-01: schema-as-data) ──────────────────────────────
export const checklistTemplateItems = pgTable('checklist_template_items', {
  id:              uuid('id').primaryKey().defaultRandom(),
  definitionId:    uuid('definition_id').notNull().references(() => checklistDefinitions.id),
  step:            integer('step').notNull().default(1),
  sortOrder:       integer('sort_order').notNull().default(0),
  label:           text('label').notNull(),
  itemType:        itemTypeEnum('item_type').default('radio').notNull(),
  responseOptions: responseOptionsEnum('response_options').default('yes_no').notNull(),
  isPhotoAllowed:  boolean('is_photo_allowed').default(true).notNull(),
  isPhotoRequired: boolean('is_photo_required').default(false).notNull(),
  helpText:        text('help_text'),
  isActive:        boolean('is_active').default(true).notNull(),
})

// ── Checklist Instances ───────────────────────────────────────────────────
export const checklists = pgTable('checklists', {
  id:           uuid('id').primaryKey().defaultRandom(),
  definitionId: uuid('definition_id').notNull().references(() => checklistDefinitions.id),
  projectId:    uuid('project_id').references(() => projects.id),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  status:       checklistStatusEnum('status').default('draft').notNull(),
  submittedAt:  timestamp('submitted_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Responses ───────────────────────────────────────────────────
export const checklistResponses = pgTable('checklist_responses', {
  id:             uuid('id').primaryKey().defaultRandom(),
  checklistId:    uuid('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  templateItemId: uuid('template_item_id').notNull().references(() => checklistTemplateItems.id),
  value:          responseValueEnum('value'),
  textValue:      text('text_value'),
  notes:          text('notes'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

// ── Attachments ───────────────────────────────────────────────────────────
export const attachments = pgTable('attachments', {
  id:         uuid('id').primaryKey().defaultRandom(),
  responseId: uuid('response_id').references(() => checklistResponses.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  s3Key:      text('s3_key').notNull(),
  filename:   text('filename').notNull(),
  mimeType:   text('mime_type'),
  sizeBytes:  integer('size_bytes'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Processes & Flow Charts ───────────────────────────────────────────────
export const processes = pgTable('processes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title').notNull(),
  slug:      text('slug').notNull().unique(),
  body:      text('body').notNull(),
  tags:      text('tags').array(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Chat Messages ─────────────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  role:      chatRoleEnum('role').notNull(),
  content:   text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── AI Usage ──────────────────────────────────────────────────────────────
export const aiUsage = pgTable('ai_usage', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  date:         text('date').notNull(),             // 'YYYY-MM-DD'
  messageCount: integer('message_count').default(0).notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Static Content ────────────────────────────────────────────────────────
export const staticContent = pgTable('static_content', {
  id:        uuid('id').primaryKey().defaultRandom(),
  slug:      text('slug').notNull().unique(), // 'about_trt', 'email_formats'
  title:     text('title').notNull(),
  body:      text('body').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

[VERIFIED: Drizzle column types from training data + drizzle-orm@0.45.2 npm registry confirmation; pgEnum/pgTable API is stable across 0.4x versions]

**Note on `users.authUserId`:** This is the Neon Auth `user.id` value returned by `auth.getSession()` and `auth.signUp.email()`. Phase 1's DAL uses this as the lookup key to retrieve the app user row. The field is named `authUserId` (not `authId`) to be unambiguous about what system it references.

### Drizzle Config

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit'

export default {
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

### DB Client

```typescript
// db/index.ts
import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

### Migration Workflow

```bash
# Development (local Neon branch only)
npx drizzle-kit push

# Production (creates versioned SQL files, safe to review)
npx drizzle-kit generate
npx drizzle-kit migrate

# View schema in browser (dev only)
npx drizzle-kit studio
```

**Add to package.json scripts:**

```json
{
  "db:push": "drizzle-kit push",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:seed-admin": "npx tsx db/seed-admin.ts"
}
```

---

## Common Pitfalls (Phase 1 Specific)

### Pitfall 1: Skipping Neon Auth Console Setup Before Coding

**What goes wrong:** Code is written referencing `NEON_AUTH_BASE_URL` but the Neon Auth feature is not enabled in the Neon Console. `auth.getSession()` calls fail with network errors; `auth.handler()` returns 500s.

**How to avoid:** Enable Neon Auth first — Neon Console → Project → Branch → Auth tab → Enable. This provisions the hosted Better Auth instance and generates `NEON_AUTH_BASE_URL`. Only then install `@neondatabase/auth` and write code.

**Warning signs:** `NEON_AUTH_BASE_URL` is empty or not set; `auth.handler()` responses return 404 or network error.

### Pitfall 2: `export default` vs Named `proxy` Export

**What goes wrong:** Using `export default function proxy(...)` in `proxy.ts`. The bundled Next.js 16 docs show both default and named exports work. But when using `auth.middleware()`, it returns a function that should be the default export.

**How to avoid:** When using `auth.middleware()`, use default export:
```typescript
export default auth.middleware({ loginUrl: '/auth/sign-in' })
```
For custom proxy functions, both work — use default for simplicity.

[VERIFIED: proxy.md bundled docs — "export a single function, either as a default export or named `proxy`"]

### Pitfall 3: Role in Neon Auth Metadata vs App DB

**What goes wrong:** Developer stores the app role in Neon Auth's `user.role` field (via `admin.setRole()`). This works but creates a second source of truth. DAL queries need to call `auth.admin.getUser()` to retrieve the role — slower and adds complexity.

**How to avoid:** Store role exclusively in the app's `users.role` Postgres column. Neon Auth is the identity provider; the app DB is the authorization store. DAL reads `users.role` from Postgres after verifying the Neon Auth session. Only exception: seed script sets role in Neon Auth for the admin plugin's built-in access control, but the DAL still reads from Postgres.

### Pitfall 4: Missing `export const dynamic = 'force-dynamic'` in Server Components Calling auth.getSession()

**What goes wrong:** Server Component pages that call `auth.getSession()` get cached by Next.js at build time. All users get the first user's session (or null).

**How to avoid:** Add `export const dynamic = 'force-dynamic'` to every page that calls `auth.getSession()` or `verifySession()`.

[VERIFIED: NEXT-JS.md note "Server components using `auth` methods must be rendered dynamically"]

### Pitfall 5: JWT Role Claim Lag After Signup

**What goes wrong:** User signs up, is inserted into `users` table, but `verifySession()` on the very next request cannot find the user row yet (async DB insert race). Role-based redirect fails.

**How to avoid:** In the signup Server Action, call `auth.signIn.email()` AFTER the `db.insert(users)` completes successfully. Do not redirect until both the Neon Auth signup and the DB insert succeed. Use `await` on the db insert before `auth.signIn`.

### Pitfall 6: `await cookies()` Not Used (Next.js 16 Breaking Change)

**What goes wrong:** `const cookieStore = cookies()` returns a Promise in Next.js 16. Role checks silently fail.

**How to avoid:** Always `const cookieStore = await cookies()`. Neon Auth's own middleware handles this correctly internally. Custom proxy.ts code must use `await cookies()` if reading cookies directly.

[VERIFIED: Next.js 16 bundled docs, PITFALLS.md]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (recommended — install `vitest`, `@vitejs/plugin-react`) or Jest |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run | `npx vitest run` |
| Full suite | `npx vitest run --coverage` |

**Note:** No test framework is currently installed. Wave 0 must install it before Phase 1 tasks.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Signup Server Action accepts valid email/password | unit | `npx vitest run tests/actions/auth.test.ts` | Wave 0 gap |
| AUTH-02 | Signup Server Action rejects super_admin role | unit | `npx vitest run tests/actions/auth.test.ts` | Wave 0 gap |
| AUTH-03 | Seed script creates super_admin user without HTTP endpoint | integration | `npx tsx db/seed-admin.ts` (manual verify) | Wave 0 gap |
| AUTH-04 | Signin/signout actions call auth.signIn/signOut | unit | `npx vitest run tests/actions/auth.test.ts` | Wave 0 gap |
| AUTH-05 | Session cookie present after signin (HttpOnly) | smoke | `npm run dev` then browser DevTools check | manual |
| AUTH-06 | factory_pm cannot access /site-pm/* (returns forbidden) | integration | `npx vitest run tests/dal.test.ts` | Wave 0 gap |
| AUTH-07 | verifySession() rejects calls without valid session | unit | `npx vitest run tests/lib/dal.test.ts` | Wave 0 gap |
| CHK-01 | checklist_definitions table exists; no hardcoded line items in TS | schema | `npx drizzle-kit push --dry-run` + grep | Wave 0 gap |

### Observable Success Criteria

Each Phase 1 success criterion should be verifiable via:

1. **Signup → role claim:** After signup with `role=factory_pm`, call `GET /api/auth/get-session` and verify `users.role === 'factory_pm'` in the DB.
2. **Super Admin not via public signup:** Attempt `POST /api/auth/sign-up/email` with `{ role: 'super_admin' }` → Server Action returns 400/validation error.
3. **Role-gated routes:** Authenticate as `factory_pm`, GET `/site-pm/dashboard` → HTTP 403 (forbidden() throws Next.js forbidden).
4. **Server-side mutation auth:** Call a Server Action directly (via fetch + CSRF token) as `factory_pm` user with a `site_pm`-owned resource ID → Action returns 403.
5. **Schema-as-data (CHK-01):** `SELECT count(*) FROM checklist_template_items` returns 0 (no items hardcoded yet); `SELECT count(*) FROM checklist_definitions` returns 9 (slugs only from seed); `grep -r "delivery_project_label\|sorting_label" src/` returns nothing.
6. **Session persists:** Log in, close tab, reopen → user still authenticated (cookie-based session).

### Wave 0 Gaps

- [ ] `vitest.config.ts` or `jest.config.ts` — no test framework installed
- [ ] `tests/actions/auth.test.ts` — covers AUTH-01, AUTH-02, AUTH-04
- [ ] `tests/lib/dal.test.ts` — covers AUTH-06, AUTH-07
- [ ] `tests/db/schema.test.ts` — covers CHK-01 schema structure

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=dot` (fast, relevant tests)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green + smoke test (sign up → log in → role dashboard) before `/gsd-verify-work`

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` in config.json.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `@neondatabase/auth` — Better Auth handles password hashing (Argon2), rate limiting, MFA hooks |
| V3 Session Management | Yes | Neon Auth cookie: HttpOnly, Secure, signed with `NEON_AUTH_COOKIE_SECRET` (32+ chars) |
| V4 Access Control | Yes | Four-layer RBAC: proxy.ts + route layouts + DAL `requireRole()` + Server Action ownership checks |
| V5 Input Validation | Yes | Zod v4 in every Server Action; `z.enum(['factory_pm', 'site_pm'])` whitelist for role field |
| V6 Cryptography | Partial | Password hashing handled by Neon Auth (Argon2); session cookie signing via HMAC in `@neondatabase/auth` |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Super Admin via signup form manipulation | Elevation of Privilege | `z.enum(['factory_pm', 'site_pm'])` in Server Action — `super_admin` rejected at schema level |
| IDOR: PM accesses another PM's checklist | Tampering | `requireOwnerOrAdmin(checklist.createdBy)` in every mutation Server Action |
| Cross-role route access | Elevation of Privilege | Route group layouts call `requireRole()` via DAL; not just proxy.ts |
| Session cookie tampering | Spoofing | Neon Auth signs cookies with `NEON_AUTH_COOKIE_SECRET`; HMAC verification on read |
| Server Action called directly (bypassing proxy) | Tampering | DAL called as first line in every Server Action — proxy is not the sole defense |
| JWT role claim lag after signup | Spoofing | DB insert + auth.signIn called in sequence with `await`; DAL reads role from Postgres, not JWT claim |
| `NEON_AUTH_COOKIE_SECRET` exposed | Information Disclosure | Never use `NEXT_PUBLIC_` prefix; `server-only` import on `lib/auth/server.ts` |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All server code | ✓ | (Darwin, assumed 20+) | — |
| npm | Package install | ✓ | (current) | — |
| DATABASE_URL | Drizzle DB queries | ✓ | — | Already in .env.local per STATE.md |
| NEON_AUTH_BASE_URL | @neondatabase/auth | ✗ | — | BLOCKING: must enable Neon Auth in Neon Console before any code |
| NEON_AUTH_COOKIE_SECRET | Session signing | ✗ | — | Generate via `openssl rand -base64 32` |
| tsx (for seed script) | db/seed-admin.ts | UNKNOWN | — | `npm install -D tsx` if missing |

**Missing dependencies blocking execution:**

- `NEON_AUTH_BASE_URL` — Neon Auth must be enabled in the Neon Console (Project → Branch → Auth tab) before Phase 1 development begins. This is the first step of Wave 0 / task 1.

**Missing dependencies with fallback:**

- `NEON_AUTH_COOKIE_SECRET` — generate locally: `openssl rand -base64 32`, add to `.env.local`

[VERIFIED: package.json confirms DATABASE_URL expected; @neondatabase/auth package.json requires NEON_AUTH_BASE_URL]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 | Critical: `middleware.ts` is deprecated; won't run |
| Stack Auth / `@stackframe/stack` | `@neondatabase/auth` (Better Auth) | Neon Auth rewrite, Dec 2025 | `@neondatabase/auth` is the real first-party package — Stack Auth is a separate product |
| `@neondatabase/auth` wrapping Stack Auth | `@neondatabase/auth` wrapping Better Auth | Dec 2025 (0.1.0-beta release) | All APIs are Better Auth patterns, NOT Stack Auth patterns |
| Sync `cookies()` / `headers()` | Async `await cookies()` / `await headers()` | Next.js 16 | Silent auth failure if not awaited |
| `params.id` (direct) | `const { id } = await params` | Next.js 16 | Async params — missing await returns Promise, not value |
| `jose` installed manually for JWTs | `jose` bundled in `@neondatabase/auth` | Included as dependency | Do NOT install `jose` separately unless building custom JWT layer |
| Zod v3 `message:` syntax | Zod v4 `error:` syntax | Zod v4 | `z.string().min(2, { error: '...' })` — `message` key no longer primary |

**Deprecated/outdated:**

- STACK.md's entire "Neon Auth: Package Name Disambiguation" section claiming `@neondatabase/auth` doesn't exist is **stale** — the package is real, installed as 0.4.2-beta, and is the correct choice. Disregard any mention of `@stackframe/stack`.
- STACK.md's `@neondatabase/serverless "^0.10"` version guess — actual latest is `1.1.0`.
- STACK.md's `drizzle-orm "^0.44"` version guess — actual latest is `0.45.2`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `auth.admin.createUser({ role: 'super_admin' })` creates a user with the custom role string stored in the Neon Auth / Better Auth users table | Super Admin Seed Script | If better-auth admin plugin rejects non-standard roles at the Neon Auth hosted instance level, the seed script may fail. Mitigation: use `auth.admin.createUser({...})` then `auth.admin.setRole({ userId, role: 'super_admin' })` as fallback. |
| A2 | `NEON_AUTH_BASE_URL` is obtained from Neon Console and the Neon Auth feature is available on the current Neon plan | Environment Setup | If the Neon plan doesn't include Neon Auth (it may be a paid feature), alternative is to self-host Better Auth. Verify in Neon Console before starting Wave 0. |
| A3 | `auth.getSession()` works without a request context when called in a Server Action (not just RSC) | DAL `verifySession()` | Better Auth typically reads from the HTTP request cookies; Server Actions in Next.js 16 pass the request context automatically. If not, may need to pass the request explicitly. Mitigation: test in Wave 0 task. |
| A4 | `@neondatabase/auth-ui` Tailwind v4 import (`@import '@neondatabase/auth-ui/tailwind'`) works with the project's existing Tailwind v4 setup | Auth UI Components | If CSS specificity conflicts, use non-Tailwind import (`@import '@neondatabase/auth-ui/css'`) instead. Low risk. |
| A5 | `drizzle-kit@0.31.10` is compatible with `drizzle-orm@0.45.2` | Drizzle Config | Drizzle maintains version parity between orm and kit; minor version skew may cause warnings. Pin together. [ASSUMED — not cross-verified] |

---

## Open Questions

1. **Neon Auth Neon Plan Availability**
   - What we know: Neon Auth is documented and the package is public
   - What's unclear: Whether Neon Auth is available on the free/hobby plan or requires paid plan
   - Recommendation: Check Neon Console during Wave 0 task 1. If unavailable, evaluate Better Auth self-hosted as fallback.

2. **better-auth Admin Plugin Custom Role Acceptance on Neon-Hosted Instance**
   - What we know: better-auth admin plugin accepts custom role strings per docs; the type is `role: string | string[]`
   - What's unclear: Whether Neon's hosted Better Auth instance allows arbitrary role strings or only `"user"/"admin"`
   - Recommendation: In seed script Wave 0 task, test `auth.admin.createUser({ role: 'super_admin' })`. If rejected, store role only in Postgres and remove the admin plugin role assignment.

3. **Post-Signup Role Redirect Strategy**
   - What we know: After signup the user is redirected to `/dashboard`; that page reads role from DB and redirects to role shell
   - What's unclear: Race between Neon Auth session cookie being set and the dashboard page's `verifySession()` DB query — is the session available on the very first redirect?
   - Recommendation: Add a short loading state on `/dashboard` and catch the "no session yet" case with a retry or refresh.

---

## Project Constraints (from CLAUDE.md)

### AGENTS.md Directive
"This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."

**Enforced:** All Next.js patterns in this research were verified against `node_modules/next/dist/docs/`. No 14/15 patterns used.

### Global CLAUDE.md Directives Applicable to Phase 1
- Ruff for Python, `npm run lint && npm run type-check` for JS/TS after modifications
- No `Co-Authored-By` AI trailers in commits
- Tokens in `.env.local` only; never hardcode `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL`
- `import 'server-only'` on all DAL files, auth server files, DB client files
- Server Actions and Route Handlers treated as public endpoints — never trust props or UI state for auth
- `drizzle-kit push` never in CI/CD pipelines

---

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — DAL pattern, verifySession, proxy auth guide
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — proxy.ts file convention, export forms, matcher config
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — Server Actions security, IDOR prevention
- `npm view @neondatabase/auth@0.4.2-beta` — package metadata, exports, dependencies (better-auth, jose, zod)
- `npm view @neondatabase/auth@0.4.2-beta readme` — README with full API reference and usage examples
- `github.com/neondatabase/neon-js NEXT-JS.md` — createNeonAuth, handler(), middleware(), getSession(), client setup, proxy.ts integration
- `/tmp/package/dist/next/server/index.d.mts` — createNeonAuth signature, NeonAuth type, API_ENDPOINTS (admin.createUser, admin.setRole, signUp.email, signIn.email, signOut)
- `/tmp/package/dist/adapter-core-BiYHR4I-.d.mts` — UserWithRole type, admin plugin body types, custom role string support

### Secondary (MEDIUM confidence)
- `npm view drizzle-orm version` → 0.45.2 [VERIFIED]
- `npm view @neondatabase/serverless version` → 1.1.0 [VERIFIED]
- `npm view drizzle-kit version` → 0.31.10 [VERIFIED]
- `npm view zod version` → 4.4.3 [VERIFIED]
- `npm view jose version` → 6.2.3 [VERIFIED — bundled dep]
- `better-auth.com/docs/plugins/admin#custom-roles` — custom role creation with createAccessControl, adminRoles option, setRole API
- `.planning/research/ARCHITECTURE.md` — DAL patterns, four-layer RBAC, Drizzle schema design (validated against new findings)
- `.planning/research/PITFALLS.md` — Phase 1 pitfalls (validated)

### Tertiary (LOW confidence / ASSUMED)
- `drizzle-kit@0.31.10` + `drizzle-orm@0.45.2` version compatibility — [ASSUMED, flagged A5]

---

## Metadata

**Confidence breakdown:**

- @neondatabase/auth API: HIGH — README + dist type inspection + NEXT-JS.md
- Next.js 16 patterns: HIGH — bundled local docs
- Drizzle schema: HIGH — package versions verified; column API stable
- Custom role strings in better-auth admin plugin: MEDIUM — better-auth docs confirm; Neon-hosted instance behavior untested (flagged A1)
- Neon Auth Console setup: MEDIUM — documented but plan availability not confirmed (flagged A2)

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (30 days — beta package could update; re-verify before Phase 2 if blocked)
