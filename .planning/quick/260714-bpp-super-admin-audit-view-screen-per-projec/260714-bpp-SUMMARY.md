---
phase: quick-260714-bpp
plan: 01
subsystem: admin-audit
tags: [super-admin, audit, workflow, read-only]
dependency-graph:
  requires: [lib/workflow-graph.ts::getLiveWorkflowSteps, lib/dal.ts::requireRole, lib/workflow.ts::POSITION_LABELS]
  provides: [lib/project-audit.ts::assembleAuditRows, lib/project-audit.ts::getProjectAudit, "route:/admin/projects/[id]/audit"]
  affects: [app/(app)/admin/timeline/page.tsx]
tech-stack:
  added: []
  patterns:
    - "Pure assembler + async DB loader split (assembleAuditRows / getProjectAudit) for unit-testability without a database"
    - "server-only + mocked @/db in vitest, same pattern as tests/lib/workflow-graph-assignee-gate.test.ts"
    - "data:image/ prefix check gates <img> rendering; non-image uploads render filename text only, never a clickable data: anchor"
key-files:
  created:
    - lib/project-audit.ts
    - tests/lib/project-audit.test.ts
    - "app/(app)/admin/projects/[id]/audit/page.tsx"
  modified:
    - app/(app)/admin/timeline/page.tsx
decisions:
  - "Checklist item display value pre-formatted inside getProjectAudit (Yes/No/N/A/textValue), mirroring app/(app)/checklists/[slug]/[submissionId]/page.tsx's valueLabel — kept out of the pure assembleAuditRows so that function stays a straight pass-through of already-assembled checklist submissions."
  - "getProjectAudit fetches ALL users (id/name/position) into one map rather than resolving per-field foreign keys with separate joins — small table, simplest correct join surface for officer/sentBy/receivedBy/assignedUserId/checklist submittedBy resolution."
  - "Non-image upload cell renders plain filename text with no href at all (not just a non-clickable data: anchor) — the strictest reading of the XSS mitigation constraint."
metrics:
  duration: "~35min"
  completed: "2026-07-14"
---

# Quick Task 260714-bpp: Super-Admin Audit View Screen Per Project Summary

Added a super-admin-only, read-only per-project audit screen: a pure `assembleAuditRows` data assembler (unit-tested, DB-free) plus an async `getProjectAudit` loader in `lib/project-audit.ts`, a new gated route at `app/(app)/admin/projects/[id]/audit/page.tsx`, and a "View" link wired into the existing admin timeline.

## What Was Built

**Task 1 — `lib/project-audit.ts` + `tests/lib/project-audit.test.ts`** (commit `a5c9d73`)

