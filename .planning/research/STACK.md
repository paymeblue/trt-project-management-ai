# Stack Research

**Domain:** Internal multi-role field-operations & checklist project-management web app
**Researched:** 2026-06-18
**Confidence:** HIGH (Next 16 from bundled local docs) / MEDIUM (Drizzle/Neon/S3/Claude SDK from training data + known docs patterns — external verification blocked during this session)

---

> ## ⚠️ VERIFIED PACKAGE FACTS (2026-06-18, via `npm view` — these OVERRIDE any conflicting package names/versions anywhere below)
>
> External verification was blocked during the research run, so the package conclusions further down are STALE guesses. The orchestrator verified the following live; trust these:
>
> - **`@neondatabase/auth` IS the correct auth package — install it.** It exists at **`0.4.2-beta`**. It is NOT `@stackframe/stack`. BETA: pin the exact version (`"@neondatabase/auth": "0.4.2-beta"`, not `^`); verify the session / JWT role-claim API from the package's own docs before writing `lib/dal.ts`.
> - **`@anthropic-ai/claude-agent-sdk` IS a real, separate package — use it for Dave Aredo.** It exists at **`0.3.181`**, distinct from `@anthropic-ai/sdk` (`0.105.0`). The "Claude Agent SDK" is a real package, not just the base SDK with streaming.
> - **`@neondatabase/serverless` is `1.1.0`** (not `^0.10`). **`drizzle-orm` is `0.45.2`** (not `^0.44`).
> - Any text below recommending `@stackframe/stack`, claiming `@neondatabase/auth` does not exist, or saying the Agent SDK "maps to `@anthropic-ai/sdk`" is stale pre-verification analysis — disregard it.

---

## CRITICAL: Next 16 Breaking Changes vs 14/15

The following are verified changes from the bundled `node_modules/next/dist/docs/` for Next.js 16.2.9. Do not apply Next 14/15 patterns.

