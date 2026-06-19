# TRT Arredo Project Management Platform

## What This Is

A digital platform that replaces the paper checklists TRT Arredo currently uses on the factory floor and on installation sites. Three roles (Factory PM, Site PM, Super Admin) share one app shell, each seeing only their own flows, plus an AI assistant ("Dave Aredo") that answers project-management questions grounded in the company's internal process docs. It is the single system of record for delivery checklists, site assessments, verifications, and uploaded photo/file evidence.

## Core Value

A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with each role seeing only what's theirs and the Super Admin seeing everything read-only.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Auth & Roles**
- [ ] Users can self-serve sign up and select their role (Factory PM or Site PM) without waiting for admin approval
- [ ] Users can log in / log out; sessions persist across reloads
- [ ] Super Admin accounts are seeded/provisioned separately (not via public role picker)
- [ ] Nav and routes are gated by role — a user never sees another role's tabs (CRM-style)

**Shared shell (all roles)**
- [ ] Home/Dashboard whose content differs by role (includes embedded real-time chat)
- [ ] Profile (Name, Position, ID Card image upload — date-stamped; ID card editable by Super Admin only)
- [ ] Processes & Flow Charts — now a collaborative diagram editor (React Flow canvas + Mermaid flowchart rendering), DB-persisted with autosave; all users can edit shared diagrams
- [ ] About TRT — company info/policy/management/links, editable by Super Admin only
- [ ] Dave Aredo floating button on every screen → full-screen chat overlay

**Email (Resend)**
- [ ] Transactional email via Resend powering email verification and password reset, plus app notifications

**Real-time chat (Supabase Realtime + Neon)**
- [ ] Users can chat with each other in real time from the dashboard (simple chat interface)
- [ ] Messages persist in Neon (source of truth) and load on reconnect; Supabase Realtime is the live transport

**Processes diagram editor (React Flow + Mermaid)**
- [ ] Node-based editable canvas (React Flow), Excalidraw-like; create flowcharts from Mermaid text too
- [ ] DB-persisted with autosave (no loss on refresh); shared collaborative editing with live updates (last-write-wins per element for v1)

**Factory PM home**
- [ ] Factory Floor Projects — spreadsheet view: Project Name, Delivery Timeline (date), Status (Delivered/Not Delivered toggle)
- [ ] Delivery Project Checklist — Create New (multistep wizard) + View List (table of entries)
- [ ] Product Readiness Checklist — Upload File + View Files (list sortable by Name/Date)

**Site PM home** (from wireframes — see Context)
- [ ] Confirmation (Confirmation / Delivery Site Readiness & all checklists) — Create New + View File
- [ ] Delivery Site Readiness Checklist ("Out of state processes / Planning checklist")
- [ ] Issue Log — Excel-style/tabular interface or changeable links
- [ ] Sorting Checklist
- [ ] Email Formats — Super Admin edit only, PMs view only
- [ ] Change Request Checklist
- [ ] Close Out Process Checklist
- [ ] New Project — Project Name, Location, Project Manager (auto-filled from logged-in user)
- [ ] View Previous Projects

**Super Admin home**
- [ ] Read-only aggregated overview of all Factory PM + Site PM projects, checklists, verifications, and uploaded photos
- [ ] User Management — create/invite accounts, assign role
- [ ] Content Management — edit About TRT and Processes & Flow Charts (and Email Formats)

**Forms / UX**
- [ ] All checklists/assessments are multistep wizards (not single long forms)
- [ ] Checklist items use radio buttons (binary vs. third "N/A" state TBD per PDF)
- [ ] Photo upload attachable to checklist/verification entries
- [ ] File lists sortable by Name and Date

**Dave Aredo (AI)**
- [ ] Server-side chat endpoint on the Claude Agent SDK, context scoped to caller's role/permissions
- [ ] Grounded in Processes & Flow Charts content
- [ ] Per-user persisted chat history
- [ ] Rate-limited for PMs (directional: ~20 msg/day), unlimited for Super Admin
- [ ] v1 text-only

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
- **Auth**: Neon Auth (`@neondatabase/auth`) — role claims for `factory_pm`, `site_pm`, `super_admin`, gating both routes and nav.
- **File storage**: S3-compatible bucket for checklist photos & ID cards.
- **AI**: Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.181), server-side endpoint, context injection scoped to caller's role/permissions.
- **Email**: Resend (`resend` 6.14.0) for transactional email (verification, password reset, notifications).
- **Real-time**: Supabase Realtime (`@supabase/supabase-js` 2.108.2) used purely as a broadcast/presence transport for chat and collaborative diagram editing. Neon remains the single source of truth; Supabase does not store app data.
- **Diagram editor**: React Flow (`@xyflow/react` 12.11.0) node canvas + Mermaid (`mermaid` 11.15.0) for text→flowchart rendering. Diagram state persisted as JSON in Neon with autosave.
- **Suggested schema entities**: users, projects, checklist_definitions, checklist_template_items, checklist_responses, attachments, processes, process_diagrams, conversations, messages, chat_messages (AI history), ai_usage.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-serve signup with role picker (Factory/Site PM); Super Admin seeded separately | User override of original "admin creates all logins" — PMs shouldn't wait on admin | — Pending |
| Super Admin is read-only on operational data | Reconciles spec ambiguity; admin governs content + users, not project entries | — Pending |
| Neon Auth for auth/roles | User-specified (`@neondatabase/auth`) | — Pending |
| Multistep wizard pattern for all checklists | Stated UX requirement; avoids long forms on mobile | — Pending |
| Rate-limit mechanism configurable, no hardcoded finals | Pricing/quota not finalized (~$20/mo, ~20 msg/day are placeholders) | — Pending |
| Treat as greenfield despite CNA scaffold | Only Create-Next-App boilerplate exists; nothing to map | — Pending |
| Supabase Realtime as transport only; Neon stays source of truth | User chose Supabase Realtime for chat; avoid dual source of truth — Supabase broadcasts, Neon persists | — Pending |
| Processes & Flow Charts becomes a collaborative diagram editor (React Flow + Mermaid), shared editing, autosave | User added editable Excalidraw-like canvas with DB save + autosave; all users edit | — Pending |
| Human-to-human real-time chat added to v1 (was deferred) | User requested dashboard chat over WebSockets | — Pending |
| Resend for transactional email | User-specified; covers verification/reset + notifications | — Pending |
| v1 collaborative editing = last-write-wins per element (not CRDT) | Pragmatic; full multiplayer CRDT is disproportionate for v1 | — Pending |

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
*Last updated: 2026-06-18 after initialization*
