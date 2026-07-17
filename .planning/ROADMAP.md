# Roadmap: TRT Arredo Project Management Platform

## Overview

The build goes foundation-first: lock down auth, the role model, transactional email, and a complete data-driven schema with server-side authorization before any feature exists, because RBAC mistakes here are contagious. The schema is laid in full up front (including chat and diagram tables) so later features don't churn migrations. Next comes the shared shell and the S3 upload pattern, then a single generic checklist wizard engine that all nine checklist types configure. Role-specific flows (Factory PM, then Site PM) and read-only Super Admin oversight follow. Two collaboration features come next — a real-time collaborative Processes diagram editor (React Flow + Mermaid) and dashboard chat — both powered by Supabase Realtime as a pure transport over Neon-persisted data. Dave Aredo (the AI assistant) is built last among features. A final phase handles production hardening and the items blocked on source PDFs.

Milestone v1.1 (phases 11-15) added super-admin governance, accountability, and multi-department extensibility on top of the shipped v1.0 base.

Milestone v2.0 (phases 16-22) replaces the hardcoded 11-step `WORKFLOW_STEPS` array with a DB-driven, super-admin-configurable workflow graph, then uses that graph to insert the full front-of-funnel pipeline (Customer Care intake through production authorization) ahead of and interleaved with the existing Confirmation→Sign Off tail, which ships byte-for-byte unchanged. The build goes engine-first (schema + graph capabilities), then the highest-risk step — migrating the existing tail onto the new engine with zero behavior change — gets its own tightly-scoped phase before any new capability is layered on. Configurator UI, new roles, and payment gating come next as prerequisites, and the new stage content is seeded last, split into a front-of-funnel phase (pre-Confirmation) and a production-authorization insert (interleaved into the existing tail).

## Phases

- [x] **Phase 1: Foundation — Auth, Roles, Email, Schema, DAL** - Self-serve signup, role gating, Resend email, full template-driven schema, server-side authorization
- [ ] **Phase 2: App Shell, Profile, Content & S3 Uploads** - Role-based nav, shared pages, presigned upload pattern proven on Profile ID card
- [ ] **Phase 3: Checklist Engine — Generic Wizard** - One multistep wizard reading template items, with photo attach, draft save, and list views
- [ ] **Phase 4: Factory PM Flows** - Factory Floor Projects table, Delivery Project Checklist, Product Readiness uploads
- [ ] **Phase 5: Site PM Flows** - New Project + the Confirmation/Verification, Delivery Site Readiness, Sorting, Change Request, Close Out, Issue Log, Email Formats flows
- [ ] **Phase 6: Super Admin** - Read-only aggregate oversight, user management, content management
- [ ] **Phase 7: Processes Diagram Editor** - Collaborative React Flow + Mermaid flowchart editor with autosave and live updates (Supabase Realtime)
- [ ] **Phase 8: Real-time Chat** - Dashboard user-to-user chat, Supabase Realtime transport over Neon-persisted messages
- [ ] **Phase 9: Dave Aredo (AI Assistant)** - Role-scoped streaming chat grounded in process docs, server-side rate limiting, persisted history
- [ ] **Phase 10: Production Hardening & PDF-Blocked Items** - Mobile/field testing, error boundaries, finalize Issue Log format, deploy

### Milestone v1.1 — Super-admin governance & accountability
- [x] **Phase 11: Permissions & Quick Wins** - Lock checklist authoring to super_admin (REQ-G01), distinct analytics color per project (REQ-G02), map Issue Log to a project (REQ-G03)
- [x] **Phase 12: Workflow Extensions** - New super_admin Sign-Off step 11 after Close Out (REQ-G04) + per-step deadlines set by Operations at creation (REQ-G05)
- [x] **Phase 13: Super-Admin Alerts Foundation** - In-app notifications subsystem + alerts panel/header bell + `paused` project status (REQ-G06, REQ-G07)
- [x] **Phase 14: Escalation Flows** - Pause/flag→notify+pause (REQ-G08), higher-authority approval to advance without a checklist (REQ-G09), escalate-to-all-super-admins + per-project dispute section (REQ-G10)