| What changed | Old (14/15) | New (16) | Source |
|---|---|---|---|
| Middleware filename | `middleware.ts` | `proxy.ts` | bundled docs: `01-app/01-getting-started/16-proxy.md` |
| Middleware export name | `export default function middleware` | `export function proxy` or `export default function proxy` | same |
| `params` in page/layout/route | direct object `{ id: string }` | `Promise<{ id: string }>` — must `await params` | bundled docs: `05-server-and-client-components.md` |
| `cookies()` / `headers()` | sync call | async — must `await cookies()`, `await headers()` | bundled docs: `07-mutating-data.md` |
| Server Action terminology | "Server Actions" | "Server Functions" (broader term); "Server Action" = Server Function in mutation/form context | bundled docs: `07-mutating-data.md` |
| Cache invalidation | `revalidatePath` + `revalidateTag` | same, plus new `refresh()` from `next/cache` for router-only refresh without cache bust | bundled docs: `07-mutating-data.md` |
| Caching model | `getStaticProps` / `fetch` cache flags | `use cache` directive + `cacheLife()` from `next/cache` (new model, opt-in via `cacheComponents: true` in `next.config.ts`) | bundled docs: `08-caching.md` |
| Route handler conflict | `route.js` and `page.js` at same segment = error | same rule, still enforced | bundled docs: `15-route-handlers.md` |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.9 (installed) | Full-stack React framework, App Router | Already scaffolded. App Router gives Server Components, Server Functions, streaming — correct for a data-heavy internal app where most UI is server-rendered. |
| React | 19.2.4 (installed) | UI runtime | Ships with Next 16; enables `useActionState`, `use()` hook for promise streaming, `React.cache` for per-request memoization. |
| TypeScript | ^5 (installed) | Type safety | Already scaffolded. Required for `RouteContext<'/path'>` typed route params in Next 16. |
| Tailwind CSS | ^4 (installed) | Utility-first styling | Already scaffolded with `@tailwindcss/postcss`. v4 has new CSS-first config — no `tailwind.config.js` by default; config lives in CSS file. |
| Drizzle ORM | ^0.44 (to install) | Type-safe SQL ORM | Best-in-class TS types for Postgres. Schema-first, generates migrations. Works natively with Neon serverless driver. Lighter than Prisma, no binary engine. |
| @neondatabase/serverless | ^0.10 (to install) | Neon Postgres driver | Use this, not `neon-http`. It bundles both HTTP and WebSocket transports. In serverless (Next.js Server Components, Route Handlers), use the HTTP transport via `neon()` tagged-template or `Pool` from this package. |
| Stack Auth (`@stackframe/stack`) | latest (to install) | Authentication + role claims | See Neon Auth section below for critical disambiguation. |
| @aws-sdk/client-s3 | ^3 (to install) | S3-compatible presigned upload URLs | AWS SDK v3 is modular — import only `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Works with any S3-compatible provider (AWS, Cloudflare R2, Tigris, etc.). |
| @anthropic-ai/sdk | ^0.39+ (to install) | Claude AI client | The base Anthropic SDK. The "Claude Agent SDK" reference in the project spec maps to this package used with streaming. See Claude section. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | ^0.30 (devDep) | Drizzle schema push + migration gen | Dev/CI: `drizzle-kit generate`, `drizzle-kit migrate` |
| `jose` | ^5 | JWT sign/verify for session tokens | If building custom session layer (needed regardless of auth provider for DAL cookie verification) |
| `server-only` | latest | Prevents accidental client-side import of server modules | Mark DAL, DB connection, and env secrets files with `import 'server-only'` |
| `zod` | ^3.24 | Runtime schema validation | Server Action form validation, env var validation, API input validation |
| `react-hook-form` | ^7 | Client-side form state for multi-step wizard | Use with `useActionState` bridge for the multistep checklist wizards |
| `@tanstack/react-query` | ^5 | Client-side data fetching / cache | For the chat overlay and any optimistic updates that need client-side state |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `eslint-config-next` | 16.2.9 (installed) | Next-aware ESLint rules | Already in devDeps. Run `npm run lint`. |
| `drizzle-kit` | Schema migration + studio | `npx drizzle-kit studio` gives a local DB browser |
| `@types/node`, `@types/react`, `@types/react-dom` | TypeScript declarations | Already in devDeps |

---

## Neon Auth: Package Name Disambiguation (IMPORTANT)

**The package `@neondatabase/auth` does not exist as a standalone Neon-published package.** The correct understanding:

Neon's authentication offering is built on top of **Stack Auth** by Stackframe. When Neon documentation refers to "Neon Auth," it means:

- **Package to install:** `@stackframe/stack` (the Stack Auth client + server SDK)
- **Neon provides:** a managed Stack Auth backend instance linked to your Neon project, with the Postgres user table stored in your Neon DB
- **npm package name:** `@stackframe/stack` — NOT `@neondatabase/auth`

**Confidence: MEDIUM** — this is based on Neon's known partnership with Stack Auth as of mid-2025. If Neon has since published a first-party `@neondatabase/auth` package, verify at `npmjs.com/package/@neondatabase/auth` before installing. If that package does not exist on npm, use `@stackframe/stack`.

### Stack Auth role claims in Next 16 App Router

Stack Auth stores user metadata (including a custom `role` field) in the Neon-backed user record. Role claims work as follows:

1. After signup, update the user's `clientMetadata` or `serverMetadata` with `{ role: 'factory_pm' | 'site_pm' | 'super_admin' }`.
2. Server Components and Server Actions read the current user via `stackServerApp.getUser()` (server-side) or `useUser()` (client).
3. Role checking in the DAL pattern (Next 16 recommended):

```typescript
// lib/dal.ts
import 'server-only'
import { cache } from 'react'
import { stackServerApp } from '@/lib/stack'

