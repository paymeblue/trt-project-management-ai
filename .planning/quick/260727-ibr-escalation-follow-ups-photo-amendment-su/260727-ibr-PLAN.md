---
phase: quick-260727-ibr
plan: 01
type: execute
wave: 1
depends_on: [quick-260727-gow]
files_modified:
  - lib/photo-limits.ts
  - actions/checklists.ts
  - actions/escalation.ts
  - app/_components/escalation-amend-panel.tsx
  - app/(app)/disputes/[projectId]/page.tsx
  - tests/actions/escalation-amend.test.ts
  - scripts/backfill-step-escalations.ts
autonomous: true
requirements: [IBR-A-photo-amend, IBR-B-legacy-backfill]

must_haves:
  truths:
    - "A supervisor opening an escalation panel sees the amended submission's existing photos as read-only thumbnails."
    - "A supervisor can attach new photos in the panel and, after Save, those photos are stored on the same checklists row."
    - "Saving an amendment never removes or replaces a previously stored photo — photoData only grows."
    - "An oversized photo data URL is rejected server-side with a user-visible message, independent of the client."
    - "Escalations that existed only as notifications rows before the feature shipped appear as actionable step_escalations rows after the backfill runs."
    - "The backfill skips (with a printed reason) any legacy escalation whose checklist/step/target-position cannot be derived, and never double-inserts one already covered by the new write path."
  artifacts:
    - path: "lib/photo-limits.ts"
      provides: "Shared MAX_PHOTO_DATA / MAX_AMEND_PHOTOS caps importable by both server actions"
      contains: "MAX_PHOTO_DATA"
    - path: "actions/escalation.ts"
      provides: "Append-only photo persistence in amendEscalatedChecklistAction + photos in loadEscalationPanelData"
      contains: "photoData"
    - path: "app/_components/escalation-amend-panel.tsx"
      provides: "Existing-photo thumbnails (read-only) + add-photo capture via readUploadFile"
      contains: "readUploadFile"
    - path: "scripts/backfill-step-escalations.ts"
      provides: "Dry-run-by-default backfill of pre-feature escalations from notifications"
      contains: "--apply"
    - path: "tests/actions/escalation-amend.test.ts"
      provides: "Coverage for append-never-replace + server-side size cap rejection"
      contains: "photoData"
  key_links:
    - from: "app/_components/escalation-amend-panel.tsx"
      to: "amendEscalatedChecklistAction"
      via: "newPhotos passed in the action input"
      pattern: "newPhotos"
    - from: "app/(app)/disputes/[projectId]/page.tsx"
      to: "EscalationAmendPanel"
      via: "existingPhotos prop sourced from loadEscalationPanelData"
      pattern: "existingPhotos"
    - from: "scripts/backfill-step-escalations.ts"
      to: "lib/escalation.ts"
      via: "escalationTargetPosition import (no re-derivation of routing rules)"
      pattern: "escalationTargetPosition"
---

<objective>
Two follow-ups to the escalation amend feature (quick task 260727-gow):

**A.** The supervisor amend panel currently edits value/textValue/notes only and is explicitly forbidden from touching `checklists.photoData`. Relax that to APPEND-ONLY: show the existing photos read-only, let the supervisor add new ones, and persist by appending. Existing entries are evidence and are never removed or overwritten.

**B.** Escalations raised before 260727-gow shipped exist only as `notifications` rows and are therefore invisible/unactionable on the dispute page. Add a dry-run-by-default backfill script that reconstructs `step_escalations` rows from those notifications, skipping anything it cannot derive exactly, then run it against the live DB.

Purpose: close the evidence gap (a supervisor correcting a record must be able to attach the proof) and make the ~3 legacy escalations actionable instead of stranded.
Output: append-only photo path (server + client + tests), a backfill script, and live inserted rows reported back.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md
@.planning/STATE.md

@actions/escalation.ts
@app/_components/escalation-amend-panel.tsx
@lib/read-upload-file.ts
@lib/escalation.ts
</context>

<interfaces>
<!-- Extracted from the codebase. Use these directly; no exploration needed. -->

`actions/checklists.ts` (line 46) — module-private today, NOT exported (a `'use server'`
file may only export async functions, so it cannot be exported from there):
```
const MAX_PHOTO_DATA = 1_500_000 // ~1.5MB per downscaled data URL
```
Used at lines 107 and 126 as `p.length > MAX_PHOTO_DATA` -> `{ status: 'error', message: 'One of the photos is too large. Please retake it.' }`.
Stored at line 199 as `photoData: allPhotos.length > 0 ? allPhotos : null`.

