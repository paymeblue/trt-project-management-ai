# Requirements: TRT Arredo Project Management Platform

**Defined:** 2026-06-18
**Core Value:** A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with each role seeing only what's theirs and the Super Admin seeing everything read-only.

## v1 Requirements

### Email (Resend)

- [ ] **EMAIL-01**: Transactional email is sent via Resend, powering email verification (AUTH-02) and password reset (AUTH-03)
- [ ] **EMAIL-02**: A reusable server-side email utility exists for future notifications (e.g., new-message alerts)

### Authentication & Roles

- [ ] **AUTH-01**: User can self-serve sign up with email and password
- [ ] **AUTH-02**: User selects their role (Factory PM or Site PM) at signup without admin approval
- [ ] **AUTH-03**: Public signup cannot create a Super Admin; Super Admin accounts are seeded/provisioned by script
- [ ] **AUTH-04**: User can log in and log out from any page
- [ ] **AUTH-05**: User session persists across browser refresh
- [ ] **AUTH-06**: Nav items and routes are gated by role — a user never sees or can reach another role's flows
- [ ] **AUTH-07**: Every data mutation is authorized server-side (session + ownership), not by UI visibility alone

### Shared Shell

- [ ] **SHELL-01**: After login, user lands on a Home/Dashboard whose content differs by role
- [ ] **SHELL-02**: User can view their Profile (Name, Position, ID Card image)
- [ ] **SHELL-03**: Profile ID Card upload is date-stamped and editable only by Super Admin
- [ ] **SHELL-04**: User can open the Processes & Flow Charts area from the nav (the collaborative diagram editor itself is built in the Processes Diagram Editor phase)
- [ ] **SHELL-05**: User can view About TRT (read-only for PMs)
- [ ] **SHELL-06**: A Dave Aredo floating button is present on every screen and opens a full-screen chat overlay
- [ ] **SHELL-07**: The dashboard embeds the real-time chat interface (built in the Realtime Chat phase)

### Checklist Engine (shared)

- [ ] **CHK-01**: Checklists are defined as data (definition → template items → responses), not hardcoded per type
- [ ] **CHK-02**: Checklists render as a multistep wizard (not a single long form)
- [ ] **CHK-03**: Checklist items use radio buttons; the schema supports a tri-state (Yes/No/N/A) answer
- [ ] **CHK-04**: A user can attach a photo to a checklist entry/item
- [ ] **CHK-05**: Wizard progress is saved per step so an in-progress entry is not lost
- [ ] **CHK-06**: A user can view a list of existing checklist entries
- [ ] **CHK-07**: A user can edit only checklist entries they created
- [ ] **CHK-08**: File/entry lists are sortable by Name and Date

### Factory PM Flows

- [ ] **FAC-01**: Factory PM can view Factory Floor Projects in a spreadsheet-style table (Project Name, Delivery Timeline, Status)
- [ ] **FAC-02**: Factory PM can toggle a project's Status between Delivered and Not Delivered
- [ ] **FAC-03**: Factory PM can create a Delivery Project Checklist via the multistep wizard
- [ ] **FAC-04**: Factory PM can view the list of Delivery Project Checklist entries
- [ ] **FAC-05**: Factory PM can upload a file to the Product Readiness Checklist
- [ ] **FAC-06**: Factory PM can view Product Readiness files sorted by Name/Date

### Site PM Flows

- [ ] **SITE-01**: Site PM can create a New Project (Project Name, Location; Project Manager auto-filled from logged-in user)
- [ ] **SITE-02**: Site PM can view their previous projects
- [ ] **SITE-03**: Site PM can fill out the Confirmation / Verification checklist (Create New + View File)
- [ ] **SITE-04**: Site PM can fill out the Delivery Site Readiness checklist
- [ ] **SITE-05**: Site PM can fill out the Sorting checklist
- [ ] **SITE-06**: Site PM can fill out the Change Request checklist
- [ ] **SITE-07**: Site PM can fill out the Close Out Process checklist
- [ ] **SITE-08**: Site PM can use the Issue Log (tabular entries)
- [ ] **SITE-09**: Site PM can view Email Formats (read-only; Super Admin edits)

### Super Admin

