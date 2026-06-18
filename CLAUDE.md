@AGENTS.md

<!-- GSD:project-start source:PROJECT.md -->
## Project

**TRT Arredo Project Management Platform**

A digital platform that replaces the paper checklists TRT Arredo currently uses on the factory floor and on installation sites. Three roles (Factory PM, Site PM, Super Admin) share one app shell, each seeing only their own flows, plus an AI assistant ("Dave Aredo") that answers project-management questions grounded in the company's internal process docs. It is the single system of record for delivery checklists, site assessments, verifications, and uploaded photo/file evidence.

**Core Value:** A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with each role seeing only what's theirs and the Super Admin seeing everything read-only.

### Constraints

- **Tech stack**: Next.js 16.2.9 + React 19.2.4, App Router, Tailwind v4, TypeScript — already scaffolded. Next 16 has breaking changes vs. older versions; consult `node_modules/next/dist/docs/` before writing route/server code (per repo AGENTS.md).
- **Database**: Postgres on Neon + Drizzle ORM. Connection string in `.env.local` as `DATABASE_URL` (gitignored).
- **Auth**: Neon Auth (`@neondatabase/auth`) — role claims for `factory_pm`, `site_pm`, `super_admin`, gating both routes and nav.
- **File storage**: S3-compatible bucket for checklist photos & ID cards.
- **AI**: Claude Agent SDK, server-side endpoint, context injection scoped to caller's role/permissions.
- **Suggested schema entities**: users, projects, checklists, checklist_items, checklist_responses, attachments, processes, chat_messages.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

> ## ⚠️ VERIFIED PACKAGE FACTS (2026-06-18, via `npm view` — these OVERRIDE any conflicting package names/versions below)
>
> The stack section below was generated from research written before live npm verification, so its package conclusions are stale. Trust these instead:
>
> - **`@neondatabase/auth` IS the correct auth package — install it.** Exists at **`0.4.2-beta`**. NOT `@stackframe/stack`. BETA: pin exact version (`"@neondatabase/auth": "0.4.2-beta"`); verify session / JWT role-claim API from package docs before writing `lib/dal.ts`.
> - **`@anthropic-ai/claude-agent-sdk` IS a real, separate package — use it for Dave Aredo.** Exists at **`0.3.181`**, distinct from `@anthropic-ai/sdk` (`0.105.0`).
> - **`@neondatabase/serverless` is `1.1.0`** (not `^0.10`); **`drizzle-orm` is `0.45.2`** (not `^0.44`).
> - Any text below recommending `@stackframe/stack`, saying `@neondatabase/auth` doesn't exist, or mapping the Agent SDK to `@anthropic-ai/sdk` is stale — disregard it.

## CRITICAL: Next 16 Breaking Changes vs 14/15
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
## Neon Auth: Package Name Disambiguation (IMPORTANT)
- **Package to install:** `@stackframe/stack` (the Stack Auth client + server SDK)
- **Neon provides:** a managed Stack Auth backend instance linked to your Neon project, with the Postgres user table stored in your Neon DB
- **npm package name:** `@stackframe/stack` — NOT `@neondatabase/auth`
### Stack Auth role claims in Next 16 App Router
## Drizzle + Neon: Driver Choice
### Why not `pg` / `node-postgres`
### Why not `neon-http` (the legacy package)
### Correct setup
### `drizzle.config.ts`
## S3 Presigned Uploads from Next 16 App Router
### Pattern: Server Action generates presigned URL, client uploads directly
### Bucket choice recommendation
## Claude Agent SDK (Dave Aredo AI assistant)
### Package clarification
- **`@anthropic-ai/sdk`** — the official Anthropic TypeScript SDK
### Next 16 Route Handler for streaming chat
### Rate limiting for Dave Aredo
## Installation Commands
# Database
# Auth (Stack Auth / Neon Auth)
# S3 uploads
# AI
# Session / validation
# Forms
# Client data fetching (for chat overlay)
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
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `next@16.2.9` | `react@19.2.4`, `react-dom@19.2.4` | Installed — already pinned |
| `drizzle-orm@^0.44` | `@neondatabase/serverless@^0.10` | Use `drizzle-orm/neon-http` adapter for HTTP transport, `drizzle-orm/neon-serverless` for Pool/WebSocket |
| `@stackframe/stack` | `next@16` App Router | Stack Auth has Next.js App Router adapter; verify Next 16 support in Stack Auth changelog before installing — Stack Auth was built for Next 14/15 patterns initially |
| `@anthropic-ai/sdk@^0.39+` | Node.js 18+, Edge Runtime (limited) | Do not use in Edge Runtime (`export const runtime = 'edge'`) unless you verify the SDK's Edge compatibility; default Node.js runtime in Route Handlers is safe |
| `tailwindcss@^4` | `@tailwindcss/postcss@^4` | Already installed. v4 config is CSS-first — no `tailwind.config.js`; configure via `@theme` in CSS |
| `zod@^3.24` | Works with `.error` shorthand field | Next 16 docs examples use `z.string().min(2, { error: '...' })` syntax (Zod 3.24+ `error` shorthand, not `message`) |
## Stack Patterns by Scenario
- `async` Server Component + direct Drizzle query via DAL
- No `fetch`, no API route needed — query runs server-side
- Use `React.cache()` on DAL functions for per-request memoization
- Multi-step wizard: Client Component with `react-hook-form` managing local state
- Final submit: Server Action (`'use server'`) called from form `action` prop
- Feedback state: `useActionState` hook in the Client Component wrapper
- After mutation: `revalidatePath` or `revalidateTag` inside the Server Action
- User picks file in Client Component
- Client calls Server Action `getUploadUrl()` to get presigned S3 URL
- Client uploads directly to S3 via `fetch(presignedUrl, { method: 'PUT', body: file })`
- Client calls another Server Action to save the S3 key to DB
- Floating button is a Client Component
- On send: `fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) })`
- Route Handler streams back text/plain
- Client reads the stream incrementally and updates React state
- `proxy.ts` (NOT `middleware.ts`) for fast optimistic redirect based on session cookie presence
- DAL `verifySession()` + role check inside every Server Component / Server Action / Route Handler — do not rely on proxy alone
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
