# TRT Arredo Project Management Platform

## What This Is

A digital platform that replaces the paper checklists TRT Arredo uses on the factory floor and on installation sites — now built around a DB-driven, super-admin-configurable 21-step production workflow (Customer Care intake through Sign Off). Eleven permission roles share one app shell, each seeing only their own flows; exact-position gates (Operations Admin, CPO, Head of Design, …) narrow sensitive steps; per-tab sessions let several users work in one browser; and an AI assistant ("Dave Aredo") answers process questions. It is the single system of record for the workflow, checklists, approvals, assignments, deadlines, and uploaded photo/PDF evidence.

## Core Value

A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with each role seeing only what's theirs and the Super Admin seeing everything read-only.

## Current State (post-v2.0, 2026-07-19)

**Shipped:** v2.0 Configurable Production Workflow Engine — the hardcoded step array is gone; the live 21-step graph (intake → design pipeline → production authorization → QC → delivery → sign-off) lives in Postgres and is self-service-editable via the PIN-gated Workflow Configurator. Per-tab multi-user auth, position-scoped notifications, strictly per-step deadlines, escalation flags, and a full-evidence audit view all shipped alongside. See `.planning/MILESTONES.md` and `milestones/v2.0-*` for the archive.

**Codebase:** Next.js 16 App Router + Drizzle/Neon; 248-test vitest suite (node + jsdom); parity/verification CLI harnesses (`verify:live-workflow`, `verify:workflow-engine`); tsc + lint clean.

## Next Milestone Goals

Not yet defined — run `/gsd-new-milestone`. Known candidates carried forward:
- Phase 18.1 generic composed-block step renderer (data model already shipped)
- Deferred items in STATE.md (COLLAB-01 super-admin DM, notification-position-scoping end-to-end app check)
- S3 storage for uploads (currently data-URLs in Postgres), Dave Aredo quota finalization, production deployment hardening

## Requirements

### Validated

**Milestone v1.1 — Super-admin governance & accountability (2026-07-02)**
- [x] REQ-G01 — Checklist authoring locked to super_admin (Phase 11)
- [x] REQ-G02 — Distinct per-project analytics colours (Phase 11)
- [x] REQ-G03 — Issue Log mapped to a project (Phase 11)
- [x] REQ-G04 — super_admin Sign-Off step 11 after Close Out (Phase 12)
- [x] REQ-G05 — Per-step deadlines set by Operations at creation (Phase 12)
- [x] REQ-G06 — In-app notifications + header bell (Phase 13)
- [x] REQ-G07 — `paused` project status (Phase 13)
- [x] REQ-G08 — Pause/flag → notify + pause + resume (Phase 14)
- [x] REQ-G09 — Higher-authority approval to skip a checklist step (Phase 14)
- [x] REQ-G10 — Escalate issues to all super admins + per-project dispute thread (Phase 14)

### Active

(None — v2.0 closed 2026-07-19. Fresh requirements will be defined by `/gsd-new-milestone`.)

**Validated in v1.0 (MVP):** auth + role-gated shells, template-driven checklist engine with photo evidence, processes diagram editor (React Flow + Mermaid), real-time chat, Dave Aredo AI assistant, Resend email flows.

**Validated in v2.0 (see milestones/v2.0-REQUIREMENTS.md for the full WF/CFG/ROLE/PAY/STG traceability):** DB-driven workflow graph with 7 fulfillment kinds (WF-01..06), PIN-gated Workflow Configurator (CFG-01..03), 11-role + data-driven-positions system with exact-position and assignee gates (ROLE-01..07), two payment checkpoints (PAY-01..03), and the full 14-stage front-of-funnel/production-authorization pipeline (STG-01..14; STG-04 cut). Plus unplanned-but-shipped: per-tab independent auth sessions (Phase 20.1), position-scoped step notifications, strictly per-step deadlines, per-checklist escalation, super-admin audit view.

### Out of Scope

