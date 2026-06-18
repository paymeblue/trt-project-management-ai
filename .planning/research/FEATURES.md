# Feature Research

**Domain:** Internal multi-role digital-checklist / field-operations platform (furniture installation, Factory PM + Site PM + Super Admin)
**Researched:** 2026-06-18
**Confidence:** MEDIUM — web search restricted; analysis draws from training-data knowledge of SafetyCulture/iAuditor, Fieldwire, GoFormz, Procore punchlists, and direct grounding in PROJECT.md

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the minimum for this app to be a credible paper replacement. Missing any one = users revert to paper.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Role-gated navigation (Factory PM / Site PM / Super Admin see only their own tabs) | PMs must not see each others' data; admin oversight requires full read; paper equivalent = separate binders per role | LOW | Auth middleware + role claim from Neon Auth on every route segment; nav items rendered conditionally |
| Multistep wizard checklist entry | Mobile-first; one long form on a phone is unusable; iAuditor and GoFormz both paginate sections | MEDIUM | Each checklist (Delivery Project, Delivery Site Readiness, Sorting, Change Request, Close Out, Confirmation/Verification) is a wizard; shared WizardShell component drives all; step state in React state or URL param |
| Radio-button / tri-state checklist items (Yes / No / N/A) | The paper originals use this pattern; binary collapse nuance that matters on site | LOW | Per PROJECT.md: binary confirmed, N/A per-item TBD from source PDFs; implement tri-state from day one — displaying only Yes/No is trivial, but retrofitting N/A requires schema migration |
| Photo attachment on checklist entries | Core paper replacement value: photo evidence per line item; SafetyCulture's defining feature | MEDIUM | S3-compatible upload on checklist_responses row; mobile camera capture via `<input type="file" accept="image/*" capture="environment">`; show thumbnail inline in wizard step |
| File/photo list sortable by Name and Date | PMs need to find "last uploaded" or "by project name" without scrolling infinitely | LOW | Product Readiness Checklist file list; client-side sort sufficient for v1 given small dataset; add server-side sort if row count grows |
| Create New + View List pattern per checklist type | Every checklist the paper workflow has must have a "start new" entry point and a browseable history table | LOW | Consistent two-pane layout: action card (Create New) + data table (View List / View File); applies to Delivery Project Checklist, Confirmation, Site PM checklists |
| Project record with Name / Location / PM (auto-fill) | Site PM "New Project" flow: minimal data entry, auto-populated PM field = fewer errors than paper | LOW | Pull logged-in user name/ID for PM field; Location free-text v1 |
| Factory Floor Projects spreadsheet view (Name / Delivery Timeline / Status toggle) | Factory PM's primary daily view — delivered/not-delivered status is the core signal | LOW | Table with inline toggle (Delivered / Not Delivered); no complex filtering needed v1 |
| Profile with ID card photo upload (date-stamped) | Internal compliance: staff ID must be on record; date stamp shows when card was last updated | LOW | S3 upload for ID card; created_at/updated_at on attachment row; Super Admin can overwrite |
| Persistent session / auth state across reloads | PMs on a job site cannot re-authenticate mid-checklist | LOW | Neon Auth session cookie; standard Next.js middleware pattern |
| Super Admin read-only aggregate view | Management needs visibility without write risk; Procore-style admin dashboards are read-only on operational data | MEDIUM | Query across all projects + checklists + attachments; paginated table with role/type filter; NO edit controls on operational rows |
| Super Admin user management (invite / assign role) | Admin must provision PM accounts without requiring PMs to be developers | MEDIUM | Create user form → send invite email (Neon Auth or transactional email); role assignment dropdown (factory_pm / site_pm) |
| Super Admin content management (About TRT, Processes & Flow Charts, Email Formats) | Internal knowledge base must be maintainable by non-dev admin | MEDIUM | Rich text or structured markdown editor on these three content areas; versioning v2 |
| Dave Aredo AI chat (floating button, full-screen overlay, per-user history, rate limit) | Stated core feature; AI grounded in internal process docs answers "what is the handover checklist for X?" instantly | HIGH | Claude Agent SDK server-side; context injection from Processes & Flow Charts; rate-limit mechanism configurable (do not hardcode 20 msg/day) |
| Audit trail / submission timestamp | Any paper replacement must record who submitted what and when; legal/compliance baseline | LOW | created_at + submitted_by FK on every checklist_responses set; display in View List table |
| Issue Log (tabular, Excel-style or link-based) | Site PM field: defects/issues captured during site work; Fieldwire and Procore make this a first-class object | MEDIUM | Excel-style = editable inline rows; "changeable links" variant = store external spreadsheet URL; decide based on source PDF content |

