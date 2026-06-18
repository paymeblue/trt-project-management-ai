# Roadmap: TRT Arredo Project Management Platform

## Overview

The build goes foundation-first: lock down auth, the role model, and a data-driven (template) schema with server-side authorization before any feature exists, because RBAC mistakes here are contagious. Next comes the shared shell and the S3 upload pattern (proven on a low-stakes Profile ID-card), then a single generic checklist wizard engine that all nine checklist types configure rather than re-implement. Role-specific flows (Factory PM, then Site PM) and the read-only Super Admin oversight follow once the engine and data exist. Dave Aredo (the AI assistant) is built last among features — it is isolated and carries the heaviest security surface. A final phase handles production hardening and the items blocked on the source PDFs.

## Phases

- [ ] **Phase 1: Foundation — Auth, Roles, Schema, DAL** - Self-serve signup, role gating, template-driven schema, server-side authorization
- [ ] **Phase 2: App Shell, Profile, Content & S3 Uploads** - Role-based nav, shared pages, presigned upload pattern proven on Profile ID card
- [ ] **Phase 3: Checklist Engine — Generic Wizard** - One multistep wizard reading template items, with photo attach, draft save, and list views
- [ ] **Phase 4: Factory PM Flows** - Factory Floor Projects table, Delivery Project Checklist, Product Readiness uploads
- [ ] **Phase 5: Site PM Flows** - New Project + the Confirmation/Verification, Delivery Site Readiness, Sorting, Change Request, Close Out, Issue Log, Email Formats flows
- [ ] **Phase 6: Super Admin** - Read-only aggregate oversight, user management, content management
- [ ] **Phase 7: Dave Aredo (AI Assistant)** - Role-scoped streaming chat grounded in process docs, server-side rate limiting, persisted history
- [ ] **Phase 8: Production Hardening & PDF-Blocked Items** - Mobile/field testing, error boundaries, finalize Issue Log format, deploy

## Phase Details

### Phase 1: Foundation — Auth, Roles, Schema, DAL
**Goal**: A person can sign up, pick a PM role, and log in; the database schema and server-side authorization layer exist and are enforced from day one.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, CHK-01
**Success Criteria** (what must be TRUE):
  1. A new user can sign up, select Factory PM or Site PM, log in, and stay logged in across refresh
  2. The public signup flow cannot produce a Super Admin; a seed script provisions Super Admin
  3. A logged-in user only sees nav/routes for their role and cannot reach another role's routes
  4. Every mutation is authorized server-side (session + ownership) via a Data Access Layer, not UI visibility
  5. The checklist schema is template-driven (definition → template items → responses) with no hardcoded line items
**Plans**: TBD

Plans:
- [ ] 01-01: Drizzle + Neon connection, env wiring, migration tooling, three-tier checklist schema
- [ ] 01-02: `@neondatabase/auth` integration, role claims, `proxy.ts`, route-group gating
- [ ] 01-03: `lib/dal.ts` (server-only) verifySession/requireRole/owner checks, Super Admin seed script

### Phase 2: App Shell, Profile, Content & S3 Uploads
**Goal**: All roles share a working app shell with Profile, Processes & Flow Charts, and About TRT, and the presigned S3 upload pattern is proven end-to-end on the Profile ID card.
**Depends on**: Phase 1
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, FILE-01, FILE-02
**Success Criteria** (what must be TRUE):
  1. After login each role lands on a role-appropriate Home/Dashboard
  2. A user can view their Profile and (where permitted) upload a date-stamped ID card that lands in S3 via presigned URL
  3. PMs can read Processes & Flow Charts and About TRT (read-only)
  4. Uploaded files store only the object key and are served via on-demand URLs to authorized users
**Plans**: TBD

Plans:
- [ ] 02-01: App shell, role-based nav, role dashboards, Profile page
- [ ] 02-02: S3 presigned upload utility + attachments model; ID-card upload (Super-Admin-edit gating)
- [ ] 02-03: Processes & Flow Charts and About TRT read views

### Phase 3: Checklist Engine — Generic Wizard
**Goal**: A reusable multistep wizard renders any checklist from its template items, supports tri-state radio answers and per-item photos, saves drafts per step, and lists submitted entries.
**Depends on**: Phase 2
**Requirements**: CHK-02, CHK-03, CHK-04, CHK-05, CHK-06, CHK-07, CHK-08
**Success Criteria** (what must be TRUE):
  1. A checklist defined purely as data renders as a multistep wizard with radio (Yes/No/N/A) items
  2. A user can attach a photo to an entry and progress is saved per step (no loss mid-wizard)
  3. A user can view a sortable (Name/Date) list of entries and edit only ones they created
**Plans**: TBD

Plans:
- [ ] 03-01: `WizardShell` (step navigation, draft persistence, tri-state items)
- [ ] 03-02: Per-item photo attachment on entries (reuses Phase 2 upload)
- [ ] 03-03: Entry list/table views (sortable, creator-only edit)