### Milestone v1.1 (extension)
- [x] **Phase 15: Multi-department extensibility (#7)** - Design & Production as first-class roles with a working shell (nav, dashboards, admin assignment); centralized userRoleLabel/roleDashboard helpers; departments own no workflow steps yet (additive later)

### Milestone v2.0 — Configurable Production Workflow Engine
- [x] **Phase 16: Workflow Engine Core** - DB-backed step graph replaces the hardcoded `WORKFLOW_STEPS` array; new fulfillment kinds (yes/no+upload, approval, assignment), optional/skip logic, and parallel/join branching all representable (WF-01, WF-02, WF-03, WF-04, WF-05) (completed 2026-07-09)
- [x] **Phase 17: Confirmation → Sign Off Migration** - The existing 10-step tail (Confirmation through Sign Off) cut over onto the new engine with explicit zero-regression verification (WF-06) (completed 2026-07-09)
- [x] **Phase 18: Workflow Configurator** - Super-admin-only, separately PIN-gated screen to add/remove/reorder/edit steps in the live graph (CFG-01, CFG-02, CFG-03) (completed 2026-07-09)
- [ ] **Phase 18.1: Composable Fulfillment Kinds** (INSERTED) - Super Admin composes a step's fulfillment from building-block primitives (text/upload, yes/no, checklist ref, assignment) instead of a fixed enum
- [x] **Phase 19: New Roles & Assignment** - `ops_factory`/`factory_manager`/`architect` roles with dashboards (`customer_care` already shipped); `users.position` becomes a DB-enforced enum with an optional `requiredPosition` step gate; self-service position entry post-signup; assignment steps can target a multi-role pool (ROLE-01..07) (completed 2026-07-11; ROLE-02 partial — see Phase Details)
- [ ] **Phase 20: Payment & Timeline Gating** - `paid`/`unpaid` toggle + per-step deadlines — PAY-01/PAY-03 already shipped ad hoc, PAY-02 partial pending Phase 19 (PAY-01, PAY-02, PAY-03)
- [ ] **Phase 21: Front-of-Funnel Stages — Designer Assignment Through Design Approval** - Two distinct designer-assignment moments, Kickoff/Design Meeting/Brief Taking, Design Stage — arriving at the existing Confirmation step unchanged (Project Intent/STG-01 already shipped ad hoc) (STG-02..07)
- [ ] **Phase 22: Production-Authorization Insert — Site Confirmation Assignment Through Quality Control** - Site PM confirmation assignment (before Confirmation), correction, internal approval, production authorization, and QC inserted ahead of the existing Materials/Accessories Readiness step (STG-08..14)

## Phase Details

### Phase 1: Foundation — Auth, Roles, Email, Schema, DAL
**Goal**: A person can sign up, pick a PM role, verify by email, and log in; the full database schema, transactional email, and server-side authorization layer exist and are enforced from day one.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, CHK-01, EMAIL-01, EMAIL-02
**Success Criteria** (what must be TRUE):
  1. A new user can sign up, select Factory PM or Site PM, verify via a Resend email, log in, and stay logged in across refresh; password reset works by email
  2. The public signup flow cannot produce a Super Admin; a seed script provisions Super Admin
  3. A logged-in user only sees nav/routes for their role and cannot reach another role's routes
  4. Every mutation is authorized server-side (session + ownership) via a Data Access Layer, not UI visibility
  5. The full schema exists and is pushed to Neon — template-driven checklists (definition → template items → responses) plus projects, attachments, processes, process_diagrams, conversations, messages, chat_messages, ai_usage — no hardcoded checklist line items
**Auth stack**: NextAuth/Auth.js v5 (`next-auth@5.0.0-beta.31`) — Credentials provider + JWT session + `role` claim, bcryptjs password hashing, verified against the Drizzle `users` table (Neon Auth dropped, 2026-06-19).
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Drizzle/Neon + Vitest + Resend setup, full schema (NextAuth users shape + chat/diagram/token tables), `drizzle-kit push`, env scaffolding (Wave 0) [COMPLETE 2026-06-19: 17 tables pushed, Vitest 3 pass/9 todo, lint+tsc clean]
- [x] 01-02-PLAN.md — NextAuth v5 auth core: edge-safe auth.config.ts, auth.ts (Credentials + bcrypt), route handler, optimistic proxy.ts, authoritative lib/dal.ts, type augmentation, DAL tests (Wave 1)
- [x] 01-03-PLAN.md — Resend `sendEmail()` utility + verification/reset templates (Wave 1)
- [x] 01-04-PLAN.md — Email verification + password-reset flows: hashed single-use tokens, (auth) pages, new-password form that updates users.hashedPassword (Wave 2)
- [x] 01-05-PLAN.md — Auth wiring/RBAC: signup (whitelist + bcrypt + verify email)/signin/signout actions, super_admin seed, role route groups + dashboard stubs, auth action tests (Wave 3)

### Phase 2: App Shell, Profile, Content & S3 Uploads
**Goal**: All roles share a working app shell with Profile, the Processes & Flow Charts entry point, and About TRT, and the presigned S3 upload pattern is proven end-to-end on the Profile ID card.
**Depends on**: Phase 1
**Requirements**: SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, FILE-01, FILE-02
**Success Criteria** (what must be TRUE):
  1. After login each role lands on a role-appropriate Home/Dashboard
  2. A user can view their Profile and (where permitted) upload a date-stamped ID card that lands in S3 via presigned URL
  3. PMs can reach the Processes & Flow Charts area and read About TRT
  4. Uploaded files store only the object key and are served via on-demand URLs to authorized users
**Plans**: TBD

Plans:
- [ ] 02-01: App shell, role-based nav, role dashboards, Profile page
- [ ] 02-02: S3 presigned upload utility + attachments model; ID-card upload (Super-Admin-edit gating)
- [ ] 02-03: Processes nav entry + About TRT read view

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
  3. Super Admin can create/invite users with a role, edit About TRT and Email Formats, and curate the official Processes diagrams
**Plans**: TBD

Plans:
- [ ] 06-01: Read-only aggregate overview across roles
- [ ] 06-02: User management (create/invite, assign role)
- [ ] 06-03: Content management (About TRT, Email Formats, Processes curation)

### Phase 7: Processes Diagram Editor
**Goal**: All users can create and collaboratively edit flowcharts on a node-based canvas with Mermaid support, autosaved to Neon and live-synced via Supabase Realtime.
**Depends on**: Phase 2 (shell + Processes entry point); introduces the Supabase Realtime client
**Requirements**: PROC-01, PROC-02, PROC-03, PROC-04, PROC-05
**Success Criteria** (what must be TRUE):
  1. A user can build/edit a flowchart on a React Flow canvas and render one from Mermaid text
  2. Diagram state autosaves to Neon and is fully restored after a refresh (no data loss)
  3. Two users editing the same diagram see each other's changes live (Supabase Realtime, last-write-wins per element)
  4. A user can list and reopen existing diagrams
**Plans**: TBD

Plans:
- [ ] 07-01: Supabase Realtime client setup; React Flow canvas + diagram persistence (autosave to Neon)
- [ ] 07-02: Mermaid text→flowchart rendering + diagram list/reopen
- [ ] 07-03: Live collaborative sync (Realtime broadcast/presence, last-write-wins)

### Phase 8: Real-time Chat
**Goal**: Users can chat with each other in real time from the dashboard, with messages persisted in Neon and delivered live via Supabase Realtime.
**Depends on**: Phase 2 (shell/dashboard); reuses the Supabase Realtime client from Phase 7
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, SHELL-07
**Success Criteria** (what must be TRUE):
  1. A user can open a conversation with another user from the dashboard
  2. Messages send and arrive in real time and persist in Neon (reload on refresh/reconnect)
  3. The chat interface is embedded in the dashboard
**Plans**: TBD

Plans:
- [ ] 08-01: Conversations/messages persistence + send/list (Neon, DAL-authorized)
- [ ] 08-02: Supabase Realtime delivery + presence
- [ ] 08-03: Dashboard-embedded chat UI

### Phase 9: Dave Aredo (AI Assistant)
**Goal**: A role-scoped, process-grounded AI chat assistant is available on every screen, with server-side rate limiting and persisted history.
**Depends on**: Phase 6 (Processes content) and Phase 1 (auth)
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, SHELL-06
**Success Criteria** (what must be TRUE):
  1. A floating button on every screen opens a full-screen streaming chat
  2. Responses are grounded in Processes content and scoped to the caller's role (no cross-role leakage)
  3. PM usage is capped by a configurable server-side daily limit (Super Admin unlimited); history persists per user
  4. User content cannot override the system prompt (prompt-injection test passes)
**Plans**: TBD

Plans:
- [ ] 09-01: Claude Agent SDK Route Handler (streaming), role-scoped context grounding
- [ ] 09-02: `ai_usage` server-side rate limiting + persisted chat history
- [ ] 09-03: Floating chat overlay UI + prompt-injection hardening/test

### Phase 10: Production Hardening & PDF-Blocked Items
**Goal**: The app is field-ready and the items that were blocked on source PDFs are finalized.
**Depends on**: Phase 9
**Requirements**: (none new — covers cross-cutting quality and deferred content)
**Success Criteria** (what must be TRUE):
  1. Core flows tested on mobile/poor-connection; large photo uploads handled gracefully
  2. Error boundaries and not-found/forbidden states exist across the app
  3. Final checklist line items and Issue Log format are loaded from the delivered PDFs as data
  4. Production deployment + secret handling verified
**Plans**: TBD

Plans:
- [ ] 10-01: Mobile/field testing + error boundaries
- [ ] 10-02: Load finalized checklist/Issue Log content from PDFs; deployment hardening

---

## Phase Details — Milestone v1.1

### Phase 11: Permissions & Quick Wins
**Goal**: Super admins are the sole checklist authors, analytics reads cleanly per project, and every issue is anchored to a project.
**Depends on**: existing app (no v1.1 phase deps) — safe warm-up, no shared subsystem
**Requirements**: REQ-G01, REQ-G02, REQ-G03
**Success Criteria** (what must be TRUE):
  1. Only super_admin can reach/execute checklist create/edit; Operations + both PMs are denied server-side but can still fill/submit
  2. Each project has a distinct, stable color across analytics charts
  3. Issue creation requires a project; Issue Log shows and filters by project; `issues.project_id` is non-null (existing rows handled)
**Plans**: TBD (set at /gsd-plan-phase 11)

Plans:
- [x] 11-01: Lock checklist authoring to super_admin (`canEditChecklist`, editor route/actions, hide entry points)
- [x] 11-02: Per-project color mapping in analytics-chart.tsx
- [x] 11-03: Issue↔project — required projectId, create selector, list filter (+ backfill guard)

### Phase 12: Workflow Extensions
**Goal**: The workflow ends with a super_admin sign-off, and every step carries its own Operations-set deadline for accountability.
**Depends on**: Phase 11 (sequencing only)
**Requirements**: REQ-G04, REQ-G05
**Success Criteria** (what must be TRUE):
  1. Step 11 "Sign Off" (role super_admin) exists after Close Out; project is complete only after it; gate/board/diagram/getMyWork reflect it
  2. `isProjectComplete` boundary updated with migration care for projects currently at step 11
  3. Operations sets a deadline per step at creation; each step shows its own countdown/overdue in board, header switcher, and my-work
**Plans**: TBD (set at /gsd-plan-phase 12)

Plans:
- [x] 12-01: Add Sign-Off step 11 + shift completion boundary (schema/data migration, workflow, gate, diagram, my-work)
- [x] 12-02: Per-step deadlines — schema, new-project form, board/countdown/my-work reads

### Phase 13: Super-Admin Alerts Foundation
**Goal**: A reusable in-app alert channel to super admins exists, and projects can be paused — the base the escalation flows build on.
**Depends on**: (independent of 11/12; before 14)
**Requirements**: REQ-G06, REQ-G07
**Success Criteria** (what must be TRUE):
  1. `notifications` table + `/api/notifications` polled near-real-time; header bell with unread badge + alerts panel (read/mark-read)
  2. Alerts target all super admins and deep-link to the relevant project/step
  3. `projects.status` supports `paused`; board/gate/my-work treat paused projects as not requiring forced action
**Plans**: TBD (set at /gsd-plan-phase 13)

Plans:
- [x] 13-01: Notifications schema + API + polling provider
- [x] 13-02: Header bell + alerts panel UI
- [x] 13-03: `paused` status plumbed through board/gate/my-work

### Phase 14: Escalation Flows
**Goal**: Actors can pause/flag, request checklist-bypass approval, and escalate/dispute — all routed to super admins for action.
**Depends on**: Phase 13 (notifications + paused status), Phase 12 (per-step context helpful)
**Requirements**: REQ-G08, REQ-G09, REQ-G10
**Success Criteria** (what must be TRUE):
  1. Pause/flag with reason notifies all super admins and pauses the project until a super admin resumes it (who/when/why recorded)
  2. A step can be advanced without its checklist only via a super-admin-approved bypass request; approval/denial audited
  3. Issues can be escalated to every super admin; each project has a threaded dispute section visible to participants + all super admins
**Plans**: TBD (set at /gsd-plan-phase 14)

Plans:
- [x] 14-01: Pause/flag → notify + pause + super-admin resolve/resume
- [x] 14-02: Higher-authority bypass request → approve/deny + audit + advance
- [x] 14-03: Escalate issue to all super admins + per-project dispute thread

---

## Phase Details — Milestone v2.0

### Phase 16: Workflow Engine Core
**Goal**: Project workflow state is driven by a database-backed step graph instead of the hardcoded `WORKFLOW_STEPS` array, and the graph natively supports every fulfillment pattern and branching shape the rest of v2.0 will need.
**Depends on**: Phase 15 (existing role/dashboard pattern), nothing else outstanding
**Requirements**: WF-01, WF-02, WF-03, WF-04, WF-05
**Success Criteria** (what must be TRUE):
  1. Step data (order, key, label, responsible role, fulfillment kind, optional flag) lives in DB tables that `lib/workflow.ts` reads from; no step data remains in a literal array
  2. A project's current-step resolution and advancement read the live graph — a step added directly to the data is reflected in gate/board/my-work without a redeploy
  3. Each of the four fulfillment kinds — checklist, yes/no with optional upload, approval (two-party send/receive), and assignment (actor picks a user of a target role) — renders its correct interface and gates advancement correctly on a test graph
  4. An optional step can be skipped (project advances); a required step cannot be skipped (rejected server-side)
  5. Two steps can be modeled as parallel branches feeding one join step; the join only becomes actionable once both branches are complete, regardless of completion order
**Plans**: 5 plans
**Scope note**: Phase 16 builds the DB engine + schema + read/write plumbing and proves all five success criteria against an isolated TEST graph. It keeps the existing synchronous `lib/workflow.ts` API (and its ~20 live callers) working unchanged off `WORKFLOW_STEPS`; flipping live gate/board/my-work callers onto the DB engine with zero-regression verification is Phase 17's job (the isolated highest-risk cutover).
**UI hint**: yes

Plans:
- [x] 16-01-PLAN.md — Schema: fulfillment_kind enum + workflow_step_definitions/edges/states tables + extend project_step_completions; drizzle-kit push [Wave 1]
- [x] 16-02-PLAN.md — Read engine (lib/workflow-graph.ts) + extend lib/workflow.ts types (client-safe) + seed the 11 current steps as the 'live' graph [Wave 2]
- [x] 16-03-PLAN.md — Write engine: completeGraphStep + optional/required skip enforcement + 3 new-kind handlers + gated server actions [Wave 3]
- [x] 16-04-PLAN.md — Test-graph seed (all 4 kinds + optional + parallel/join) + CLI verification harness proving WF-03/04/05 [Wave 4]
- [x] 16-05-PLAN.md — Minimal renderers for the 3 new kinds + /workflow/step route (WF-03 UI at test-graph fidelity) [Wave 4]

### Phase 17: Confirmation → Sign Off Migration
**Goal**: Every existing production step from Confirmation through Sign Off runs on the new engine with zero behavior change for any project, past or future — the single highest-risk cutover in this milestone, verified explicitly.
**Depends on**: Phase 16
**Requirements**: WF-06
**Success Criteria** (what must be TRUE):
  1. Confirmation, Materials/Accessories Readiness, Delivery Readiness, Delivery Project Checklist, Project Check Report, Approval to Commence Installation, Installation Readiness, Sorting, Close Out, and Sign Off all exist in the new graph with the same key, role, checklist slug, and relative order as today
  2. The Delivery Project Checklist + Delivery Readiness → Project Check Report parallel/join relationship is modeled natively in the graph, not inferred from sequential numbering
  3. A project created before the cutover and one created after both progress through Confirmation→Sign Off identically — same role gates, same checklist slugs, same completion boundary
  4. The old hardcoded `WORKFLOW_STEPS` array is retired in favor of the DB graph with no regression anywhere it was previously read from (board, gate, my-work, flow diagram)
**Locked decisions** (derived at planning, no discuss-phase):
  - D-01: `projects.currentStep` stays an integer position pointer interpreted as the live graph's `orderIndex`; the migration mutates NO project's `currentStep`. No schema change (verified: in-flight projects at currentStep 3/5, delivered at 12, all align 1:1 with orderIndex 1..11).
  - D-02: The `WORKFLOW_STEPS` literal is retired from `lib/workflow.ts`; steps are sourced from DB `graph='live'` via `getLiveWorkflowSteps()` (server) / `useWorkflowSteps()` (client). Canonical bootstrap data relocates to `db/workflow-live-steps.ts` (seed-only).
  - D-03: The live graph edges are CORRECTED (Phase 16 seeded them linear) to natively model Delivery Readiness (4) + Delivery Project Checklist (5) → Project Check Report (6); live integer advancement still linearizes by orderIndex, so behavior stays byte-identical.
  - D-04: `advanceProjectStep` + bypass-approval additionally record `stepDefId`/`graph` on completions (additive; integer `currentStep` remains the behavioral source of truth).
**Plans**: 6 plans

Plans:
- [x] 17-01-PLAN.md — getLiveWorkflowSteps() adapter + pure helpers + corrected live edges + parity/join verification (Wave 1)
- [x] 17-02-PLAN.md — Cut over server actions/libs (my-work, advance, bypass, projects, analytics) + stepDefId dual-write (Wave 2)
- [x] 17-03-PLAN.md — Cut over step-gating server pages (checklist, readiness, approvals, timeline) (Wave 2)
- [x] 17-04-PLAN.md — WorkflowStepsProvider + layout wire + flow diagram on the DB (Wave 2)
- [x] 17-05-PLAN.md — Cut over client consumers (board, header switcher, pending gate, new-project form) to useWorkflowSteps() (Wave 3)
- [x] 17-06-PLAN.md — Retire the literal + relocate seed data + tests + before/after human verification (Wave 4)

### Phase 18: Workflow Configurator
**Goal**: The super admin can reshape the live workflow graph — add, remove, reorder, and edit steps — from a dedicated, separately PIN-gated screen, without a code change or redeploy.
**Depends on**: Phase 16, Phase 17
**Requirements**: CFG-01, CFG-02, CFG-03
**Success Criteria** (what must be TRUE):
  1. Opening the Workflow Configurator prompts for a configuration PIN (default `0000`, hint visible) before rendering; a wrong PIN blocks entry
  2. The configurator lists every step in order and supports add, remove, drag-and-drop reorder, and editing label/text/role/upload-requirement/optional flag, all persisting immediately to the live graph
  3. The super admin can change the PIN from inside the configurator; the new PIN is stored hashed, the old PIN stops working, and the hint updates alongside it
**Plans**: 1 (implemented directly, no separate plan-phase/execute-phase round — see commit)
**UI hint**: yes
**Status**: Complete ✓ (2026-07-09) — reorder shipped as up/down buttons (matching the existing checklist-authoring CRUD pattern) rather than drag-and-drop; verified end-to-end (PIN gate, unlock, add/edit/reorder/delete a step) against the real `graph='live'` data via browser automation, with `verify:live-workflow` passing before and after.

### Phase 18.1: Composable Fulfillment Kinds (INSERTED)
**Goal**: Super Admin can compose a step's fulfillment out of building-block primitives (text/upload, yes/no, checklist reference, assignment) inside the Workflow Configurator, instead of being limited to the fixed `fulfillment_kind` Postgres enum.
**Depends on**: Phase 18 (Workflow Configurator)
**Requirements**: TBD (set at /gsd-plan-phase 18.1)
**Success Criteria** (what must be TRUE):
  1. A step can be defined as a composed set of one or more primitive blocks rather than a single fixed `fulfillment_kind` value
  2. The step-completion page renders a generic composed-block form driven by that step's block configuration — no new hardcoded per-kind renderer required for future block combinations
  3. The 12 existing live steps, and any steps added in Phase 21/22, continue to render exactly as before — composed blocks are additive, not a replacement requiring migration of existing steps
  4. Super Admin builds/edits the block composition for a step from the same PIN-gated Workflow Configurator screen
**Plans**: TBD (set at /gsd-plan-phase 18.1)

Plans:
- [ ] TBD (run /gsd-plan-phase 18.1 to break down)

### Phase 19: New Roles & Assignment
**Goal**: The new front-of-funnel roles have working dashboards, and any step can hand a task to one specific person — by title as well as role, and to a pool spanning more than one role where the work requires it.
**Depends on**: Phase 16 (assignment fulfillment kind), Phase 15 (dashboard-shell pattern)
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07
**Locked decisions** (resolved with the user 2026-07-09, closing a real gap: `users.position` (`db/schema.ts:34`) is free text today with zero gating logic anywhere in `lib/workflow.ts`/`lib/workflow-graph.ts` — every step-ownership check filters by `role` only):
  - `users.position` converts from free text to a Postgres enum (DB-enforced) covering known titles: `head_of_operations`, `head_designer` (or `head_of_design`), `chief_production_officer`, plus existing super-admin titles in use (MD, ED, COO, CPO, etc.) — enumerate exact values at plan time from both currently-seeded users and the Phase 21/22 stage list.
  - Step/graph definitions gain an optional `requiredPosition` field (nullable, references the position enum). `null` = today's behavior unchanged (any user with the step's `role` may act). Set = only users whose `role` AND `position` both match may act. The 12 existing live steps must all keep `requiredPosition = null`.
  - `customer_care` remains its own top-level role — not nested under or derived from `super_admin`.
  - Position is NOT collected at account creation (signup or admin-created-user flow); users are created with `role` only. Position is entered by the user themselves afterward via a self-service flow (profile completion / settings) — this UI entry point does not exist yet and is in scope for this phase.
  - **Architect is separated from Designer as its own role-enum value** (resolved 2026-07-09, overturning the earlier draft assumption that `design` covers Head Designer/Designer/Architect via `position` alone) — new `architect` role, with its own dashboard shell following the Phase 15 pattern. Head Designer (`design` role + `requiredPosition = head_designer`) is the one who assigns into either pool.
  - `workflow_step_definitions.targetRole` (currently a single `roleEnum` column, shipped in Phase 16) **changes from one role to a list of allowed roles** — resolved 2026-07-09 to let Stage 3/7's "Assign Designer/Architect" step target a pool spanning both `design` and `architect`, not just one. Backward compatible: existing single-role assignment steps (if any exist yet in live data) just carry a 1-item list. This is a retroactive schema change to already-shipped Phase 16 structure — needs the same careful, additive, idempotent migration discipline as Phase 17's cutover (no orphaned `project_step_completions`), not a drop/recreate.