- [ ] **ADMIN-01**: Super Admin sees a read-only aggregated overview of all Factory PM + Site PM projects, checklists, and verifications (including uploaded photos)
- [ ] **ADMIN-02**: Super Admin cannot edit operational project/checklist data
- [ ] **ADMIN-03**: Super Admin can create/invite user accounts and assign role
- [ ] **ADMIN-04**: Super Admin can edit About TRT content
- [ ] **ADMIN-05**: Super Admin can curate/manage the official Processes & Flow Charts diagrams (all users can edit shared diagrams; admin governs the canonical set)
- [ ] **ADMIN-06**: Super Admin can edit Email Formats content

### Dave Aredo (AI Assistant)

- [ ] **AI-01**: User can chat with Dave Aredo via a server-side streaming endpoint (text-only), using `@anthropic-ai/sdk` configured by env (`ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`/`LLM_MODEL_NAME`) so it runs against local Ollama in dev and Anthropic Claude in prod
- [ ] **AI-02**: Assistant responses are grounded in the Processes & Flow Charts content
- [ ] **AI-03**: Assistant context is scoped to the caller's role/permissions (no cross-role data leakage)
- [ ] **AI-04**: Per-user chat history is persisted across multiple chat sessions (user can revisit prior sessions)
- [ ] **AI-05**: PM usage is rate-limited server-side via a configurable daily cap; Super Admin is unlimited
- [ ] **AI-06**: User-submitted content cannot override the system prompt (prompt-injection resistant)
- [ ] **AI-07**: Clicking the floating AI button expands the chat to fullscreen with a GSAP animation; the textarea composer, streaming responses, session list, and history all work smoothly

### Processes Diagram Editor (React Flow + Mermaid)

- [ ] **PROC-01**: User can create and edit a flowchart on a node-based canvas (React Flow / `@xyflow/react`)
- [ ] **PROC-02**: User can render a flowchart from Mermaid text
- [ ] **PROC-03**: Diagram state autosaves to Neon (JSON); reopening after a refresh restores the latest state with no data loss
- [ ] **PROC-04**: Multiple users can edit a shared diagram with live updates via Supabase Realtime (last-write-wins per element for v1)
- [ ] **PROC-05**: User can list and reopen existing diagrams

### Real-time Chat (Supabase Realtime + Neon)

- [ ] **CHAT-01**: User can see available people / conversations and open a chat from the dashboard
- [ ] **CHAT-02**: User can send and receive messages in real time (Supabase Realtime transport)
- [ ] **CHAT-03**: Messages persist in Neon and reload on reconnect / refresh
- [ ] **CHAT-04**: A simple chat interface is embedded in the dashboard

### File Storage

- [ ] **FILE-01**: Photos/files upload directly to S3-compatible storage via presigned URLs (not proxied through the app)
- [ ] **FILE-02**: Stored attachments record the object key; access URLs are generated on demand for authorized users only

## v2 Requirements

(none currently — human-to-human chat, previously deferred, is now v1 via the CHAT requirements)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native offline-first / PWA sync | Disproportionate engineering for an internal v1; web-first is acceptable |
| Image upload into the Dave Aredo chat | Explicitly deferred; v1 AI chat is text-only |
| Super Admin write access to operational data | Audit integrity — admin governs content + users, not entries |
| General-purpose form-builder UI | Checklists are seeded from PDFs as data; no end-user builder needed for v1 |
| Full CRDT/multiplayer diagram conflict resolution | v1 collaborative editing is last-write-wins per element with live broadcast; Yjs CRDT deferred |
| Storing app data in Supabase | Supabase is transport-only (Realtime); Neon is the single source of truth |
| Final AI pricing/quota values hardcoded | ~$20/mo and ~20 msg/day are placeholders pending a pricing decision; cap is configurable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01..07 | Phase 1 | Pending |
| CHK-01 | Phase 1 | Pending |
| EMAIL-01, EMAIL-02 | Phase 1 | Pending |
| SHELL-01..05 | Phase 2 | Pending |
| FILE-01, FILE-02 | Phase 2 | Pending |
| CHK-02..08 | Phase 3 | Pending |
| FAC-01..06 | Phase 4 | Pending |
| SITE-01..09 | Phase 5 | Pending |
| ADMIN-01..06 | Phase 6 | Pending |
| PROC-01..05 | Phase 7 | Pending |
| CHAT-01..04, SHELL-07 | Phase 8 | Pending |
| AI-01..07, SHELL-06 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 63 total
- Mapped to phases: 63
- Unmapped: 0 ✓

---