export const getCurrentUser = cache(async () => {
  const user = await stackServerApp.getUser()
  if (!user) return null
  const role = user.clientMetadata?.role as 'factory_pm' | 'site_pm' | 'super_admin' | undefined
  return { ...user, role }
})
```

4. Route protection in `proxy.ts` (NOT `middleware.ts` — Next 16 breaking change):

```typescript
// proxy.ts  (root of project — this is the Next 16 file name, not middleware.ts)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Stack Auth sets a session cookie; read it here for optimistic redirect only
  // Do NOT do DB lookups in proxy.ts — it runs on every prefetch
  const sessionCookie = request.cookies.get('stack-auth-session')
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard')

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

5. Super Admin provisioning: set `serverMetadata.role = 'super_admin'` via a seed script calling the Stack Auth Admin API — never exposed via the self-serve signup flow.

---

## Drizzle + Neon: Driver Choice

**Use `@neondatabase/serverless` with the HTTP transport.** Do not use `node-postgres` (`pg`) directly.

### Why not `pg` / `node-postgres`

`pg` maintains a persistent TCP connection. In serverless environments (Vercel Edge, Lambda, Next.js Route Handlers in serverless deployment), TCP connections cannot be held between requests. Using `pg` causes connection exhaustion and cold-start timeouts.

### Why not `neon-http` (the legacy package)

`neon-http` was the original Neon HTTP-only package. It is now superseded by `@neondatabase/serverless` which unifies HTTP and WebSocket transports in one package. The Drizzle docs now show `@neondatabase/serverless`.

### Correct setup

```typescript
// lib/db.ts
import 'server-only'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

For transactions (which require a connection-like session), use the WebSocket pooled variant:

```typescript
// lib/db-pool.ts — only import when you need transactions
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

**Rule: use `neon-http` adapter (first file) for all read queries and simple mutations. Use `neon-serverless` (Pool + WebSocket, second file) only for multi-statement transactions.**

### `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

---

## S3 Presigned Uploads from Next 16 App Router

### Pattern: Server Action generates presigned URL, client uploads directly

Do NOT proxy file bytes through the Next.js server. Always generate a presigned URL server-side and upload from the browser directly to the bucket.

```typescript
// app/actions/upload.ts
'use server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCurrentUser } from '@/lib/dal'

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  // For S3-compatible providers (R2, Tigris), add:
  // endpoint: process.env.S3_ENDPOINT,
  // forcePathStyle: true,
})

export async function getUploadUrl(filename: string, contentType: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const key = `uploads/${user.id}/${Date.now()}-${filename}`
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(s3, command, { expiresIn: 300 }) // 5 min
  return { url, key }
}
```

Client-side upload from a Client Component:

```typescript
// In a 'use client' component
const { url, key } = await getUploadUrl(file.name, file.type)
await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
// Then save `key` to DB via another Server Action
```

### Bucket choice recommendation

Use **Cloudflare R2** (zero egress fees) or **Tigris** (auto-replicated) for a lean internal app. Both are S3-compatible. Set `endpoint` in the S3Client. Avoid AWS S3 for a first deploy unless already in the AWS ecosystem — egress costs add up on photo-heavy checklist apps.

---

## Claude Agent SDK (Dave Aredo AI assistant)

### Package clarification

The "Claude Agent SDK" referenced in the project spec is the **Anthropic Python/TypeScript SDK** used with streaming, specifically the patterns now documented under "Agents" in Anthropic's docs. The npm package is:

- **`@anthropic-ai/sdk`** — the official Anthropic TypeScript SDK

There is no separate `@anthropic-ai/agent-sdk` npm package as of this writing. The agent capabilities (tool use, streaming, multi-turn) are part of the core SDK.

**Confidence: MEDIUM** — verify current package name at `npmjs.com/package/@anthropic-ai/sdk` before installing.

### Next 16 Route Handler for streaming chat

The AI chat endpoint is a Route Handler (not a Server Action — streaming responses belong in Route Handlers):