### Differentiators (Competitive Advantage)

Features that, within an internal tool for furniture installation ops, create measurable workflow advantage over the paper baseline.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Dave Aredo AI assistant grounded in internal process docs | Zero onboarding friction for new PMs — "what docs do I need for out-of-state delivery?" answered instantly without phoning a colleague; no generic SaaS checklist platform offers this | HIGH | Context window = Processes & Flow Charts content; role-scoped (Site PM Dave cannot reveal Factory PM data); per PROJECT.md: text-only v1, rate-limited for PMs |
| Confirmation/Verification wizard (site reality vs. architect drawing) | Structured capture of pre/post delivery verification — not just a checklist but a match/mismatch record tied to the project; iAuditor supports this pattern but requires manual template setup | MEDIUM | Confirmation = create new; generates a verifiable record with photos; rename Confirmation → Verification platform-wide when decided |
| Processes & Flow Charts as living internal knowledge base | New hires read it instead of asking someone; editable by Super Admin; linked from Dave Aredo context — creates a single source of truth loop | MEDIUM | Rich-text content store; Super Admin edits; read-only for PMs; Dave Aredo queries it — this is the flywheel |
| Role-specific home screens (CRM-style, not generic dashboard) | Factory PM and Site PM have entirely different jobs; one unified dashboard creates noise; per-role home = zero-friction daily start | LOW | Conditional routing on login based on role claim |
| Photo evidence directly tied to checklist response row | SafetyCulture does this; most internal tools treat photos as loose file uploads; attaching photo to the specific line item creates an unambiguous record | MEDIUM | attachment FK → checklist_response_id (not just checklist_id); display inline in submission review |
| Close Out Process Checklist (formal project closeout) | Formal closeout reduces disputes about incomplete work; internal discipline enforced by the platform rather than memory | MEDIUM | Site PM flow; same wizard shell; linked to project record |

### Anti-Features (Deliberately NOT Building for v1)

These seem like obvious additions but each one adds scope, complexity, or maintenance burden that would delay or destabilize v1.