**Success Criteria** (what must be TRUE):
  1. A user created with role `customer_care`, `ops_factory`, `factory_manager`, or `architect` lands on a role-appropriate dashboard and nav, seeing only their own flows — following the Phase 15 pattern
  2. An assignment-kind step lets its actor pick a user from a target pool spanning one or more roles (e.g., a step targeting `[design, architect]` lets Head Designer pick from either); the pick is recorded against the project/step and the assignee receives a notification
  3. A step with `requiredPosition` set (e.g. `head_of_operations`, `head_designer`) is only actionable by a user matching both `role` and `position` — any other user of the same `role` but wrong/no `position` is rejected server-side
  4. A newly created user is not asked for a position at creation; they can later set their own position from a self-service profile screen, constrained to the position enum's valid values
  5. Super-admin titles (Head of Operations, MD, ED, COO, Chief Production Officer) continue to live in `users.position` with no new role-enum values added for them; permission checks still key off `role = super_admin` (narrowed by `requiredPosition` where a step requires it). Head of Design is a `design`-role position (`head_designer`), not a super-admin title.
**Plans**: 4 plans
**Status**: Complete ✓ (2026-07-11) — all 4 plans executed. ROLE-01, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07 fully verified against real shipped code/live data (19-04, `scripts/verify-role-assignment.ts`). **ROLE-02 is PARTIAL**: pool-membership gating (a `design`/`architect`-role user accepted, an out-of-pool user rejected) is genuinely confirmed on the live `assign_designer_brief` step, but the assignee-notification half is NOT implemented — `assignUser`/`assignUserAction` record the assignment yet never write a notification row for the assignee. Surfaced as an honest finding (not silently marked complete) per this plan's own must_haves truth; see REQUIREMENTS.md's ROLE-02 note for detail. Wiring the notification is deferred — out of 19-04's `files_modified` scope. Separately, `scripts/verify-design-pipeline.ts` (the pre-existing corroborating harness) is now stale against the live graph (`design_meeting` step was removed by later, unrelated ad hoc work outside Phase 19) and fails for that pre-existing reason — not fixed here, logged as a deferred item.