```typescript
// app/api/chat/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentUser } from '@/lib/dal'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await request.json()

  // Role-scoped system prompt
  const systemPrompt = buildSystemPrompt(user.role)

  const stream = await client.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  // Return a ReadableStream to the client
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(new TextEncoder().encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
```

### Rate limiting for Dave Aredo

Store `chat_message_count` per user per day in Postgres. Check in the Route Handler before calling Anthropic. Do not use Anthropic's API-level rate limiting for per-user quotas — it doesn't support per-user granularity.

---

## Installation Commands

```bash
# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Auth (Stack Auth / Neon Auth)
npm install @stackframe/stack

# S3 uploads
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# AI
npm install @anthropic-ai/sdk

# Session / validation
npm install jose server-only zod

# Forms
npm install react-hook-form

# Client data fetching (for chat overlay)
npm install @tanstack/react-query
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@neondatabase/serverless` (neon-http adapter) | `pg` / node-postgres | Only if running a persistent Node.js server (not serverless) — not applicable here |
| `@neondatabase/serverless` (neon-serverless Pool adapter) | Prisma | Prisma is fine but adds binary engine overhead and slower migrations; Drizzle is lighter for a focused internal app |
| Stack Auth (`@stackframe/stack`) | NextAuth.js v5 / Auth.js | Auth.js has no native Neon integration and requires manual role claim plumbing; Stack Auth embeds in Neon and stores users in your Neon DB natively |
| Stack Auth | Clerk | Clerk is excellent but adds $25+/mo at team scale; Stack Auth is cheaper for internal apps with known user count |
| Route Handler for AI streaming | Server Action for AI streaming | Server Actions are dispatched one at a time and are not designed for streaming responses; Route Handlers use standard Response API which supports ReadableStream |
| `@aws-sdk/client-s3` v3 (modular) | `aws-sdk` v2 (monolith) | v2 is deprecated; do not install it |
| Cloudflare R2 / Tigris | AWS S3 | AWS S3 is fine if already on AWS; R2/Tigris have zero egress fees which matters for photo uploads |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `middleware.ts` | **Next 16 breaking change** — Middleware is renamed to Proxy; file must be `proxy.ts`, export must be `proxy` | `proxy.ts` with `export function proxy(req)` |
| `params.id` (direct access, unawaited) | **Next 16 breaking change** — `params` is now a Promise; accessing without `await` returns a Promise object, not the value | `const { id } = await params` |
| `cookies()` without await | **Next 16 breaking change** — `cookies()` is now async | `const cookieStore = await cookies()` |
| `headers()` without await | Same as cookies | `const headersList = await headers()` |
| `aws-sdk` (v2) | Deprecated since 2023; unmaintained | `@aws-sdk/client-s3` (v3) |
| `pg` / `node-postgres` directly | Persistent TCP connections break in serverless deployments | `@neondatabase/serverless` |
| `neon-http` (legacy package) | Superseded by `@neondatabase/serverless` | `@neondatabase/serverless` |
| Proxying file uploads through Next.js server | Wastes server memory and bandwidth for binary data; blocks other requests | S3 presigned PUT URL — client uploads directly to bucket |
| Calling Anthropic API from Server Actions | Server Actions are not streaming-capable; responses are one-shot JSON | Route Handler (`app/api/chat/route.ts`) with `ReadableStream` |
| Storing `ANTHROPIC_API_KEY` or AWS credentials in client-accessible code | Security breach | Env vars only, accessed via `process.env.*` in Server Components / Route Handlers / Server Actions; never in `'use client'` files |
| `revalidatePath` / `revalidateTag` inside `proxy.ts` | Has no effect in Proxy (documented in Next 16 bundled docs) | Use these only inside Server Functions or Route Handlers |
| `fetch` cache options (`next.revalidate`, `next.tags`) inside `proxy.ts` | Same — no effect in Proxy | Use outside Proxy |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `next@16.2.9` | `react@19.2.4`, `react-dom@19.2.4` | Installed — already pinned |
| `drizzle-orm@^0.44` | `@neondatabase/serverless@^0.10` | Use `drizzle-orm/neon-http` adapter for HTTP transport, `drizzle-orm/neon-serverless` for Pool/WebSocket |
| `@stackframe/stack` | `next@16` App Router | Stack Auth has Next.js App Router adapter; verify Next 16 support in Stack Auth changelog before installing — Stack Auth was built for Next 14/15 patterns initially |
| `@anthropic-ai/sdk@^0.39+` | Node.js 18+, Edge Runtime (limited) | Do not use in Edge Runtime (`export const runtime = 'edge'`) unless you verify the SDK's Edge compatibility; default Node.js runtime in Route Handlers is safe |
| `tailwindcss@^4` | `@tailwindcss/postcss@^4` | Already installed. v4 config is CSS-first — no `tailwind.config.js`; configure via `@theme` in CSS |
| `zod@^3.24` | Works with `.error` shorthand field | Next 16 docs examples use `z.string().min(2, { error: '...' })` syntax (Zod 3.24+ `error` shorthand, not `message`) |