- Image upload *into* the Dave Aredo chat — explicitly deferred (v1 text-only)
- Super Admin editing of project/checklist data — admin is read-only on operational data; only edits content (About TRT, Email Formats), curates Processes, and manages users
- Full CRDT/multiplayer conflict resolution on collaborative diagrams — v1 uses last-write-wins per element with live broadcast; Yjs-style CRDT is deferred
- Final billing/quota enforcement values — the ~$20/mo and 20 msg/day figures are placeholders pending a pricing decision; build the limit mechanism configurable, don't hardcode finals

> Note: human-to-human direct messaging, previously "future," is now IN scope as the Real-time chat feature.

## Context

**Wireframe-derived layouts** (handwritten notebook, 6 photos):

- *Factory PM home*: Factory Floor Projects (excel sheet: Project Name | Delivery Timeline | Status toggle), Delivery Project Checklist (Create New → multistep; View List → table), Product Readiness Checklist (Upload File / View Files sorted by Name+Date), Profile (Name/Position/ID Card — Super Admin can edit ID), Processes & Flow Charts, About TRT, Chat Bot ("Dave Aredo").
- *Site PM home* (images 5 & 6): Confirmation, Delivery Site Readiness Checklist, Issue Log (Excel/changeable links), Sorting Checklist, Email Formats (Super Admin edit only / PM view only), Change Request Checklist, Close Out Process Checklist, Processes & Flow Charts, Profile, About TRT, Chat Bot. "Confirmation" has Create New / View File. Close Out & About TRT follow the same profile-notes pattern; same chat box across the app.
- The "Confirmation/Verification" checklist verifies on-site reality matches the architect's drawing before/after a factory item is dispatched. A rename of "Confirmation" → "Verification" was discussed (confirm platform-wide).

**Open items needing source PDFs** (do not invent line items):
- Exact line items for Delivery Project Checklist, Product Readiness Checklist, Project Site Assessment, and the Site PM checklists are not in the sketches — paper originals/soft copies pending.
- Whether checklist items are binary (Yes/No) or tri-state (Yes/No/N/A).

**Prior art framing:** Processes & Flow Charts effectively serves as onboarding docs — new hires read it instead of asking someone. Each process entry should answer: timeline, who's responsible, required documents, approval criteria, expected duration.

## Constraints