Plans:
- [x] 19-01-PLAN.md — Position free-text → DB-enforced Postgres enum (ROLE-04), the isolated high-risk live migration [Wave 1]
- [x] 19-02-PLAN.md — factory_operations + factory_manager dashboard shells (ROLE-01) [Wave 2]
- [x] 19-03-PLAN.md — Self-service position select + strip position from creation + enum-backed configurator (ROLE-05) [Wave 2]
- [x] 19-04-PLAN.md — Reconcile/verify already-shipped ROLE-02/03/06/07 + finalize phase docs [Wave 3]
**UI hint**: yes

### Phase 20: Payment & Timeline Gating
**Goal**: Every project carries a payment status that gates progress into the design phase, settable by whoever learns of payment first, and per-step deadlines cover the entire expanded workflow.
**Depends on**: Phase 16 (engine to attach gates to), Phase 19 (position gating)
**Requirements**: PAY-01, PAY-02, PAY-03
**Status**: Mostly delivered ad hoc ahead of schedule (commit f72573d, 2026-07-09) — PAY-01 and PAY-03 complete; PAY-02 partial. What's left is narrow, not a full phase's worth of work.
**Success Criteria** (what must be TRUE):
  1. ✓ A new project defaults to `unpaid` — delivered
  2. ~ Either Customer Care or Head of Operations can toggle `unpaid` → `paid` — the toggle exists and works, but is currently gated to any `operations`-or-`super_admin` user via `requireAdmin()`, not narrowed to `requiredPosition = head_of_operations`, and `customer_care` cannot yet trigger it directly. Both remain open, blocked on Phase 19's position-enum/`requiredPosition` work landing first.
  3. While `unpaid`, acting on the designer-assignment or brief-taking steps is rejected server-side; toggling `paid` unblocks it (verify once Phase 21's designer-assignment/brief-taking steps exist to test against — the gate itself doesn't need new code, just needs those steps to check `paymentStatus`)
  4. ✓ Operations can set a per-step deadline for any step in the expanded graph at project creation — delivered (live step 2 already sets deadlines for every remaining step)
