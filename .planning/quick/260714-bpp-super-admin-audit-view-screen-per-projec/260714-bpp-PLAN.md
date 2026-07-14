---
phase: quick-260714-bpp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/project-audit.ts
  - tests/lib/project-audit.test.ts
  - app/(app)/admin/projects/[id]/audit/page.tsx
  - app/(app)/admin/timeline/page.tsx
autonomous: true
requirements: [AUDIT-VIEW]
must_haves:
  truths:
    - "A super_admin opens a per-project audit page from a View button on the admin timeline"
    - "A non-super_admin (operations) who hits the audit URL directly is forbidden (server-side gate, not just hidden link)"
    - "The audit page lists every live workflow step in graph order; completed steps show completing officer (name + position label), completion time, recorded answer, and any upload; unreached steps render as muted Not started rows"
    - "Approval steps show sent-by / received-by names; assignment steps show the assigned officer name"
    - "Checklist submissions for the project appear per step with per-item label to value/notes and form-level photo thumbnails"
    - "Base64 image uploads render as clickable thumbnails; non-image uploads render as filename text only (no clickable data: link to non-image content)"
    - "The step table scrolls horizontally in its own container on mobile without breaking the page"
  artifacts:
    - path: "lib/project-audit.ts"
      provides: "getProjectAudit(projectId) data loader + assembleAuditRows pure assembler"
      min_lines: 60
    - path: "tests/lib/project-audit.test.ts"
      provides: "Unit tests for assembleAuditRows (ordering, completed vs not-started, position-label fallback, image vs non-image upload classification)"
      contains: "assembleAuditRows"
    - path: "app/(app)/admin/projects/[id]/audit/page.tsx"
      provides: "super_admin-only server component rendering the audit table"
      contains: "requireRole"
    - path: "app/(app)/admin/timeline/page.tsx"
      provides: "View link to the audit route, shown only for super_admin"
  key_links:
    - from: "app/(app)/admin/timeline/page.tsx"
      to: "/admin/projects/[id]/audit"
      via: "per-row View anchor gated to role === 'super_admin'"
      pattern: "projects/.*/audit"
    - from: "app/(app)/admin/projects/[id]/audit/page.tsx"
      to: "requireRole('super_admin')"
      via: "server-side access gate"
      pattern: "requireRole\\(['\"]super_admin['\"]\\)"
    - from: "app/(app)/admin/projects/[id]/audit/page.tsx"
      to: "lib/project-audit.getProjectAudit"
      via: "server data load"
      pattern: "getProjectAudit"
---

<objective>
Add a super-admin-only per-project audit "View" screen. From the admin timeline, a View button per project opens a detail page that shows, in one scrollable table, every step of that project: the completing officer (name + position), completion time, the step's recorded answer, any uploaded file/image (base64 data URL rendered as a thumbnail or filename), approval send/receive parties, assignment target, and any checklist submissions for that step (per-item answers, notes, photos).

Purpose: There is currently no way to click through and view all responses/images for a project in tabular form. This gives the super admin one read-only oversight surface across the whole 22-step frame.

Output: A new pure data-assembly module with tests, a new audit route, and a View link wired into the existing timeline.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Read these FRESH — do not rely on any line numbers baked into this plan.
@db/schema.ts
@lib/dal.ts
@lib/workflow.ts
@lib/workflow-graph.ts
@app/(app)/admin/timeline/page.tsx
@app/(app)/admin/users/page.tsx
@app/(app)/checklists/[slug]/[submissionId]/page.tsx
@app/(app)/factory-pm/readiness/[id]/page.tsx
@tests/lib/dal.test.ts