- **Tech stack**: Next.js 16.2.9 + React 19.2.4, App Router, Tailwind v4, TypeScript — already scaffolded. Next 16 has breaking changes vs. older versions; consult `node_modules/next/dist/docs/` before writing route/server code (per repo AGENTS.md).
- **Database**: Postgres on Neon + Drizzle ORM. Connection string in `.env.local` as `DATABASE_URL` (gitignored).
- **Auth**: NextAuth / Auth.js v5 (`next-auth@5.0.0-beta.31`) — Credentials provider, JWT session strategy, custom `role` claim (`factory_pm`, `site_pm`, `super_admin`) via jwt/session callbacks; `@auth/drizzle-adapter` + `bcryptjs` password hashing; gate routes/nav. (Neon Auth dropped.)
- **File storage**: S3-compatible bucket for checklist photos & ID cards.
- **AI**: Base `@anthropic-ai/sdk` (0.105.0), env-configurable to swap local Ollama (dev) ↔ Anthropic Claude (prod) via `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` / `LLM_MODEL_NAME`. Server-side endpoint, context scoped to caller's role. Fullscreen chat expand animated with GSAP (`gsap` 3.15.0). (Claude Agent SDK dropped in favor of env-swap simplicity.)
- **Email**: Resend (`resend` 6.14.0) for transactional email (verification, password reset, notifications).
- **Real-time**: Supabase Realtime (`@supabase/supabase-js` 2.108.2) used purely as a broadcast/presence transport for chat and collaborative diagram editing. Neon remains the single source of truth; Supabase does not store app data.
- **Diagram editor**: React Flow (`@xyflow/react` 12.11.0) node canvas + Mermaid (`mermaid` 11.15.0) for text→flowchart rendering. Diagram state persisted as JSON in Neon with autosave.
- **Suggested schema entities**: users, projects, checklist_definitions, checklist_template_items, checklist_responses, attachments, processes, process_diagrams, conversations, messages, chat_messages (AI history), ai_usage.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-serve signup with role picker (Factory/Site PM); Super Admin seeded separately | User override of original "admin creates all logins" — PMs shouldn't wait on admin | — Pending |
| Super Admin is read-only on operational data | Reconciles spec ambiguity; admin governs content + users, not project entries | — Pending |
| ~~Neon Auth for auth/roles~~ → NextAuth/Auth.js v5 (JWT + roles) | Neon Auth beta API unverifiable + project not MCP-accessible; user chose NextAuth ("very good") for basic JWT+roles | ✓ Switched 2026-06-19 |
| Dave Aredo on base `@anthropic-ai/sdk` with env-swap (Ollama dev / Claude prod) + GSAP fullscreen | User wants local Ollama dev → Claude prod via `ANTHROPIC_BASE_URL`; simpler than Agent SDK | — Pending |
| Multistep wizard pattern for all checklists | Stated UX requirement; avoids long forms on mobile | — Pending |
| Rate-limit mechanism configurable, no hardcoded finals | Pricing/quota not finalized (~$20/mo, ~20 msg/day are placeholders) | — Pending |
| Treat as greenfield despite CNA scaffold | Only Create-Next-App boilerplate exists; nothing to map | — Pending |
| Supabase Realtime as transport only; Neon stays source of truth | User chose Supabase Realtime for chat; avoid dual source of truth — Supabase broadcasts, Neon persists | — Pending |
| Processes & Flow Charts becomes a collaborative diagram editor (React Flow + Mermaid), shared editing, autosave | User added editable Excalidraw-like canvas with DB save + autosave; all users edit | — Pending |
| Human-to-human real-time chat added to v1 (was deferred) | User requested dashboard chat over WebSockets | — Pending |
| Resend for transactional email | User-specified; covers verification/reset + notifications | — Pending |
| v1 collaborative editing = last-write-wins per element (not CRDT) | Pragmatic; full multiplayer CRDT is disproportionate for v1 | — Pending |
| v1.1: checklist authoring locked to super_admin only | User: only super admins may create/edit checklists; PMs & Operations lose authoring (keep fill/submit) | ✓ Decided 2026-07-02 |
| v1.1: super-admin alerts are in-app only (no email) | User chose in-app panel + header bell + polling; avoids Resend dependency for escalations | ✓ Decided 2026-07-02 |
| v1.1: final Sign-Off step (11) performed by super_admin | User: higher authority closes the project after Close Out | ✓ Decided 2026-07-02 |
| v1.1: per-step deadlines set by Operations at creation | Accountability per step, not just one project deadline | ✓ Decided 2026-07-02 |
| v1.1: multi-department extensibility (Design/Production) deferred | User explicitly skipped #7 for now | ✓ Deferred 2026-07-02 |
| v2.0: workflow steps become data (graph tables), not code | Self-service process changes without deploys | ✓ Shipped 2026-07-09..19; parity-verified |
| v2.0: super-admin titles are `users.position` values, never new role enum values | Keeps role gate small; exact-position step gates narrow sensitive steps | ✓ Good — powered STG-10..12 scoping |
| v2.0: positions become a rename-safe data table (not a Postgres enum) | Boss renamed titles mid-milestone; enum churn was untenable | ✓ Good (260714-bpq) |
| v2.0: per-tab auth via sessionStorage tokens + pre-paint restore bounce, cookie as fallback | "Two tabs, two users" is a hard requirement; cookies are browser-wide | ✓ Shipped, user-confirmed 2026-07-19 — pre-paint inline script was the key (survives hydration-breaking browser extensions) |
| v2.0: step notifications scoped to the responsible position; all-super-admin step broadcast removed | User: spam made oversight useless | ✓ Shipped 2026-07-19 |
| v2.0: deadlines are strictly per-step (no project-wide fallback) | Actors should only ever see their own step's deadline | ✓ Shipped 2026-07-19 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

---
*Last updated: 2026-07-19 after v2.0 milestone*