**No second invoicing gate**: the earlier-drafted independent invoicing checkpoint after Brief Taking was cut from the finalized 18-stage flow (confirmed 2026-07-09) — one payment gate is sufficient, do not build a second.
**Plans**: TBD (set at /gsd-plan-phase 20) — scope is now just: (a) narrow PAY-02's gate with `requiredPosition`, (b) extend PAY-02 toggle access to `customer_care`, (c) wire criterion 3's check into Phase 21's new steps when they're built.

### Phase 20.1: Per-Tab Independent Auth Sessions (INSERTED)

**Goal:** Replace the single shared cookie-based session (NextAuth/Auth.js v5 JWT, one `authjs.session-token` cookie per browser) with a per-tab token scheme so different users can be signed in concurrently in different tabs of the same non-incognito browser, without breaking server-side session verification (`lib/dal.ts` DAL pattern used by every Server Component/Action/Route Handler). Root cause confirmed via debug session `.planning/debug/auth-single-session-multi-tab.md` (2026-07-17): cookies are inherently one-per-browser-origin, not per-tab — this is a genuine auth-architecture change (token storage/transport mechanism, CSRF posture implications) touching every session read-path in the app, not a quick patch.
**Requirements**: TBD (set at /gsd-plan-phase 20.1)
**Depends on:** Phase 1 (Foundation — Auth, Roles, Email, Schema, DAL)
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 20.1 to break down)