<constraints>
- READ-ONLY feature: NO schema changes, NO server actions, NO mutations. Pure queries + rendering only.
- Gate is super_admin ONLY (not operations). Use the EXISTING `requireRole('super_admin')` from lib/dal.ts — it already does `if (s.role !== role) forbidden()`. Do NOT use `requireAdmin` (that admits operations). Do NOT add a new helper.
- Do NOT touch position-management code (lib/workflow.ts POSITION_VALUES / Positions constants). Read POSITION_LABELS only for display; another planner is concurrently renaming positions — stay out of that file entirely.
- This repo's Next.js has breaking changes from training data. Before writing the route/component, read the relevant guide under node_modules/next/dist/docs/ (dynamic route params are an async Promise here — mirror the `params: Promise<{ ... }>` + `await params` pattern already used in app/(app)/checklists/[slug]/[submissionId]/page.tsx).
- Mirror existing patterns: `export const dynamic = 'force-dynamic'` (all admin siblings), base64 `<img>` thumbnail rendering with the `{/* eslint-disable-next-line @next/next/no-img-element */}` comment (see readiness page), horizontally scrollable table container.
</constraints>

<interfaces>
Key contracts the executor needs (verify FRESH against the files above):

- lib/dal.ts:
  - `requireRole(role: Role): Promise<{ userId: string; role: Role }>` — throws `forbidden()` on mismatch. Call `requireRole('super_admin')`.

- lib/workflow-graph.ts:
  - `getLiveWorkflowSteps(): Promise<LiveWorkflowStep[]>` — returns ALL live steps in graph order. Each has `{ n, key, label, role, kind, slug?, stepDefId, ... }`. `slug` is the step's checklistSlug (only set for checklist-kind steps). `stepDefId` is the workflow_step_definitions.id used to join completions/step-states.

- lib/workflow.ts:
  - `POSITION_LABELS: Record<string, string>` — machine-value -> display label. Verbatim/display-form position values are NOT keys; fall back to the raw `users.position` string when absent: `POSITION_LABELS[pos] ?? pos ?? '—'`.
  - `workflowRoleLabel(role)` — for rendering the step's owning role if useful.
  - `StepKind` union includes 'yes_no_upload' | 'approval' | 'assignment' | 'checklist' | etc.

- db/schema.ts tables (all read-only here):
  - `projectStepCompletions` { projectId, stepKey, stepN, stepDefId, completedBy, completedAt, notes, skipped } — the completing officer + when, keyed by stepDefId for graph rows.
  - `workflowStepStates` { projectId, stepDefId, status, answer, uploadData (base64 data URL), uploadName, assignedUserId, sentBy, receivedBy, actedBy } — per (projectId, stepDefId).
  - `checklists` { id, definitionId, projectId, createdBy, status, submittedAt, photoData (data URL array) }.
  - `checklistDefinitions` { id, slug, name } — join to a step via `slug === step.slug`.
  - `checklistResponses` { id, checklistId, templateItemId, value, textValue, notes }.
  - `checklistTemplateItems` { id, definitionId, step, sectionTitle, sortOrder, label }.
  - `attachments` { id, responseId, s3Key, filename } — item-level files stored as S3 keys (NOT data URLs); show filename text only, never a data: link.
  - `users` { id, name, position } — resolve officer/party names + position label.
  - `projects` { id, name, currentStep, paymentStatus, customerName, location, deliveryDate }.