### Phase 4: Factory PM Flows
**Goal**: Factory PM can manage Factory Floor Projects, complete the Delivery Project Checklist, and manage Product Readiness files.
**Depends on**: Phase 3
**Requirements**: FAC-01, FAC-02, FAC-03, FAC-04, FAC-05, FAC-06
**Success Criteria** (what must be TRUE):
  1. Factory PM sees Factory Floor Projects in a table and can toggle Delivered/Not Delivered
  2. Factory PM can create a Delivery Project Checklist via the wizard and view the list of entries
  3. Factory PM can upload and view Product Readiness files sorted by Name/Date
**Plans**: TBD

Plans:
- [ ] 04-01: Factory Floor Projects table + status toggle
- [ ] 04-02: Delivery Project Checklist (wizard config) + Product Readiness file list

### Phase 5: Site PM Flows
**Goal**: Site PM can create projects and complete the full set of site checklists, view previous projects, and read Email Formats.
**Depends on**: Phase 3
**Requirements**: SITE-01, SITE-02, SITE-03, SITE-04, SITE-05, SITE-06, SITE-07, SITE-08, SITE-09
**Success Criteria** (what must be TRUE):
  1. Site PM can create a New Project (PM auto-filled) and view previous projects
  2. Site PM can complete Confirmation/Verification, Delivery Site Readiness, Sorting, Change Request, and Close Out checklists via the wizard
  3. Site PM can use the Issue Log and read Email Formats (view-only)
**Plans**: TBD

Plans:
- [ ] 05-01: New Project + previous projects
- [ ] 05-02: Site checklist configs (Confirmation/Verification, Delivery Site Readiness, Sorting, Change Request, Close Out)
- [ ] 05-03: Issue Log (tabular) + Email Formats read view

### Phase 6: Super Admin
**Goal**: Super Admin gets a read-only window into all operational data and can manage users and editable content.
**Depends on**: Phases 4 and 5 (data must exist)
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Super Admin sees an aggregated read-only overview of all projects, checklists, verifications, and photos
  2. Super Admin cannot edit operational project/checklist data
  3. Super Admin can create/invite users with a role, and edit About TRT, Processes & Flow Charts, and Email Formats
**Plans**: TBD

Plans:
- [ ] 06-01: Read-only aggregate overview across roles
- [ ] 06-02: User management (create/invite, assign role)
- [ ] 06-03: Content management (About TRT, Processes, Email Formats editors)

### Phase 7: Dave Aredo (AI Assistant)
**Goal**: A role-scoped, process-grounded AI chat assistant is available on every screen, with server-side rate limiting and persisted history.
**Depends on**: Phase 6 (Processes content store) and Phase 1 (auth)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, SHELL-06
**Success Criteria** (what must be TRUE):
  1. A floating button on every screen opens a full-screen streaming chat
  2. Responses are grounded in Processes content and scoped to the caller's role (no cross-role leakage)
  3. PM usage is capped by a configurable server-side daily limit (Super Admin unlimited); history persists per user
  4. User content cannot override the system prompt (prompt-injection test passes)
**Plans**: TBD

Plans:
- [ ] 07-01: Claude Agent SDK Route Handler (streaming), role-scoped context grounding
- [ ] 07-02: `ai_usage` server-side rate limiting + persisted chat history
- [ ] 07-03: Floating chat overlay UI + prompt-injection hardening/test

### Phase 8: Production Hardening & PDF-Blocked Items
**Goal**: The app is field-ready and the items that were blocked on source PDFs are finalized.
**Depends on**: Phase 7
**Requirements**: (none new — covers cross-cutting quality and deferred content)
**Success Criteria** (what must be TRUE):
  1. Core flows tested on mobile/poor-connection; large photo uploads handled gracefully
  2. Error boundaries and not-found/forbidden states exist across the app
  3. Final checklist line items and Issue Log format are loaded from the delivered PDFs as data
  4. Production deployment + secret handling verified
**Plans**: TBD

Plans:
- [ ] 08-01: Mobile/field testing + error boundaries
- [ ] 08-02: Load finalized checklist/Issue Log content from PDFs; deployment hardening

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Auth, Roles, Schema, DAL | 0/3 | Not started | - |
| 2. App Shell, Profile, Content & S3 | 0/3 | Not started | - |
| 3. Checklist Engine — Generic Wizard | 0/3 | Not started | - |
| 4. Factory PM Flows | 0/2 | Not started | - |
| 5. Site PM Flows | 0/3 | Not started | - |
| 6. Super Admin | 0/3 | Not started | - |
| 7. Dave Aredo (AI Assistant) | 0/3 | Not started | - |
| 8. Production Hardening & PDF-Blocked Items | 0/2 | Not started | - |