### Phase 21: Front-of-Funnel Stages — Designer Assignment Through Design Approval
**Goal**: A project can be carried by Design through two distinct designer-assignment moments, kickoff/brief/meeting, and client design approval, arriving at the existing Confirmation step in exactly the state it already expects. (Project Intent itself — STG-01 — already shipped ad hoc; this phase covers STG-02 through STG-07.)
**Depends on**: Phase 16, Phase 18, Phase 19, Phase 20
**Requirements**: STG-02, STG-03, STG-04, STG-05, STG-06, STG-07
**Status**: STG-01 (Project Intent) already delivered ad hoc (commit f72573d) as live step 1 — not part of this phase's remaining scope.
**Success Criteria** (what must be TRUE):
  1. Head Designer (`design` role + `requiredPosition = head_designer`) assigns one user from the `design`-or-`architect` pool (STG-02, ROLE-06/ROLE-07) who completes Kickoff Meeting, Design Meeting, and Brief Taking (each yes/no with an optional upload)
  2. Head Designer separately assigns (STG-06, Design Initiation) a person from the same pool — possibly a different one than STG-02's assignee — to begin actual design work. **These are two distinct assignment moments, not one continuous assignment** — this reverses an earlier draft assumption ("same designer throughout, no re-assignment") that the user explicitly overturned when finalizing the 18-stage plan. Also note: Architect is a separate role from Designer (not a `position` within `design`) — resolved 2026-07-09, overturning yet another earlier draft assumption
  3. The STG-06 assignee completes Design Stage: produces the drawing, presents to the client, and marks client approval (yes/no) with an optional upload of the approved drawing
  4. Completing Design Stage hands the project to the existing Confirmation step with no change to Confirmation's own behavior
