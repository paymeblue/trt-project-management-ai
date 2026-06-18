# Requirements: TRT Arredo Project Management Platform

**Defined:** 2026-06-18
**Core Value:** A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with each role seeing only what's theirs and the Super Admin seeing everything read-only.

## v1 Requirements

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
- [ ] **SHELL-04**: User can view Processes & Flow Charts (read-only for PMs)
- [ ] **SHELL-05**: User can view About TRT (read-only for PMs)
- [ ] **SHELL-06**: A Dave Aredo floating button is present on every screen and opens a full-screen chat overlay

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
- [ ] **ADMIN-05**: Super Admin can edit Processes & Flow Charts content
- [ ] **ADMIN-06**: Super Admin can edit Email Formats content

### Dave Aredo (AI Assistant)

- [ ] **AI-01**: User can chat with Dave Aredo via a server-side streaming endpoint (text-only)
- [ ] **AI-02**: Assistant responses are grounded in the Processes & Flow Charts content
- [ ] **AI-03**: Assistant context is scoped to the caller's role/permissions (no cross-role data leakage)
- [ ] **AI-04**: Per-user chat history is persisted
- [ ] **AI-05**: PM usage is rate-limited server-side via a configurable daily cap; Super Admin is unlimited
- [ ] **AI-06**: User-submitted content cannot override the system prompt (prompt-injection resistant)

### File Storage

- [ ] **FILE-01**: Photos/files upload directly to S3-compatible storage via presigned URLs (not proxied through the app)
- [ ] **FILE-02**: Stored attachments record the object key; access URLs are generated on demand for authorized users only

## v2 Requirements

### Collaboration

- **COLLAB-01**: Super Admin can direct-message a specific team member

## Out of Scope

| Feature | Reason |
|---------|--------|
| Native offline-first / PWA sync | Disproportionate engineering for an internal v1; web-first is acceptable |
| Image upload into the Dave Aredo chat | Explicitly deferred; v1 chat is text-only |
| Super Admin write access to operational data | Audit integrity — admin governs content + users, not entries |
| General-purpose form-builder UI | Checklists are seeded from PDFs as data; no end-user builder needed for v1 |
| Final AI pricing/quota values hardcoded | ~$20/mo and ~20 msg/day are placeholders pending a pricing decision; cap is configurable |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01..07 | Phase 1 | Pending |
| CHK-01 | Phase 1 | Pending |
| SHELL-01..05 | Phase 2 | Pending |
| FILE-01, FILE-02 | Phase 2 | Pending |
| CHK-02..08 | Phase 3 | Pending |
| FAC-01..06 | Phase 4 | Pending |
| SITE-01..09 | Phase 5 | Pending |
| ADMIN-01..06 | Phase 6 | Pending |
| AI-01..06 | Phase 7 | Pending |
| SHELL-06 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 50 total
- Mapped to phases: 50
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-06-18 after initialization*
