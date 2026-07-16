---
phase: quick-260716-hys
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/schema.ts
  - actions/readiness.ts
  - lib/project-audit.ts
  - app/(app)/admin/projects/[id]/audit/page.tsx
  - tests/lib/project-audit.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "readiness_forms table has a nullable project_id uuid FK column referencing projects.id"
    - "Historical readiness_forms rows remain project_id = null (no data altered)"
    - "New readiness submissions persist the caller's real projectId onto the row"
    - "Super-admin audit page shows Factory PM readiness form uploads (photos/signature/scan) under the materials_readiness step"
  artifacts:
    - path: "db/schema.ts"
      provides: "readinessForms.projectId nullable FK"
      contains: "projectId"
    - path: "lib/project-audit.ts"
      provides: "AuditReadinessSubmission type + readiness join/loader"
      contains: "readinessSubmissions"
    - path: "app/(app)/admin/projects/[id]/audit/page.tsx"
      provides: "Readiness submission rendering on audit page"
  key_links:
    - from: "actions/readiness.ts"
      to: "readiness_forms.project_id"
      via: "db.insert values projectId"
      pattern: "projectId"
    - from: "lib/project-audit.ts"
      to: "readinessForms.projectId"
      via: "eq(readinessForms.projectId, projectId) query"
      pattern: "readinessForms"
---

<objective>
Close the KNOWN LIMITATION gap in lib/project-audit.ts: readiness_forms rows are structurally invisible on the super-admin project audit view because the table has no project FK. Add a nullable project_id column, persist it on new submissions, join it into the audit loader, and render it on the existing audit page.

Purpose: Factory PM's signed Materials/Accessories Readiness form uploads (2+ photos plus a signature or scan) currently show NO assets on /admin/projects/[id]/audit for step 17 (materials_readiness). This makes the audit view data-incomplete for the Factory PM half of that dual-role step.
Output: Migrated schema, persisted FK on new rows, readiness submissions surfaced on the audit page, extended unit test, full verification sweep.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Existing readinessForms table (db/schema.ts ~479). Add projectId after createdBy. -->
readiness_forms columns: id, createdBy (FK users.id, notNull), mode, project (free text — NOT a real FK, leave as-is), unit, materialControl, accessories, upholstery, confirmedBy, signedDate, signatureData, uploadData (legacy single scan), uploadName, photoData (text[] — required photos), createdAt.

<!-- Conventional nullable projectId FK, mirror checklists table (db/schema.ts:263): -->
checklists.projectId = uuid('project_id').references(() => projects.id)  // nullable, no cascade

<!-- submitReadinessAction (actions/readiness.ts:89) already receives input.projectId; used today only for advanceOrConfirmDualRole. Add projectId to the db.insert(readinessForms).values({...}) object. -->

<!-- lib/project-audit.ts: assembleAuditRows is PURE (no DB). getProjectAudit loader does a Promise.all of [completionRows, stateRows, checklistRows, allUsers]. usersById map is built from allUsers. Steps carry kind = LiveWorkflowStep['kind'] (fulfillmentKind); 'readiness' is a valid kind, currently only the materials_readiness step uses it. -->

<!-- Audit page: ChecklistSubmissionDetails component (page.tsx:15-46) = <details>/<summary> + fields + photo grid. UploadCell (page.tsx:48-66) has the T-bpp-03 safety note: non-image data: uploads render as filename text only, never a clickable link. AuditTableRow renders a colSpan={7} sibling row for checklistSubmissions.length > 0. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add nullable project_id to readiness_forms, push, and persist it on new submissions</name>
  <files>db/schema.ts, actions/readiness.ts</files>
  <action>
In db/schema.ts, add `projectId: uuid('project_id').references(() => projects.id),` to the `readinessForms` table (~line 479), placed right after the `createdBy` column, mirroring the nullable style of `checklists.projectId` (line 263) — nullable (no `.notNull()`, no `onDelete`). Historical rows stay null forever; no backfill (the existing free-text `project` column is not a reliable join key).