| Feature | Why Requested | Why Problematic for v1 | Alternative |
|---------|---------------|------------------------|-------------|
| Native offline-first / service worker sync | Field workers sometimes have poor connectivity | PWA offline sync + conflict resolution is a significant engineering domain; Safari PWA support on iOS has persistent quirks; wrong scope for v1 | Design forms so they are completable in one session; show clear "network required" state; defer offline to v1.x once usage patterns are known |
| Custom form builder (drag-and-drop template editor) | "We might want to change checklists later" | Form-builder UI is itself a product; GoFormz's entire product IS the form builder; scope creep risk; internal tool checklists change infrequently | Hardcode checklist structure in code v1; externalise to DB-driven config v1.x; Super Admin edits content (line-item text) not structure |
| Real-time collaborative editing (multiple PMs on same checklist) | Seems useful on a busy job site | Concurrent edit conflicts, presence indicators, optimistic UI — none of this is needed when one PM owns one checklist submission | Single-PM submission model; submissions are immutable once submitted |
| In-chat image upload for Dave Aredo | Asking Dave about a photo of a site condition | Explicitly deferred in PROJECT.md (v1 text-only); multimodal Claude adds cost and complexity | Text-only v1; photo references via checklist submission |
| Push notifications / mobile alerts | "Notify me when a checklist is submitted" | Requires APNS/FCM integration or Web Push; maintenance overhead disproportionate to v1 benefit | Super Admin polls the aggregate view; email notification v1.x if needed |
| Complex role hierarchy / sub-roles | "We need a Project Lead above Site PM" | Role proliferation makes auth middleware brittle; three roles are already specified and sufficient | Keep three roles; add permissions granularity inside a role via feature flags v2 |
| Reporting dashboards / analytics charts | "Show me submission trends over time" | Charts require aggregation pipelines, BI-style queries, and design time; not a paper-replacement feature | Super Admin read-only table view with export is sufficient; add charts v2 once data volume justifies it |
| CSV/PDF export of checklist submissions | Useful for sharing with clients | Adds a rendering layer (PDF generation = Puppeteer or React-PDF = non-trivial); CSV export is simpler but still requires API work | v1: screen-readable submission view; v1.x: structured export once submission format is stable |
| Direct messaging between team members | "PMs need to communicate" | Full messaging is a product unto itself; out of scope per PROJECT.md | Dave Aredo for process questions; external chat tools (WhatsApp, Teams) for person-to-person |
| Super Admin editing operational data (project entries, checklist submissions) | "Admin should be able to fix mistakes" | Violates the audit integrity model; creates liability; PROJECT.md explicitly defines admin as read-only on operational data | Super Admin contacts PM to resubmit; if correction is truly needed, build a correction request flow v2 |
| Public-facing project status portal | "Clients want to see delivery status" | B2B internal tool — exposing data to external users is a separate product | Out of scope entirely for this platform |

---

## Feature Dependencies

```
Auth & Role Claims (Neon Auth)
    └──required by──> Role-gated navigation
    └──required by──> Super Admin read-only view
    └──required by──> Dave Aredo role-scoped context
    └──required by──> Profile (know who is logged in)
    └──required by──> New Project (auto-fill PM field)

Project Record (New Project form)
    └──required by──> Delivery Project Checklist (Factory PM)
    └──required by──> Confirmation / Verification Checklist (Site PM)
    └──required by──> Close Out Process Checklist (Site PM)
    └──required by──> Issue Log (Site PM)
    └──required by──> Super Admin aggregate view

S3 File Storage
    └──required by──> Photo attachment on checklist entries
    └──required by──> Profile ID card upload
    └──required by──> Product Readiness file upload

Multistep Wizard Shell (shared component)
    └──required by──> Delivery Project Checklist
    └──required by──> Delivery Site Readiness Checklist
    └──required by──> Confirmation / Verification Checklist
    └──required by──> Sorting Checklist
    └──required by──> Change Request Checklist
    └──required by──> Close Out Process Checklist

Checklist Line Items (sourced from paper PDFs)
    └──required by──> Any wizard rendering line items
    └──blocks──> Full wizard implementation until PDFs are supplied

Processes & Flow Charts content store
    └──required by──> Dave Aredo context injection
    └──enhances──> New hire onboarding

Super Admin content management
    └──required by──> Email Formats (PM view, Admin edits)
    └──required by──> Processes & Flow Charts edit
    └──required by──> About TRT edit

Audit trail (submitted_by / created_at on submissions)
    └──enhances──> Super Admin aggregate view
    └──enhances──> Issue resolution (who submitted what)
```

### Dependency Notes

- **All checklists require Auth first:** A user's role determines which wizard they can access; implement auth gating before building any checklist wizard.
- **Project Record required before most checklists:** Checklists must be associated to a project; build the New Project / Factory Floor Projects data model before wizard screens.
- **Paper PDFs block line-item implementation:** Checklist wizard *shell* can be built without PDFs (hardcode placeholder steps); actual line items cannot be finalised until source PDFs are received. Do not invent line items (per PROJECT.md explicit warning).
- **S3 storage required before photo attachment:** File upload UI is trivially simple; the S3 bucket, presigned URL generation, and attachment DB row must be in place first.
- **Dave Aredo requires Processes & Flow Charts data:** The AI assistant's grounding context is the knowledge base; if the knowledge base is empty at launch, Dave Aredo can still function but will have no internal context — seed with at least placeholder content.
- **Issue Log format depends on source PDF:** Described as "Excel-style or changeable links" — two very different implementations; defer to PDF review before choosing data model.