**No Invoicing stage**: cut from the finalized flow (see Phase 20) — do not seed one.
**Plans**: TBD (set at /gsd-plan-phase 21)
**UI hint**: yes

### Phase 22: Production-Authorization Insert — Site Confirmation Assignment Through Quality Control
**Goal**: Immediately around and after the existing Confirmation step, a project passes through confirmation assignment, correction, internal approval, and production authorization before reaching the existing Materials/Accessories Readiness step exactly as that step already expects.
**Depends on**: Phase 17, Phase 19
**Requirements**: STG-08, STG-09, STG-10, STG-11, STG-12, STG-13, STG-14
**Success Criteria** (what must be TRUE):
  1. Immediately **before** the existing Confirmation step, an operational Super Admin assigns a Site PM by email (STG-08, Site Personnel Confirmation Assignment) — this is a new assignment step, not a duplicate "Confirmation 2"; the existing Confirmation step itself runs unchanged, once, at its current position
  2. Immediately **after** Confirmation, the assigned designer records Confirmation Correction (STG-09, yes/no with an optional upload of the corrected drawing)
  3. An operational Super Admin routes the drawing through Internal Approval (STG-10, Head Designer checks/approves and returns it) and then Send for Production (STG-11), an approval/two-sided-ack step with the CPO (`super_admin` + `requiredPosition = chief_production_officer`)
  4. The CPO completes Project Review & Authorization (STG-12, yes/no) before `ops_factory` completes the Production Process checklist (STG-13: optimization document upload, then cutting/edging/edging-concluded/upholstery-concluded/glass/accessories-sorted, each yes/no)
  5. `factory_manager` completes Quality Control (STG-14: uploads 3 readiness forms — Material, Accessories, Upholstery) immediately before the existing Materials/Accessories Readiness step, which then proceeds completely unchanged
  6. A project walking through all 14 new stages (Phase 21 + this phase) arrives at Materials/Accessories Readiness in exactly the state that step already expects today — no regression to the tail verified in Phase 17