Push the additive change to the live Neon DB with `npm run db:push`. This is a purely additive nullable-column change (zero data loss). Run it once. If it hangs on an interactive prompt (no TTY), it will fail/timeout rather than succeed silently — in that case re-run with `npx drizzle-kit push --force --verbose` and inspect the printed diff: it MUST show ONLY a single `ALTER TABLE readiness_forms ADD COLUMN project_id ...` statement. STOP and report if the diff shows anything else changed or any column/table would be dropped. Do not run db:push more than necessary.

CRITICAL (per STATE.md 2026-07-11 Phase 19-01 process note): drizzle-kit push diffs the local schema.ts against the shared live DB and is not git-branch-aware. You are the only executor touching db/schema.ts this session. If the live DB already differs from the expected pre-change state before you push, STOP and report rather than pushing blindly.

After a successful push, write a throwaway read-only inspection script (pattern scripts/tmp-*.ts, using dotenv + @neondatabase/serverless + drizzle-orm/neon-http, mirroring scripts/inspect-factory-pm-gap.ts). Query information_schema (or a simple select) to confirm: readiness_forms.project_id exists, is nullable (uuid), and existing rows show null. Run it with `npx tsx`, confirm output, then delete the script.

In actions/readiness.ts, inside `submitReadinessAction`, add `projectId: input?.projectId ? String(input.projectId) : null,` to the existing `db.insert(readinessForms).values({...})` object (~line 89). This is the ONLY change to this file — leave the advanceOrConfirmDualRole call and everything else exactly as-is.
  </action>
  <verify>
    <automated>npx drizzle-kit push --verbose 2>&1 | grep -iE "no changes|nothing to|up to date" && npx tsc --noEmit</automated>
  </verify>
  <done>readiness_forms has a nullable project_id uuid FK live; a second db:push reports a no-op; existing rows unchanged (project_id null); submitReadinessAction persists projectId on new rows; tsc clean; inspection script deleted.</done>
</task>

<task type="auto">
  <name>Task 2: Join readiness submissions into the audit loader and render them on the audit page</name>
  <files>lib/project-audit.ts, app/(app)/admin/projects/[id]/audit/page.tsx, tests/lib/project-audit.test.ts</files>
  <action>
In lib/project-audit.ts:
1. Import `readinessForms` from '@/db/schema' and (if not present) `asc`/`eq` are already imported.
2. Add an `AuditReadinessSubmission` type: `{ mode: string; submittedBy: string | null; submittedAt: Date; confirmedBy: string | null; signedDate: string | null; signatureData: string | null; uploadData: string | null; uploadName: string | null; photos: string[] }`.
3. Add `readinessSubmissions: AuditReadinessSubmission[]` to the `AuditRow` type.
4. Add `readinessSubmissionsForProject: AuditReadinessSubmission[]` to `AssembleAuditRowsInput`.
5. In the pure `assembleAuditRows` map, set `readinessSubmissions: step.kind === 'readiness' ? readinessSubmissionsForProject : []`. Add a brief comment noting only one live step (materials_readiness) uses kind 'readiness' today; if a future step also uses it, per-step disambiguation would be needed — do not build that generality now.
6. In `getProjectAudit`, add a 4th (well, additional) parallel query to the existing `Promise.all([...])` selecting from `readinessForms` where `eq(readinessForms.projectId, projectId)` ordered by `asc(readinessForms.createdAt)`, selecting createdBy, mode, confirmedBy, signedDate, signatureData, uploadData, uploadName, photoData, createdAt. After building `usersById`, map those rows to `AuditReadinessSubmission` (submittedBy via usersById.get(createdBy)?.name ?? null, submittedAt = createdAt, photos = photoData ?? []). Pass the resulting array to `assembleAuditRows` as `readinessSubmissionsForProject`.
7. Replace the stale KNOWN LIMITATION comment (lines ~23-25) with an accurate note: readiness forms are now linked going forward via readiness_forms.project_id (added quick task 260716-hys); historical rows submitted before this migration remain unlinked (project_id IS NULL) since the pre-existing free-text `project` column cannot be reliably backfilled — a known, permanent, accepted gap for old data, not a bug.