## v1.1 Requirements — Super-admin governance & accountability

**Defined:** 2026-07-02
**Milestone goal:** Give super admins central control and escalation power, and make every actor accountable via per-step deadlines and a final sign-off.

### Governance & permissions

- [ ] **REQ-G01**: Only super_admin can create or edit checklist definitions and their template items. Operations and both PM roles can still fill and submit checklists but cannot author them. Enforced server-side (not just hidden in UI).
  - *Success:* A factory_pm / site_pm / operations user hits the checklist editor route or edit action → denied; super_admin succeeds. `canEditChecklist` returns true only for super_admin.

### Analytics & issue tracking

- [ ] **REQ-G02**: Each project is rendered with a distinct, stable color everywhere it appears in analytics (ECharts). Same project → same color across chart types and reloads.
  - *Success:* A deterministic project→color mapping; two projects never share a color in the same chart; color is stable across renders.
- [ ] **REQ-G03**: Every issue is tied to a project. Issue Log create requires selecting a project; the Issue Log view can be filtered by project and shows each issue's project.
  - *Success:* `issues.project_id` is required (backfill/guard existing rows); create form has a required project selector; list has a project filter column/control.

### Workflow extensions

- [ ] **REQ-G04**: A final "Sign Off" step (step 11), performed by super_admin, follows Close Out. A project is only fully complete (delivered/closed) after sign-off; the gate, board, flow diagram, and completion boundary all reflect step 11.
  - *Success:* `WORKFLOW_STEPS` includes step 11 (role super_admin); `isProjectComplete` boundary updated (with migration care for existing rows sitting at 11); a super_admin can perform sign-off and only then is the project complete.
- [ ] **REQ-G05**: Operations sets a deadline per workflow step when creating a project (not just one project-wide date). Each step surfaces its own countdown/overdue state in the board, the header switcher, and my-work.
  - *Success:* New per-step deadline storage; create form collects a date per actionable step; board/countdown/my-work read per-step deadlines; overdue shown per step.

### Super-admin alert subsystem (in-app only)

- [ ] **REQ-G06**: A persisted in-app notifications subsystem targets super admins. An alerts panel + header bell shows unread count and recent alerts, polled near-real-time (reuse the existing 4s poll pattern). No email.
  - *Success:* `notifications` table (recipient, type, project ref, payload, read state); `/api/notifications` polled; header bell with unread badge; panel to read/mark-read.
- [ ] **REQ-G07**: Projects support a `paused` status distinct from `not_delivered` and `delivered`. Paused projects are visually marked and their workflow gate is suspended until resumed.
  - *Success:* project status enum gains `paused`; board/gate/my-work handle paused (no forced action while paused).

### Escalation flows (build on the alert subsystem + paused status)

- [ ] **REQ-G08**: Any actor can pause/flag a project (or a specific checklist) when things aren't ready. This notifies all super admins and sets the project to `paused`; it stays paused until a super admin resolves (resumes) it.
  - *Success:* Pause/flag action with reason → notification fan-out to all super admins → project `paused`; super admin resolve/resume action clears it and records who/when/why.
- [ ] **REQ-G09**: An actor can request higher-authority approval to advance a step without completing its checklist. A super admin approves or denies; on approval the step advances and the bypass is recorded (who requested, who approved, reason).
  - *Success:* Bypass-request action on an actionable step → super-admin approval queue (via notifications) → approve advances the step with an audit row; deny leaves it.
- [ ] **REQ-G10**: Issues can be escalated to every super admin, and each project has a threaded dispute section tied to it (visible to participants and all super admins).
  - *Success:* Issue "escalate" fans a notification to all super admins; a per-project dispute thread (messages tied to project) that super admins and participants can read/post.

### v1.1 Out of Scope