**Plans**: TBD (set at /gsd-plan-phase 22)

## Progress

**Execution Order:**
v1.0 phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
v1.1 phases: 11 → 12 → 13 → 14 (11 and 13 independent; 12 after 11 by sequencing; 14 after 13)
v2.0 phases execute in numeric order: 16 → 17 → 18 → 19 → 20 → 21 → 22 (16 first — engine core; 17 is the isolated, tightly-verified migration; 18-20 are prerequisites for the new stage content; 21 and 22 seed the new stages, front-of-funnel then the production-authorization insert)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Auth, Roles, Email, Schema, DAL | 0/5 | Planned | - |
| 2. App Shell, Profile, Content & S3 | 0/3 | Not started | - |
| 3. Checklist Engine — Generic Wizard | 0/3 | Not started | - |
| 4. Factory PM Flows | 0/2 | Not started | - |
| 5. Site PM Flows | 0/3 | Not started | - |
| 6. Super Admin | 0/3 | Not started | - |
| 7. Processes Diagram Editor | 0/3 | Not started | - |
| 8. Real-time Chat | 0/3 | Not started | - |
| 9. Dave Aredo (AI Assistant) | 0/3 | Not started | - |
| 10. Production Hardening & PDF-Blocked Items | 0/2 | Not started | - |
| **v1.1 — Super-admin governance & accountability** | | | |
| 11. Permissions & Quick Wins | 3/3 | Complete ✓ | 2026-07-02 |
| 12. Workflow Extensions | 2/2 | Complete ✓ | 2026-07-02 |
| 13. Super-Admin Alerts Foundation | 3/3 | Complete ✓ | 2026-07-02 |
| 14. Escalation Flows | 3/3 | Complete ✓ | 2026-07-02 |
| 15. Multi-department extensibility (#7) | -/- | Complete ✓ | 2026-07-09 |
| **v2.0 — Configurable Production Workflow Engine** | | | |
| 16. Workflow Engine Core | 5/5 | Complete   | 2026-07-09 |
| 17. Confirmation → Sign Off Migration | 6/6 | Complete   | 2026-07-09 |
| 18. Workflow Configurator | 1/1 | Complete ✓ | 2026-07-09 |
| 19. New Roles & Assignment | 4/4 | Complete ✓ (ROLE-02 partial, see Phase Details) | 2026-07-11 |
| 20. Payment & Timeline Gating | 0/? | Not started | - |
| 21. Front-of-Funnel Stages — Intake Through Design Approval | 0/? | Not started | - |
| 22. Production-Authorization Insert — Confirmation2 Through Factory Manager QC | 0/? | Not started | - |