---

## MVP Definition

### Launch With (v1)

The minimum that makes this a working paper replacement for both PM roles.

- [ ] Auth: self-serve signup with role picker (Factory PM / Site PM); Super Admin seeded; persistent session
- [ ] Role-gated navigation — each role sees only their tabs
- [ ] Factory PM: Factory Floor Projects table with Name / Delivery Timeline / Status toggle
- [ ] Factory PM: Delivery Project Checklist — multistep wizard (placeholder steps until PDFs arrive) + View List table
- [ ] Factory PM: Product Readiness Checklist — file upload + sortable file list (Name / Date)
- [ ] Site PM: New Project form (Name / Location / PM auto-fill) + View Previous Projects
- [ ] Site PM: Confirmation/Verification Checklist — multistep wizard + View File
- [ ] Site PM: Delivery Site Readiness Checklist — multistep wizard
- [ ] Site PM: Sorting Checklist — multistep wizard
- [ ] Site PM: Change Request Checklist — multistep wizard
- [ ] Site PM: Close Out Process Checklist — multistep wizard
- [ ] Site PM: Issue Log — tabular entry (format TBD from PDF)
- [ ] Site PM: Email Formats — read-only view for PMs; Super Admin edits
- [ ] Photo attachment on checklist responses (S3 upload, inline thumbnail)
- [ ] Profile: Name / Position / ID card photo upload (date-stamped); Super Admin can overwrite ID
- [ ] Processes & Flow Charts: read-only view for PMs; Super Admin edits
- [ ] About TRT: read-only for PMs; Super Admin edits
- [ ] Super Admin: read-only aggregate view of all projects + submissions + photos
- [ ] Super Admin: user management (invite / assign role)
- [ ] Dave Aredo: floating button, full-screen overlay, Claude Agent SDK endpoint, role-scoped context, per-user chat history, configurable rate limit (not hardcoded)
- [ ] Audit trail: submitted_by + created_at on all checklist submissions

### Add After Validation (v1.x)

Add these once v1 usage reveals actual friction.

- [ ] CSV export of checklist submissions — add when PMs start requesting it; defer until submission schema stabilises
- [ ] PDF export of individual submission — add when client-sharing becomes a real workflow
- [ ] Offline-capable draft saving (localStorage) — add if field connectivity is reported as a real blocker
- [ ] Dave Aredo image upload support — multimodal; add after text-only usage patterns are established
- [ ] Email notifications on checklist submission — add if Super Admin reports missing updates
- [ ] Issue Log: link/URL mode (if "changeable links" variant is what source PDF specifies)

### Future Consideration (v2+)

Defer until the tool has demonstrated value and stable usage.

- [ ] Custom checklist template editor (drag-and-drop form builder)
- [ ] Analytics / reporting dashboards (submission trends, completion rates)
- [ ] Real-time push notifications
- [ ] Sub-role permissions / project-level access control
- [ ] Native mobile app (React Native) — web-first is correct for v1

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auth + role-gated nav | HIGH | LOW | P1 |
| Multistep wizard shell (shared component) | HIGH | MEDIUM | P1 |
| Factory Floor Projects table + status toggle | HIGH | LOW | P1 |
| Site PM New Project + Delivery Site Readiness | HIGH | MEDIUM | P1 |
| Photo attachment on checklist responses | HIGH | MEDIUM | P1 |
| Confirmation / Verification wizard | HIGH | MEDIUM | P1 |
| Super Admin read-only aggregate view | HIGH | MEDIUM | P1 |
| Dave Aredo AI assistant | HIGH | HIGH | P1 |
| Audit trail (submitted_by / timestamps) | HIGH | LOW | P1 |
| Site PM all remaining checklists (Sorting, Change Request, Close Out) | HIGH | LOW (reuses wizard shell) | P1 |
| Profile + ID card upload | MEDIUM | LOW | P1 |
| Processes & Flow Charts (read + admin edit) | MEDIUM | MEDIUM | P1 |
| About TRT + Email Formats (admin edit) | MEDIUM | LOW | P1 |
| Super Admin user management | MEDIUM | MEDIUM | P1 |
| Product Readiness file upload + sortable list | MEDIUM | LOW | P1 |
| Issue Log tabular interface | MEDIUM | MEDIUM | P1 |
| CSV/PDF export | LOW | MEDIUM | P2 |
| Offline draft saving | LOW | HIGH | P2 |
| Email notifications | LOW | MEDIUM | P2 |
| Custom form builder | LOW | HIGH | P3 |
| Analytics dashboards | LOW | HIGH | P3 |

