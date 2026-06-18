# Project Research Summary

**Project:** TRT Arredo Project Management Platform
**Domain:** Internal multi-role field-operations / digital-checklist platform with embedded AI assistant
**Researched:** 2026-06-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

TRT Arredo is a paper-checklist replacement for furniture installation operations. Three roles (Factory PM, Site PM, Super Admin) share one Next.js 16 App Router shell but see entirely separate flows. The correct build model is a **template-driven wizard engine** backed by a three-tier schema (definition → template items → responses) — not bespoke components per checklist type. This directly de-risks the biggest planning unknown: the exact line items for ~9 checklists are pending source PDFs, and a template-driven schema makes those PDFs data inserts rather than code rewrites. The AI assistant **Dave Aredo** is the primary differentiator: role-scoped, grounded in the internal process knowledge base, with no competitor platform offering this pattern.

The stack is largely already installed (Next.js 16.2.9, React 19.2.4, Tailwind v4). Packages to add: `drizzle-orm` 0.45.2, `@neondatabase/serverless` 1.1.0, `@neondatabase/auth` 0.4.2-beta (confirmed real via npm, **BETA** — pin exact version), `@anthropic-ai/claude-agent-sdk` 0.3.181 (confirmed real, **separate** from `@anthropic-ai/sdk` 0.105.0), and AWS SDK v3 for S3 presigned uploads. Next.js 16 has hard breaking changes that are "contagious" if gotten wrong: `proxy.ts` replaces `middleware.ts`, and `params` / `cookies()` / `headers()` are all async.

The single most dangerous risk is **RBAC enforced only in the UI with no data-layer authorization** — an IDOR vulnerability where any PM could call any Server Action against another user's data. A Data Access Layer (`lib/dal.ts`, `server-only`) with `verifySession()` + ownership checks must be established in Phase 1 before any feature is built. The other security pitfalls (Super Admin reachable via public signup, AI prompt injection, API-key exposure, client-side rate limiting) are straightforward to prevent once the correct patterns are set from the start.

## Key Findings

### Recommended Stack

Confirmed/decided stack, versions verified live via `npm view`:

**Core technologies:**
- **Next.js 16.2.9 + React 19.2.4** (App Router, TypeScript, Tailwind v4) — already scaffolded. Use `proxy.ts` (not `middleware.ts`); `await` `params`/`cookies()`/`headers()`.
- **Postgres on Neon + Drizzle ORM 0.45.2** via `@neondatabase/serverless` 1.1.0 with `drizzle-orm/neon-http` for queries; the serverless `Pool` adapter only for transactions. Do **not** use `pg` (breaks on serverless).
- **`@neondatabase/auth` 0.4.2-beta** — auth + role claims (`factory_pm`, `site_pm`, `super_admin`). BETA: pin exact version, verify session/JWT-claim shape from package docs in Phase 1.
- **`@anthropic-ai/claude-agent-sdk` 0.3.181** — Dave Aredo server-side endpoint. Real package, separate from `@anthropic-ai/sdk`. Chat lives in a Route Handler with a streaming `ReadableStream` response, not a Server Action.
- **AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)** — presigned PUT uploads direct to bucket; store the S3 **key**, never the presigned URL; generate presigned GET on demand.

### Expected Features

**Must have (table stakes):** role-gated nav/routes, multistep checklist wizards with radio-button items, per-item photo upload, sortable/filterable file & entry lists, creator-only edit, Super Admin read-only aggregate oversight, profile with ID-card upload, Processes & Flow Charts + About TRT content, audit trail of who/when.

**Should have (differentiators):** Dave Aredo (role-scoped AI grounded in process docs), the Confirmation/Verification wizard (verify on-site reality vs. architect drawing).

**Defer (anti-features for v1):** native offline-first/PWA sync, image upload into the AI chat, Super Admin write access to operational data, a general-purpose form-builder UI.

### Architecture Approach

**Major components:**
1. **Auth + RBAC foundation** — `@neondatabase/auth`, `proxy.ts` optimistic redirect, route-group layouts, `lib/dal.ts` authoritative checks, creator-ownership guard on every mutation.
2. **Template-driven checklist engine** — `checklist_definitions` → `checklist_template_items` (grouped by wizard `step`) → `checklist_responses`; one `WizardShell` renders all 9 checklist types from data.
3. **Projects + storage** — `projects` as parent record; S3 presigned upload flow proven first on Profile ID-card.
4. **Dave Aredo** — isolated Route Handler, role-scoped system prompt + `processes` corpus, `ai_usage` table for server-side rate limiting, per-user persisted `chat_messages`.

### Critical Pitfalls

1. **UI-only RBAC (IDOR)** — establish `lib/dal.ts` with `verifySession()` + ownership check as the first call in every Server Action, Phase 1.
2. **`middleware.ts` in Next 16** — silently never runs; must be `proxy.ts` with named `proxy` export.
3. **Super Admin via public signup** — self-serve role picker must offer only the two PM roles; Super Admin seeded by script.
4. **AI prompt injection** — user checklist notes must never be injected into the system prompt without delimiters; prompt-injection test is a ship gate for Dave Aredo.
5. **Client-side rate limiting** — enforce AI quota server-side (`ai_usage` upsert + 429 before calling Claude) to bound API spend.