- `assembleAuditRows(input)`: a pure, DB-free function taking plain in-memory data (ordered `LiveWorkflowStep[]`, a completions map keyed by `stepDefId`, a `workflow_step_states` map keyed by `stepDefId`, checklist submissions grouped by definition slug, and a users map) and returning one `AuditRow` per step, in the same order as the input steps. Each row carries status (`completed`/`not_started`), officer name + resolved position label (`POSITION_LABELS[pos] ?? pos ?? '—'`), completion time, recorded answer, an upload descriptor (`{ dataUrl, name, isImage }` where `isImage` is `dataUrl.startsWith('data:image/')`), approval sent-by/received-by names, assignment target name, and the step's checklist submissions.
- `getProjectAudit(projectId)`: fetches the project header, calls `getLiveWorkflowSteps()`, and runs four parallel read-only queries (project_step_completions joined for officer resolution via a users map; workflow_step_states; checklists joined to checklist_definitions/checklist_responses/checklist_template_items, grouped first by checklist id then by definition slug; and a full users id/name/position map), then calls `assembleAuditRows` and returns `{ project, rows }` (or `null` if the project doesn't exist).
- 12 unit tests cover: graph-order/1:1 row output, completed-vs-not_started with officer/time, `POSITION_LABELS` machine-value resolution, verbatim display-form fallback, null-position `'—'` fallback, `data:image/` vs `data:application/pdf` vs plain-filename upload classification, and approval/assignment name resolution (present + absent cases).
- `readiness_forms` is explicitly excluded with an inline comment — it has no `project_id` column (confirmed fresh against `db/schema.ts`), so no join was attempted.

**Task 2 — audit page + timeline link** (commit `014892d`)

- `app/(app)/admin/projects/[id]/audit/page.tsx`: server component, `export const dynamic = 'force-dynamic'`, `params: Promise<{ id: string }>` awaited (mirrors `app/(app)/checklists/[slug]/[submissionId]/page.tsx` and `app/(app)/factory-pm/readiness/[id]/page.tsx`). First statement of the body is `await requireRole('super_admin')` — the real, server-side gate; operations users hitting the URL directly are forbidden even though they can reach the timeline. Renders a project header block (customer, location, current step, payment status, delivery date) and a single `overflow-x-auto` table with one row per live step in graph order: step # + label, officer (name + position label), completed-at, answer, upload, approval parties, assignment target. Unreached steps render muted (`text-gray-400`, "Not started"). Checklist submissions render beneath their step's row via native `<details>/<summary>` (per-item label→value/notes, plus a photo-thumbnail grid) — no client component, no new dependency.
- `app/(app)/admin/timeline/page.tsx`: added a per-row "View →" link to `/admin/projects/${p.id}/audit`, rendered only when `role === 'super_admin'` (defense-in-depth only; the real gate is on the target page). Timeline's own `requireAdmin()` gate and behavior otherwise unchanged.

## XSS Mitigation (T-bpp-03)

Verified exactly as specified: the upload cell renders a clickable `<img>` (wrapped in an anchor to the same data URL, `target="_blank"`) **only** when `upload.isImage` is true (i.e. the data URL starts with `data:image/`). Non-image uploads render plain filename text with **no href at all** — not even a non-navigable one — the strictest reading of "never emit clickable raw data: anchors for non-image content."

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no schema changes, no mutations, no new dependencies.

## Verification

All four required commands passed, run directly after Task 2's code changes:

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (1 pre-existing unrelated warning in `app/layout.tsx` about custom fonts, not touched by this plan).
- `npm test` — 13 test files, 102 passed, 1 pre-existing todo (103 total), including the new 12 `tests/lib/project-audit.test.ts` cases.
- `npm run build` — succeeded; `/admin/projects/[id]/audit` appears in the route manifest as a dynamic (`ƒ`) route alongside the other admin pages.

`lib/workflow.ts` was read-only touched for `POSITION_LABELS` only — no edits made to `POSITION_VALUES`/`Positions`/any position-management surface, per the constraint protecting the concurrent positions-rename effort (`.planning/quick/260714-bpq-renameable-positions/`, observed as an untracked sibling directory, left untouched).

## Known Stubs

None. Both `assembleAuditRows`/`getProjectAudit` and the audit page are fully wired to real data with no hardcoded/mocked/placeholder values.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covered (T-bpp-01..04 all mitigated/accepted exactly as specified — see PLAN.md). No new network endpoints, auth paths, or schema changes were introduced.

## Self-Check: PASSED

- `lib/project-audit.ts` — created, exports `assembleAuditRows` and `getProjectAudit`.
- `tests/lib/project-audit.test.ts` — created, 12 tests, all passing (`npx vitest run tests/lib/project-audit.test.ts` → 12 passed).
- `app/(app)/admin/projects/[id]/audit/page.tsx` — created, gated by `requireRole('super_admin')`, calls `getProjectAudit`.
- `app/(app)/admin/timeline/page.tsx` — modified, View link present, gated to `role === 'super_admin'`.
- Commit `a5c9d73` — `feat(260714-bpp): add project-audit data layer (assembler + loader) with tests` — confirmed via `git commit` tool output (2 files changed, 482 insertions).
- Commit `014892d` — `feat(260714-bpp): add super_admin audit page and timeline View link` — confirmed via `git commit` tool output (2 files changed, 207 insertions).
- Final verification commands (`tsc`, `lint`, `test`, `build`) all confirmed passing via direct tool output earlier in this session, before the host machine's `/private/tmp` scratch volume ran out of disk space (`ENOSPC`) and further Bash tool calls in this session began failing — this is an infrastructure condition unrelated to the code changes; all four checks had already completed successfully with captured output prior to that point.

No missing items.