---

## Competitor Feature Analysis

*Note: Analysis based on training knowledge of these products (MEDIUM confidence — no live scrape available). Findings used directionally, not as authoritative capability claims.*

| Feature | SafetyCulture/iAuditor | Fieldwire | GoFormz | Our Approach |
|---------|------------------------|-----------|---------|--------------|
| Multistep checklist wizard | Section-by-section navigation within a template; not a true "wizard" — all sections visible in sidebar | Linear task workflow per floor plan element; not wizard | Page-by-page form; closest to wizard model | True wizard with Back/Next/Submit; no sidebar peeking at future steps; consistent across all checklist types |
| Photo attachment | Per-question photo attachment; flagship feature; metadata preserved | Pin photos to floor plan locations | Attach per field | Per checklist_response row; FK to attachment; show inline thumbnail in wizard; no floor-plan pins needed for this use case |
| Role-based visibility | Seats/groups model; each user can be in multiple groups with different template access | Per-project role (Owner/Admin/Member/Viewer) | Admin/user/submitter model | Hard three-role model (factory_pm / site_pm / super_admin); no cross-role visibility; simpler and correct for this org |
| Admin read-only oversight | Admin sees everything; no explicit "read-only admin" concept — admin can edit | Project owner can edit or lock | Admin has full control | Super Admin is explicitly read-only on operational data; this is a deliberate departure from generic patterns |
| Offline capture | Full offline-first; core selling point | Full offline; designed for construction sites | Partial offline with sync | Not in v1; web-first; add localStorage draft saving in v1.x if field reports prove it is needed |
| AI assistant | No built-in AI assistant grounded in internal docs | No AI assistant | No AI assistant | Dave Aredo is our primary differentiator; role-scoped; grounded in Processes & Flow Charts; no competitor does this |
| Export | PDF and CSV export built-in | PDF export, report generation | PDF and CSV export | Defer to v1.x; not a paper-replacement feature |
| Audit trail | Full activity log per submission | Activity feed per task | Submission timestamps | Lightweight: submitted_by + created_at on all submission records; no activity log stream v1 |
| Form builder | Drag-and-drop template editor; this IS the product | Task/form templates per project | Full form builder | Anti-feature for v1; hardcode structure; checklist text editable by Super Admin in v1.x |

---

## Sources

- PROJECT.md — primary source; all features grounded in per-role flows defined there (HIGH confidence)
- Training knowledge of SafetyCulture/iAuditor v24.x feature set — multistep sections, per-item photo attachment, group-based access (MEDIUM confidence — verified directionally against known product patterns)
- Training knowledge of Fieldwire — floor-plan-centric task/checklist model, offline-first, per-project roles (MEDIUM confidence)
- Training knowledge of GoFormz — page-by-page form wizard, field-level attachment, admin/submitter model (MEDIUM confidence)
- Training knowledge of Procore punchlists — read-only observer role, project-level access, photo pinning (MEDIUM confidence)
- Field-service platform best practices: single-PM submission model, immutable submitted records, audit trail on all operational writes (MEDIUM confidence — widely established pattern)

---

*Feature research for: TRT Arredo internal field-ops + digital-checklist platform*
*Researched: 2026-06-18*