`db/schema.ts` (line 273): `photoData: text('photo_data').array()` on `checklists` — nullable text[] of base64 data URLs.

`lib/read-upload-file.ts`:
```ts
export const MAX_PDF_BYTES: number
export class UploadFileError extends Error {}
export async function readUploadFile(file: File, imageMax = 1280, imageQuality = 0.8): Promise<string>
```

`lib/escalation.ts`:
```ts
export function escalationTargetPosition(role: UserRole): string | null
export function canAmendEscalation(role: UserRole, viewerPosition: string | null | undefined, targetPosition: string): boolean
```

`actions/escalation.ts` current types:
```ts
export type EscalationPanelRow = { id, projectId, stepN, checklistSlug, checklistLabel, reason,
  targetPosition, createdAt, canAmend, definitionName, items, hasSubmission,
  initialAnswers, amendedByName, amendedAt }
export type AmendEscalatedChecklistInput = { escalationId: string; answers: Record<string, ChecklistAnswer> }
```

`db/schema.ts` step numbering: `workflowStepDefinitions.orderIndex` IS the step number
(`lib/workflow-graph.ts:86` maps `n: g.orderIndex`). `workflowStepDefinitions.checklistSlug`
mirrors `checklistDefinitions.slug`. Rows are scoped by `graph` ('live' | 'test').

`db/schema.ts` `stepEscalations` insert shape:
```
{ projectId, stepN, checklistSlug, checklistLabel, reason, targetPosition, createdBy, createdAt }
```

`db/schema.ts` `notifications`: `{ recipientId, type, title, body, projectId, callId, actorId, readAt, createdAt }`.

Legacy escalation notification shape written by `escalateChecklistAction` (pre-260727-gow, unchanged):
- `type = 'escalation'`
- `title = "Escalation from ${userRoleLabel(role)}: ${checklistLabel} on ${project.name}"`
- `body = reason || 'No additional details provided.'`
- `actorId = escalating user`, one row per recipient.

Script conventions (see `scripts/fix-notification-position-scoping.ts`): dense header comment
explaining root cause + idempotency, then
```ts
import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '../db/schema'
config({ path: '.env.local' })
const db = drizzle(neon(process.env.DATABASE_URL!), { schema })
```
Run with `npx tsx scripts/<name>.ts`. `lib/escalation.ts` has NO `server-only` import
(it only pulls `lib/workflow.ts`, which is explicitly client-safe), so the
`node:module._load` shim used by `scripts/verify-live-workflow.ts` is NOT needed here —
a plain relative import of `../lib/escalation` works under tsx.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Append-only photo persistence in the escalation server action</name>
  <files>lib/photo-limits.ts, actions/checklists.ts, actions/escalation.ts, tests/actions/escalation-amend.test.ts</files>
  <behavior>
    - Amend path with an existing submission that already has photos: saving with `newPhotos: ['data:image/jpeg;base64,NEW']` results in an update whose `photoData` equals `[...existing, 'data:image/jpeg;base64,NEW']` — same length + 1, existing entries byte-identical and still first.
    - Amend path with `newPhotos: []` (or omitted): the `checklists` update payload does NOT include a `photoData` key at all (no null/[] churn on a row that already holds evidence).
    - Amend path where `existing.photoData` is null and one new photo is supplied: `photoData` becomes a one-element array.
    - Create-from-blank path with new photos: the inserted `checklists` row carries `photoData` = the new photos; with none, `photoData` stays null.
    - A new photo whose data URL length exceeds MAX_PHOTO_DATA returns `{ ok: false }` with a "too large" message and performs ZERO writes (no insert, no update).
    - More than MAX_AMEND_PHOTOS new photos in one save returns `{ ok: false }` and performs zero writes.
    - The existing module-boundary test still passes: `actions/escalation.ts` source contains no `completeGraphStep` / `advanceOrConfirmDualRole` reference.
  </behavior>
  <action>
Create `lib/photo-limits.ts` (plain module, no `'use server'`, no `server-only`) exporting
`MAX_PHOTO_DATA = 1_500_000` and `MAX_AMEND_PHOTOS = 6`. Header comment: the cap previously
lived as a module-private const inside `actions/checklists.ts` and could not be exported from
there (a `'use server'` file may only export async functions); two independent write paths now
persist into `checklists.photoData`, so the cap is hoisted here to make drift impossible.
`MAX_AMEND_PHOTOS = 6` mirrors the wizard's per-submission cap in `checklist-wizard.tsx`.