- KNOWN LIMITATION (state it in a code comment + surface nothing broken): `readiness_forms` has NO projectId column — it is NOT project-linked. Skip readiness forms entirely; do not attempt to join them.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Build the audit data layer (pure assembler + loader) with tests</name>
  <files>lib/project-audit.ts, tests/lib/project-audit.test.ts</files>
  <behavior>
    Test assembleAuditRows (a PURE function taking already-fetched plain data, no DB):
    - Test: given live steps in graph order and a completions map, output rows are in the same graph order and 1:1 with the steps.
    - Test: a step with a completion row is status 'completed' and carries officer name, position label, and completedAt; a step with no completion is status 'not_started' with null officer/time.
    - Test: position label uses POSITION_LABELS for a machine value (e.g. 'head_of_operations' -> 'Head Designer'/'Head of Operations') and falls back to the verbatim string for a display-form value (e.g. 'Designer' -> 'Designer'), and to '—' when position is null.
    - Test: an upload whose data URL starts with 'data:image/' is classified as an image (isImage true); a non-image upload (e.g. 'data:application/pdf' or a plain filename) is isImage false so the UI renders filename text only.
    - Test: approval fields (sentBy/receivedBy) and assignment field (assignedUserId) resolve to names via the users map when present, else null.
  </behavior>
  <action>
    Create lib/project-audit.ts as a `server-only` module (mirror lib/workflow-graph.ts header) exporting two things.

    (1) A PURE, DB-free function `assembleAuditRows(input)` that takes plain in-memory data — the ordered live steps, a Map of completions by stepDefId, a Map of workflow_step_states by stepDefId, checklist submissions grouped by step slug, and a Map of users by id (each `{ name, position }`) — and returns an ordered array of audit-row view models, one per live step, in graph order. Each row carries: step number + label + kind; status ('completed' | 'not_started', derived from whether a completion exists); officer name and resolved position label (`POSITION_LABELS[position] ?? position ?? '—'`); completedAt; the recorded answer (from step-states); an upload descriptor `{ dataUrl, name, isImage }` where `isImage` is true only when the data URL starts with 'data:image/'; approval parties (sentBy/receivedBy names); assignment target (assignedUserId name); and the step's checklist submissions (each: definition title, submittedBy name, submittedAt, an ordered list of item `{ label, value/textValue, notes }`, and form-level photo data URLs). Keep it a plain data transform with no imports beyond POSITION_LABELS and types — so it is unit-testable without a database.

    (2) An async loader `getProjectAudit(projectId)` that fetches the project header (name, customer, location, currentStep, paymentStatus, deliveryDate), calls getLiveWorkflowSteps(), and runs the read-only queries to build the maps the pure function needs: project_step_completions (join users for officer name/position) keyed by stepDefId; workflow_step_states keyed by stepDefId; checklist submissions for the project (checklists where projectId matches, joined to checklist_definitions to get slug+name, plus checklist_responses joined to checklist_template_items for labels, ordered by step then sortOrder), grouped by the definition slug so each row can pick up the checklist(s) whose slug matches its step's `slug`; and a users map for resolving sentBy/receivedBy/assignedUserId/checklist createdBy names. Then call assembleAuditRows and return `{ project, rows }`. Add a short comment noting readiness_forms is intentionally excluded (no projectId column).

    Write tests/lib/project-audit.test.ts targeting ONLY the pure assembleAuditRows (do not hit the DB; follow the import style of tests/lib/workflow.test.ts). Cover every case in <behavior>. Mock nothing beyond what the pure function needs — it takes plain objects.

    Do NOT add any mutation, server action, or schema change. Do NOT import or modify lib/workflow.ts constants beyond reading POSITION_LABELS.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/lib/project-audit.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>assembleAuditRows and getProjectAudit are exported from lib/project-audit.ts; the new test file passes; tsc is clean.</done>
</task>