## Implications for Roadmap

Suggested phase structure (**6 phases**):

### Phase 1: Foundation — Auth, Schema, DAL
**Rationale:** Every feature depends on knowing the caller; security pitfalls concentrate here.
**Delivers:** Drizzle setup + migrations, three-tier checklist schema, `@neondatabase/auth` wired, `proxy.ts`, `lib/dal.ts`, Super Admin seed script, self-serve signup with PM-only role picker.
**Avoids:** IDOR, `middleware.ts` trap, Super Admin-via-signup.

### Phase 2: Core Data + Project Records + S3
**Rationale:** Projects are the parent for most checklists; prove the upload pattern once on a low-stakes surface.
**Delivers:** Projects CRUD (scoped), S3 presign→upload→register flow validated on Profile ID-card, shared app shell + role-based nav, Profile/About TRT/Processes pages.
**Uses:** AWS SDK v3 presigned uploads.

### Phase 3: Checklist Engine — Generic Wizard
**Rationale:** Build `WizardShell` once; all 9 checklist types become configuration.
**Delivers:** `WizardShell` reading `checklist_template_items`, per-step draft save to DB, radio (tri-state-capable) items, per-item photo attachment, View List/View File tables.

### Phase 4: Role-Specific Checklist Flows + Super Admin
**Rationale:** All 9 checklist types are config on the Phase 3 engine; admin oversight needs data to exist.
**Delivers:** Factory PM (Floor Projects table+toggle, Delivery Project Checklist, Product Readiness) and Site PM (Confirmation/Verification, Delivery Site Readiness, Issue Log, Sorting, Email Formats, Change Request, Close Out, New Project) flows; Super Admin read-only aggregate + user management + content management.

### Phase 5: Dave Aredo (AI)
**Rationale:** Highest-complexity security surface; independent of checklist functionality.
**Delivers:** Route Handler streaming endpoint, role-scoped context grounded in `processes`, `ai_usage` server-side rate limiting (configurable), per-user persisted history, prompt-injection acceptance test.

### Phase 6: Polish & Production Hardening
**Rationale:** Field/mobile realities + items blocked on source PDFs.
**Delivers:** mobile testing, error boundaries, Issue Log final format (blocked on PDF), deployment hardening.

### Phase Ordering Rationale
- Strictly dependency-constrained: auth/schema/DAL unblock everything; wizard engine precedes role flows so checklists are config not code; AI last because it's isolated and security-heavy.
- PDF gap is absorbed by the template-driven schema — Phases 1–3 proceed without final line items; Phase 4/6 slot them in as data.

### Research Flags
Phases likely needing deeper research during planning:
- **Phase 1:** `@neondatabase/auth` 0.4.2-beta — verify session shape, JWT role-claim injection, `refreshSession()` after role assignment from actual package docs. Do NOT assume Stack Auth patterns.
- **Phase 5:** `@anthropic-ai/claude-agent-sdk` 0.3.181 — verify streaming API shape from package docs; don't assume it matches `@anthropic-ai/sdk`.

Phases with standard patterns (skip research-phase):
- **Phase 2:** S3 presigned uploads — well-documented.
- **Phase 3:** Drizzle schema + migrations — standard.
- **Phase 4:** role-specific flows — configuration on Phase 3 engine.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Next 16 verified from bundled docs; package versions verified live via npm |
| Features | HIGH | Derived from PROJECT.md per-role flows; anti-features explicit in spec |
| Architecture | HIGH | Next 16 RBAC + template schema verified against bundled docs |
| Pitfalls | HIGH | Next 16 security patterns from bundled docs; AI/upload pitfalls industry-standard |

**Overall confidence:** MEDIUM-HIGH (Next 16 HIGH from local docs; auth + AI SDK packages confirmed real via npm but APIs validate in-phase; Drizzle/S3 MEDIUM until implementation).

### Gaps to Address
- **Checklist line items (9 checklists)** — pending source PDFs; handled by template-driven schema, do not invent. Resolve in Phase 4/6.
- **`@neondatabase/auth` beta API** — validate session/claims in Phase 1 before writing `lib/dal.ts`.
- **Issue Log data model** — "Excel-style inline rows" vs "links to external sheet" undecided; needs PDF. Defer to Phase 6.
- **Open product decisions** — Confirmation→Verification rename (platform-wide?), Yes/No vs Yes/No/N/A items (schema supports tri-state regardless), final AI quota.

## Sources

### Primary (HIGH confidence)
- `node_modules/next/dist/docs/` — Next 16.2.9 App Router, proxy.ts, async params/cookies, data-security/RBAC guides.
- `npm view` (live) — package existence + versions for auth, agent SDK, serverless, drizzle.

### Secondary (MEDIUM confidence)
- Training knowledge of SafetyCulture/iAuditor, Fieldwire, GoFormz, Procore for feature categorization.
- Standard AWS SDK v3 / Drizzle-Neon community patterns.

---
*Research completed: 2026-06-18*
*Ready for roadmap: yes*