In app/(app)/admin/projects/[id]/audit/page.tsx:
1. Import `AuditReadinessSubmission` alongside the existing type imports.
2. Add a `ReadinessSubmissionDetails` component mirroring `ChecklistSubmissionDetails` (lines 15-46) — a <details>/<summary> collapsible showing mode + submittedBy + submittedAt in the summary, then key-value fields (confirmedBy, signedDate), the signature image (if signatureData present, rendered like the photo grid <img>), the legacy upload (uploadData/uploadName — apply the EXACT T-bpp-03 UploadCell safety treatment: only render a data: upload inline as an <img> if it starts with 'data:image/', otherwise show uploadName as text only, never a clickable data: link), and the photos grid. Reuse the same Tailwind classes and the `eslint-disable-next-line @next/next/no-img-element` convention.
3. In `AuditTableRow`, add a sibling condition rendering the new component(s) when `row.readinessSubmissions.length > 0`, in the same colSpan={7} expandable-details area — as an ADDITION next to (not replacing) the existing checklistSubmissions block, so a step with both would show both.

In tests/lib/project-audit.test.ts: extend `emptyInput` to include `readinessSubmissionsForProject: []`, and add a test verifying `assembleAuditRows` attaches readinessSubmissionsForProject to a step with `kind: 'readiness'` and leaves a non-readiness step's `readinessSubmissions` as `[]`. Match the existing fixture/style conventions exactly.
  </action>
  <verify>
    <automated>npx vitest run tests/lib/project-audit.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Audit loader joins project-linked readiness_forms; assembleAuditRows attaches them only to readiness-kind steps; audit page renders readiness submissions (photos/signature/scan) with the T-bpp-03 safety treatment preserved; extended test passes; stale KNOWN LIMITATION comment replaced; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Full verification sweep</name>
  <files></files>
  <action>
Run the full-sweep discipline used in this session's earlier quick tasks: `npx tsc --noEmit`, `npm run lint`, and the full test suite `npx vitest run` (this task touched a shared type/loader). Confirm all green. If any check fails, fix the specific issue (do not touch out-of-scope files — actions/workflow.ts, actions/checklists.ts, and assignee-gating work are off-limits). Confirm no throwaway inspection script from Task 1 remains in the repo (`git status` should not show any scripts/tmp-*.ts).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npx vitest run</automated>
  </verify>
  <done>tsc, lint, and the full vitest suite all pass; no leftover throwaway scripts in git status; only the 5 intended files changed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client→submitReadinessAction | Untrusted form input (projectId, photos, signature) crosses into a Server Action |
| stored data→audit page render | Persisted readiness data URLs rendered into super-admin HTML |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hys-01 | Elevation of Privilege | audit page | accept | Page already gated by requireRole('super_admin'); no change to auth surface |
| T-hys-02 | Tampering (XSS-adjacent) | ReadinessSubmissionDetails render of uploadData/signatureData | mitigate | Reuse existing T-bpp-03 safety treatment: only render data: uploads inline as <img> when prefix is 'data:image/'; non-image uploads shown as filename text only, never a clickable data: link |
| T-hys-03 | Spoofing | submitReadinessAction projectId | accept | projectId persisted as-provided; step-linked submissions still authorized against the live workflow graph server-side (existing canActOnGraphStep + assignee gate, unchanged); audit view is read-only oversight, not an authorization decision |
| T-hys-SC | Tampering | npm/pip/cargo installs | mitigate | No new packages installed; all imports (readinessForms, drizzle helpers) already in the codebase |
</threat_model>

<verification>
- readiness_forms.project_id exists live, nullable, existing rows null (no data loss)
- Second db:push is a no-op (idempotent, additive)
- New readiness submissions persist projectId
- Audit page renders Factory PM readiness uploads under materials_readiness
- npx tsc --noEmit, npm run lint, npx vitest run all green
</verification>

<success_criteria>
- readiness_forms has a nullable project_id FK; no historical data altered
- submitReadinessAction persists the caller's projectId going forward
- /admin/projects/[id]/audit surfaces readiness form photos/signature/scan for readiness-kind steps
- Stale KNOWN LIMITATION comment replaced with an accurate going-forward note
- Extended unit test passes; full verification sweep green
- No new page/route/button added; historical rows not backfilled; out-of-scope files untouched
</success_criteria>

<output>
Create `.planning/quick/260716-hys-link-readiness-forms-to-projects-nullabl/260716-hys-SUMMARY.md` when done
</output>