<task type="auto">
  <name>Task 2: Build the super_admin audit page and wire the timeline View link</name>
  <files>app/(app)/admin/projects/[id]/audit/page.tsx, app/(app)/admin/timeline/page.tsx</files>
  <action>
    Create app/(app)/admin/projects/[id]/audit/page.tsx as a server component with `export const dynamic = 'force-dynamic'`. Signature takes `params: Promise<{ id: string }>` and awaits it (verify this convention against node_modules/next/dist/docs/ and the checklists/[slug]/[submissionId] page). First line of the body: `await requireRole('super_admin')` — this is the real gate (operations must be forbidden here even though they can reach the timeline). Then call getProjectAudit(id) from lib/project-audit.ts.

    Render: a back link to /admin/timeline; a project header block (name, customer name, location, current step, payment status, delivery date — mirror the muted-label styling used on the readiness/users pages). Then a single table inside a `overflow-x-auto` container (mirror the rounded-border/shadow card + `bg-gray-50` uppercase header styling from the timeline and users tables) with one row per live step in order. Columns: step # + label; officer (name + position label); completed at; answer/decision; upload; approval parties (sent by / received by); assignment (assigned user). For the upload cell: when `isImage`, render a base64 `<img>` thumbnail with a max-height and wrap it in an anchor to the same data URL with target="_blank" so it opens full size (include the `{/* eslint-disable-next-line @next/next/no-img-element */}` comment, mirroring the readiness page); when the upload exists but is not an image, render the filename text only (never a clickable data: link). Steps with status 'not_started' render as a muted row (e.g. text-gray-400) so the whole 22-step frame is visible.

    Checklist submissions per step: render them beneath/within the step's row using native `<details>/<summary>` (no client component) — summary shows the checklist definition title + submittedBy + submittedAt; the expanded body shows a nested list/table of item label -> value (or textValue)/notes and a flex-wrap grid of form-level photo thumbnails (reuse the readiness photoData thumbnail grid styling). If a step has no checklist submissions, render nothing for that sub-section.

    Then edit app/(app)/admin/timeline/page.tsx: add a per-row "View" link to `/admin/projects/${p.id}/audit`, rendered ONLY when the timeline's `role === 'super_admin'` (the page already has `role` from requireAdmin; do not change the page's own requireAdmin gate). Place it in the Project cell (near the History details) or a new trailing cell — keep it an unobtrusive `text-primary` anchor consistent with the existing timeline links. Do not otherwise alter timeline behavior.

    Keep everything server-rendered; add no new client components and no new dependencies.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm test && npm run build</automated>
  </verify>
  <done>The audit route exists and is gated by requireRole('super_admin'); the timeline shows a View link only for super_admin; tsc, lint, test suite, and build all pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> audit page (server component) | An authenticated user requests /admin/projects/[id]/audit; the page exposes ALL recorded project data (answers, uploads, officer identities). |
| stored upload data URL -> rendered DOM | uploadData / photoData are user-supplied base64 data URLs surfaced to the super admin's browser. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bpp-01 | Information Disclosure / Elevation | audit page access | mitigate | Server-side `requireRole('super_admin')` as the first statement of the page body — operations and all lower roles are forbidden. Link visibility on the timeline is defense-in-depth only, never the gate. |
| T-bpp-02 | Elevation | timeline View link | mitigate | Link rendered only when `role === 'super_admin'`; but the authoritative check is T-bpp-01 on the target page. |
| T-bpp-03 | Cross-Site Scripting (Tampering) | rendering stored upload data URLs | mitigate | Render a data URL as `<img>` ONLY when it starts with `data:image/`; never emit a clickable `data:` anchor for non-image content (a `data:text/html` upload opened in a new tab would execute as the app origin's document). Non-image uploads show filename text only. |
| T-bpp-04 | Information Disclosure (IDOR) | getProjectAudit(projectId) | accept | Any projectId is viewable, by design — super admins have read-only oversight across ALL projects (STATE.md core value). No per-project ownership scoping needed. |
| T-bpp-SC | Tampering | npm/pip/cargo installs | accept | No package installs in this plan — pure queries + rendering against existing deps. |
</threat_model>

<verification>
- `npx tsc --noEmit` — clean (no type errors).
- `npm run lint` — clean.
- `npm test` (vitest run) — full suite green, including the new tests/lib/project-audit.test.ts.
- `npm run build` — succeeds.
- Manual sanity (optional, not required to pass): as super_admin the timeline shows a View link that opens the audit page; as operations the audit URL is forbidden.
</verification>

<success_criteria>
- Super admin can reach a per-project audit page via a timeline View button and see every live step in order with officer/position/time/answer/upload, approval parties, assignment, and checklist submissions with per-item answers and photo thumbnails.
- Unreached steps show as muted "Not started" rows across the full step frame.
- Operations (and any non-super_admin) are forbidden from the audit page server-side.
- Base64 image uploads render as thumbnails; non-image uploads show filename text only.
- Table scrolls horizontally on mobile; no schema/mutation/position-management changes were made.
- All four verification commands pass.
</success_criteria>

<output>
Create `.planning/quick/260714-bpp-super-admin-audit-view-screen-per-projec/260714-bpp-SUMMARY.md` when done.
</output>