| Deferred | Reason |
|----------|--------|
| Multi-department extensibility (future Design/Production roles/departments) (#7) | User explicitly deferred; revisit when those departments are introduced |
| Email delivery of super-admin alerts | User chose in-app only for this milestone |

## v1.1 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-G01, REQ-G02, REQ-G03 | Phase 11 | Complete ✓ |
| REQ-G04, REQ-G05 | Phase 12 | Complete ✓ |
| REQ-G06, REQ-G07 | Phase 13 | Complete ✓ |
| REQ-G08, REQ-G09, REQ-G10 | Phase 14 | Complete ✓ |

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

## v2.0 Requirements

### Workflow engine (core)

- [ ] **WF-01**: Workflow steps are stored in the database (not the hardcoded `WORKFLOW_STEPS` array in `lib/workflow.ts`), each with an order, key, label, responsible role, and fulfillment kind.
  - *Success:* A `workflow_step_definitions` (or equivalent) table is the single source of truth; `lib/workflow.ts` reads from it instead of a literal array.
- [ ] **WF-02**: A project's `currentStep` resolves against the DB-defined workflow graph instead of a fixed array index, so reordering/adding/removing steps doesn't require a code deploy.
  - *Success:* Advancing a project's step reads the live graph; a step inserted via the configurator immediately appears in the gate/board/my-work without a redeploy.
- [ ] **WF-03**: The engine supports fulfillment kinds beyond the current `creation`/`checklist`/`readiness`/`ack`: yes/no with an optional file upload, approval (two-party send/receive), and assignment (actor picks a user of a target role).
  - *Success:* Each new kind renders its correct UI (yes/no toggle + optional upload button; send/receive pair; user picker) and gates advancement correctly.
- [ ] **WF-04**: A step can be marked optional by the super admin; an optional step can be skipped without blocking the project's advancement, while a required step cannot.
  - *Success:* Skipping an optional step advances `currentStep`; attempting to skip a required step is rejected server-side.
- [ ] **WF-05**: The existing parallel/join pattern (Delivery Project Checklist + Delivery Readiness both feeding into Project Check Report) is representable in the new graph, not just a coincidence of sequential numbering.
  - *Success:* Both branch steps must complete before the join step becomes actionable; either can complete first.
- [ ] **WF-06**: Every existing step from Confirmation through Sign Off is migrated into the new engine unchanged — same key, role, checklist slug, and relative order to each other.
  - *Success:* A project created before this migration and one created after both see identical Confirmation→Sign Off behavior; no existing checklist slug or role assignment changes.

### Configurator & access control

- [ ] **CFG-01**: A super-admin-only "Workflow Configurator" screen lists all steps in order and supports add, remove, reorder (drag-and-drop), and editing each step's label/text/role/upload-requirement/optional flag.
  - *Success:* Reordering persists; adding a step inserts it into the live graph; removing a step (with confirmation) takes it out of new projects' paths.
- [ ] **CFG-02**: Reaching the configurator requires a separate PIN, distinct from normal login — defaults to `0000` with a visible hint, so it isn't casually reachable by everyone with super_admin access.
  - *Success:* Navigating to the configurator prompts for the PIN before rendering the screen; wrong PIN blocks entry; the hint is shown on the prompt.
- [ ] **CFG-03**: The super admin can change the configuration PIN from within the configurator itself.
  - *Success:* Changing the PIN persists (hashed) and the old PIN no longer grants access; the hint updates alongside it.

### Roles & assignment

- [ ] **ROLE-01**: New roles `customer_care`, `ops_factory`, and `factory_manager` exist in the role enum, each with their own dashboard shell (nav + landing page), following the pattern established for `design`/`production` in Phase 15.
  - *Success:* A user created with each new role lands on a role-appropriate dashboard and only sees their own nav.
- [ ] **ROLE-02**: An "assignment" step lets its actor (e.g., Head of Design) pick a user of a target role (e.g., a `design`-role user) and notifies that user they've been assigned.
  - *Success:* Picking a user records the assignment against the project/step and fires a notification to the assignee.
- [ ] **ROLE-03**: `users.position` (existing free-text field) continues to carry super-admin "titles" — Head of Design, Head of Projects, MD, ED, COO, Chief Production Officer — with no new enum roles for these; permissions stay governed by `role = super_admin`.
  - *Success:* No new role enum values added for any super_admin title; UI can display the title from `position` where relevant (e.g., CPO review step).

### Payment & timeline

- [ ] **PAY-01**: Projects have a `paid`/`unpaid` payment status, defaulting to `unpaid` when Customer Care creates the project.
  - *Success:* New projects created via the Customer Care intake step start `unpaid`.
- [ ] **PAY-02**: Head of Operations (role `operations`) toggles a project from `unpaid` to `paid`, and this gates progress into the design phase (architect assignment / brief taking cannot start while `unpaid`).
  - *Success:* Attempting to act on the brief-taking step while `unpaid` is rejected server-side; toggling `paid` unblocks it.
- [ ] **PAY-03**: A second, distinct invoicing checkpoint exists after Brief Taking — Customer Care prompts Ops to create and send an invoice, and the project cannot proceed to the Design Stage (client approval) until the client has paid it. This is separate from PAY-01/02's initial paid toggle.
  - *Success:* Two independent gates exist in the data model; satisfying one does not satisfy the other.
- [ ] **PAY-04**: Per-step deadlines (existing `project_step_deadlines` mechanism from v1.1) extend to cover every new step in the expanded workflow, not just the original 11.
  - *Success:* Operations can set a deadline for any new step at project creation; board/countdown/my-work read it the same way they do for existing steps.

### New stage content (seeded default workflow, ahead of existing Confirmation)

- [ ] **STG-01**: Project Intent — Customer Care creates a project capturing customer name, email, phone, location, and scope.
- [ ] **STG-02**: Assign Designer/Architect for Brief — Head of Design assigns a single `design`-role user who carries the project through Kickoff, Design Meeting, Brief Taking, and the Design Stage (one assignment, not a second re-assignment later).
- [ ] **STG-03**: Kickoff Meeting — designer marks kickoff held (yes/no) with an optional upload.
- [ ] **STG-04**: Design Meeting — designer marks materials/colors gathered (yes/no) with an optional upload.
- [ ] **STG-05**: Brief Taking — designer marks the brief taken (yes/no) with an optional file upload.
- [ ] **STG-06**: Invoicing — Customer Care/Ops marks the client-paid invoice checkpoint (yes/no) — see PAY-03. Sits after Brief Taking, before the Design Stage.
- [ ] **STG-07**: Design Stage — designer marks client design approval (yes/no) with an optional upload of the approved drawing.
- [ ] **STG-08**: Confirmation 2 / re-confirmation — Site PM re-confirms on-site, inserted immediately after the existing Confirmation step.
- [ ] **STG-09**: Confirmation Correction — designer inputs site corrections into the design (yes/no) with an optional upload of the corrected drawing.
- [ ] **STG-10**: Internal Approval — Ops Admin routes the drawing to Head of Design to check/approve and receives it back; upload of the approved drawing.
- [ ] **STG-11**: Send for Production — Ops Admin sends, Chief Production Officer (super_admin) receives (approval/two-sided-ack fulfillment kind).
- [ ] **STG-12**: Project Review and Authorization — CPO reviews and approves (yes/no) after internal team review.
- [ ] **STG-13**: Production Process — `ops_factory` role completes a checklist: optimization document upload, then cutting/edging/edging-concluded/upholstery-concluded/glass/accessories-sorted, each yes/no.
- [ ] **STG-14**: Factory Manager Approval / QC — `factory_manager` role approves (yes/no), inserted immediately before the existing Materials/Accessories Readiness step.
  - *Success (STG-01…14 as a set):* A new project walks through all 14 stages in order — Intent → paid → Assign designer → Kickoff → Design Meeting → Brief Taking → Invoicing → Design Stage → Confirmation2 → Confirmation Correction → Internal Approval → Send for Production → Project Review & Authorization → Production Process → Factory Manager QC — each gated on its predecessor (or its parallel-branch partner where applicable), and arrives at the existing Confirmation step in exactly the state today's Confirmation step already expects.

### v2.0 Out of Scope

| Deferred | Reason |
|----------|--------|
| Redesigning any step from Confirmation through Sign Off | Explicitly locked — those steps ship unchanged, only wrapped by the new engine |
| Branching/conditional logic beyond the single existing parallel/join pair | Not requested; the configurator reorders/edits a linear-with-one-join graph, not arbitrary DAGs |
| Multi-PIN / per-admin configuration passwords | Single shared configuration PIN requested, not per-user |

## v2.0 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WF-01, WF-02, WF-03, WF-04, WF-05 | Phase 16 | Pending |
| WF-06 | Phase 17 | Pending |
| CFG-01, CFG-02, CFG-03 | Phase 18 | Pending |
| ROLE-01, ROLE-02, ROLE-03 | Phase 19 | Pending |
| PAY-01, PAY-02, PAY-03, PAY-04 | Phase 20 | Pending |
| STG-01..07 | Phase 21 | Pending |
| STG-08..14 | Phase 22 | Pending |

**Coverage:**
- v2.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-07-09 — v2.0 roadmap created (phases 16-22)*