In `actions/checklists.ts`, delete the local `const MAX_PHOTO_DATA` (line 46) and import it from
`@/lib/photo-limits`. Do not change any comparison, message, or storage behavior — this is a
pure move.

In `actions/escalation.ts`:
1. Add `newPhotos?: string[] | null` to `AmendEscalatedChecklistInput`. Document that it is
   ADDITIVE ONLY — there is deliberately no "remove photo" or "replace photos" input, because a
   supervisor amending a subordinate's record must never be able to destroy the subordinate's
   photographic evidence. Deletion, if ever needed, is an admin/DB-level action with its own audit.
2. Sanitize server-side BEFORE any write, and return early on violation so the zero-writes
   invariant holds: coerce to an array of strings, drop empties, reject when
   `photos.length > MAX_AMEND_PHOTOS` ("You can attach up to 6 photos at a time.") and when any
   `p.length > MAX_PHOTO_DATA` (reuse the exact wording from `submitChecklist`: "One of the photos
   is too large. Please retake it."). The client already downscales via `readUploadFile`, but a
   server action is a public HTTP endpoint — the client-side downscale is a UX affordance, not a
   control (T-ibr-01).
3. Amend path: read `existing.photoData` and, ONLY when `newPhotos.length > 0`, include
   `photoData: [...(existing.photoData ?? []), ...newPhotos]` in the `checklists` update `.set()`.
   When there are no new photos, omit the key entirely. Comment it explicitly: APPEND-ONLY,
   existing entries are never filtered, reordered, or overwritten — evidence integrity.
4. Create-from-blank path: set `photoData: newPhotos.length > 0 ? newPhotos : null` on the insert,
   matching `submitChecklist`'s shape.
5. Update the D-02 comment block above the amend path: it currently reads "MUST NOT modify
   `checklists.photoData` (D-02)". Amend it to state that photoData is now APPEND-ONLY as of
   260727-ibr, and that the rest of D-02 is unchanged (no step counter, no step-completion or
   state-tracking table, no completion-engine call). Keep the file free of completion-engine
   identifiers so 260727-gow's grep gate keeps passing.
6. Add `photos: string[]` to `EscalationPanelRow` and populate it from `submission.photoData ?? []`
   (empty array when there is no submission) so the panel can render read-only thumbnails.

Extend `tests/actions/escalation-amend.test.ts` with a new `describe` block for the photo path,
reusing the existing `rowsQuery` / hoisted-mock harness and the `EXISTING_CHECKLIST` fixture
(add a variant carrying `photoData: ['data:image/jpeg;base64,OLD']`). Assert on
`updateSetMock` / `insertValuesMock` payloads per the behaviors above, and assert zero writes on
both rejection cases. Do not restructure the existing tests.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/actions/escalation-amend.test.ts && npx tsc --noEmit && ! grep -q 'completeGraphStep\|advanceOrConfirmDualRole' actions/escalation.ts && echo GATE_OK</automated>
  </verify>
  <done>All escalation-amend tests pass including the new photo block; tsc clean; the grep gate prints GATE_OK; `actions/checklists.ts` no longer declares its own MAX_PHOTO_DATA.</done>
</task>

<task type="auto">
  <name>Task 2: Existing-photo thumbnails + add-photo capture in the amend panel</name>
  <files>app/_components/escalation-amend-panel.tsx, app/(app)/disputes/[projectId]/page.tsx</files>
  <action>
In `app/_components/escalation-amend-panel.tsx`:
1. Add an `existingPhotos: string[]` prop and a `newPhotos` state array. Import `readUploadFile`
   and `UploadFileError` from `@/lib/read-upload-file` and `MAX_AMEND_PHOTOS` from
   `@/lib/photo-limits`.
2. Render an "Photo evidence" block inside the expanded panel, below the items fieldset and above
   the amended-by line. When `existingPhotos.length > 0`, render them as 64px read-only
   thumbnails (`<img src={p} className="h-16 w-16 rounded-md border border-gray-200 object-cover" />`
   with the `{/* eslint-disable-next-line @next/next/no-img-element */}` comment used by
   `checklist-wizard.tsx`) under a caption like "Submitted evidence ({n})". These have NO remove
   button — comment why: existing evidence is immutable from this panel by design (the server
   action has no delete path either).
3. When `canAmend`, render an "Add photo" `<label>` + hidden `<input type="file" accept="image/*"
   multiple>` mirroring the wizard's markup. On change, iterate files, stop at
   `MAX_AMEND_PHOTOS`, `await readUploadFile(file)` (client-side downscale), append to `newPhotos`,
   and reset `e.target.value = ''` so the same file can be re-picked. Catch `UploadFileError` (and
   anything else) into a local error string rendered in `text-error`. Newly added (not yet saved)
   photos DO get a remove button — they are only in local state; removing one before save is not
   evidence destruction. Label that group distinctly (e.g. "New — not yet saved").
4. Pass `newPhotos` in the `amendEscalatedChecklistAction` call inside `useActionState`. After a
   successful save (`state.ok`), clear `newPhotos` so a second Save cannot re-append the same
   images. Guard on the action result, not optimistically.
5. Keep the whole photo block inside the `definitionName` branch (an escalation with no checklist
   content has no submission to attach evidence to).

In `app/(app)/disputes/[projectId]/page.tsx`, pass `existingPhotos={row.photos}` to
`EscalationAmendPanel`. No other changes to that page.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>tsc and lint clean; the panel renders existing photos read-only (no remove control in that group) and sends `newPhotos` to the action, clearing them only on `state.ok`.</done>
</task>

<task type="auto">
  <name>Task 3: Legacy escalation backfill script, run dry-run then --apply</name>
  <files>scripts/backfill-step-escalations.ts</files>
  <action>
Create `scripts/backfill-step-escalations.ts` following `scripts/fix-notification-position-scoping.ts`'s
conventions (dotenv `.env.local`, `neon` + `drizzle-orm/neon-http`, `import * as schema from
'../db/schema'`, dense header comment, `npx tsx` entrypoint). Import `escalationTargetPosition`
from `../lib/escalation` — never re-derive the routing table.

Header comment must state: escalations raised before quick task 260727-gow wrote no
`step_escalations` row, so they exist only as `notifications` (type='escalation', one row per
recipient) and are invisible to the dispute page's amend panel. This script reconstructs the
missing durable rows. It is ADDITIVE ONLY — it inserts, never updates or deletes.

Behavior:
1. Select all `notifications` with `type = 'escalation'` and a non-null `projectId`. Group into
   distinct escalations by `(projectId, actorId, title)`, keeping the MIN `createdAt` and the
   `body` of the group (the fan-out wrote identical rows per recipient; the group is one real
   escalation).
2. For each group, derive and print. Any failed derivation is a SKIP with a printed reason —
   never a guess, never a partial insert:
   - Project name: look up `projects.name` by `projectId`. Missing -> skip.
   - `checklistLabel`: take the title substring after the FIRST `': '`, then strip the exact
     trailing `' on ' + project.name` suffix. If that suffix is not present verbatim, skip
     (`title does not end with " on <projectName>"`) — do not regex-guess the boundary, project
     names can contain " on ".
   - `checklistSlug`: match `checklist_definitions.name` exactly; if no exact match, retry
     case-insensitively. No match -> skip.
   - `stepN` + step label: the `workflow_step_definitions` row with `graph = 'live'` and
     `checklist_slug = slug`; `stepN = orderIndex`. Zero matches -> skip. More than one match ->
     skip (ambiguous), printing the candidates.
   - `targetPosition`: `escalationTargetPosition(users.role)` for the group's `actorId`. Null
     actor, missing user, or null target -> skip.
   - `reason`: the notification `body`, mapped back to `null` when it is exactly the sentinel
     `'No additional details provided.'` that `escalateChecklistAction` substitutes for an empty
     reason — otherwise the backfilled row would claim a reason the escalator never typed.
3. Dedupe guard (runs before every insert, and is also evaluated in dry-run so the printout is
   truthful): skip when a `step_escalations` row already exists for the same
   `(projectId, createdBy)` with `createdAt` within +/-5 minutes of the notification's timestamp,
   OR an exact `(projectId, stepN, createdBy, reason)` match. Comment why the time window exists:
   the new write path inserts the `step_escalations` row and the notifications in the same request,
   so timestamps are near-identical but not equal. A live survey found 3 distinct escalation
   groups, 1 of which (Factory Manager Readiness Forms, 2026-07-27T10:31:04Z) already has a row
   from the new write path and MUST be skipped here.
4. `--apply` in `process.argv` performs the inserts; without it the script is a DRY RUN that
   prints exactly what it would insert and exits 0 without writing. Print the mode banner
   ("DRY RUN — no writes" / "APPLY — inserting") as the first line so a run is never ambiguous
   in scrollback. Inserts preserve `createdAt` from the notification (the escalation's real time,
   not the backfill's).
5. End with a summary: total groups, inserted, skipped-by-dedupe, skipped-by-derivation (with
   reasons already printed inline). After `--apply`, also print `SELECT count(*) FROM
   step_escalations` so the post-state is in the run log.

Then RUN it (live DB, explicitly authorized — inserts only, additive, low risk):
first `npx tsx scripts/backfill-step-escalations.ts` (dry run), review the derived rows, then
`npx tsx scripts/backfill-step-escalations.ts --apply`. Report the derived rows, the skip reasons,
the inserted rows, and the before/after `step_escalations` count in the summary. If the dry run
shows an unexpected derivation (e.g. a label that does not match the surveyed 3 groups), STOP and
report rather than applying.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npx tsx scripts/backfill-step-escalations.ts && npx tsx scripts/backfill-step-escalations.ts --apply && npx tsx scripts/backfill-step-escalations.ts</automated>
  </verify>
  <done>Dry run prints derived rows + skip reasons and writes nothing; `--apply` inserts the derivable legacy escalations with preserved `createdAt`; the third (re-run dry) invocation reports 0 pending inserts, proving idempotency via the dedupe guard. Inserted rows and the post-apply count are reported in the summary.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> `amendEscalatedChecklistAction` | Server Actions are public HTTP endpoints; `newPhotos` is fully attacker-controlled (size, count, content) regardless of what the panel sends |
| operator shell -> live Postgres | The backfill writes to production data with no application-layer validation in front of it |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ibr-01 | Denial of Service | `amendEscalatedChecklistAction` `newPhotos` | mitigate | Server-side `MAX_PHOTO_DATA` per-entry and `MAX_AMEND_PHOTOS` count checks run BEFORE any DB write and return early; the client downscale is UX only, never the control |
| T-ibr-02 | Tampering | `checklists.photoData` | mitigate | Append-only write (`[...existing, ...new]`); the action exposes no delete/replace input, so a supervisor cannot destroy a subordinate's evidence |
| T-ibr-03 | Elevation of Privilege | escalation amend authorization | accept (unchanged) | `canAmendEscalation` + fresh `users.position` read is untouched by this task; the photo path sits strictly behind that existing gate |
| T-ibr-04 | Tampering | `scripts/backfill-step-escalations.ts` | mitigate | Dry-run default; `--apply` opt-in; insert-only (no UPDATE/DELETE); skip-on-any-ambiguity; dedupe guard makes re-runs idempotent |
| T-ibr-05 | Information Disclosure | backfilled `reason` | mitigate | The `'No additional details provided.'` sentinel maps back to null so the row never asserts a reason the escalator did not write |
| T-ibr-SC | Tampering | package installs | accept | No new dependencies are added by this task — nothing to audit |
</threat_model>

<verification>
Run from `/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm`:

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npm test` — full vitest suite green (not just the escalation file).
4. `! grep -q 'completeGraphStep\|advanceOrConfirmDualRole' actions/escalation.ts` — 260727-gow's amend-only module boundary still holds.
5. `npx tsx scripts/backfill-step-escalations.ts` re-run after `--apply` reports zero pending inserts (idempotency proof) and the post-apply `step_escalations` count is reported.
</verification>

<success_criteria>
- The amend panel shows existing photos read-only and can attach new ones; saved photos append to `checklists.photoData` with existing entries untouched.
- Oversized or over-count photo payloads are rejected server-side with zero DB writes, covered by tests.
- Legacy escalations are backfilled as `step_escalations` rows with preserved `createdAt`; every non-derivable group is skipped with a printed reason and nothing is guessed.
- The backfill is idempotent — a second run inserts nothing.
- tsc, lint, and the full test suite are green; the escalation module boundary gate still passes.
</success_criteria>

<output>
Create `.planning/quick/260727-ibr-escalation-follow-ups-photo-amendment-su/260727-ibr-SUMMARY.md` when done, including the backfill dry-run and `--apply` output (derived rows, skip reasons, inserted rows, before/after count).
</output>
</content>
</invoke>