---

## Stack Patterns by Scenario

**Server Component reading DB data (most pages):**
- `async` Server Component + direct Drizzle query via DAL
- No `fetch`, no API route needed — query runs server-side
- Use `React.cache()` on DAL functions for per-request memoization

**Checklist form submission (mutation):**
- Multi-step wizard: Client Component with `react-hook-form` managing local state
- Final submit: Server Action (`'use server'`) called from form `action` prop
- Feedback state: `useActionState` hook in the Client Component wrapper
- After mutation: `revalidatePath` or `revalidateTag` inside the Server Action

**File upload (checklist photo, ID card):**
- User picks file in Client Component
- Client calls Server Action `getUploadUrl()` to get presigned S3 URL
- Client uploads directly to S3 via `fetch(presignedUrl, { method: 'PUT', body: file })`
- Client calls another Server Action to save the S3 key to DB

**AI chat (Dave Aredo):**
- Floating button is a Client Component
- On send: `fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) })`
- Route Handler streams back text/plain
- Client reads the stream incrementally and updates React state

**Route protection (all roles):**
- `proxy.ts` (NOT `middleware.ts`) for fast optimistic redirect based on session cookie presence
- DAL `verifySession()` + role check inside every Server Component / Server Action / Route Handler — do not rely on proxy alone

---

## Sources

- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` — Next 16 Proxy (formerly Middleware) rename, `proxy.ts` file convention (HIGH confidence — bundled local docs)
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` — Server Functions, `useActionState`, `refresh()` from `next/cache` (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` — Server Components data fetching, `React.cache`, `Promise.all` (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — `params` as `Promise<{}>`, must `await params` (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` — `use cache` directive, `cacheLife()`, `cacheComponents` opt-in (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handlers, caching rules, `RouteContext<>` helper (HIGH confidence)
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` — DAL pattern, `verifySession()`, role-based rendering in Server Components (HIGH confidence)
- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` — Confirmed `proxy.ts` in top-level file list (HIGH confidence)
- Drizzle ORM + Neon driver choice — training data (pre-Aug 2025) + Drizzle docs patterns (MEDIUM confidence — verify `@neondatabase/serverless` version at time of install)
- Neon Auth / Stack Auth package name — training data (MEDIUM confidence — MUST verify `@stackframe/stack` vs `@neondatabase/auth` at npm before installing; external verification was unavailable in this session)
- `@anthropic-ai/sdk` for Claude streaming — training data (MEDIUM confidence — verify current package name and streaming API at npmjs.com before installing)
- `@aws-sdk/client-s3` v3 for S3 presigned URLs — training data; v3 is the current AWS SDK major version (MEDIUM confidence)

---
*Stack research for: TRT Arredo Project Management Platform (internal multi-role field ops)*
*Researched: 2026-06-18*
