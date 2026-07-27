---
phase: quick-260727-gow
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/schema.ts
  - lib/escalation.ts
  - actions/escalation.ts
  - app/_components/escalate-button.tsx
  - app/(app)/checklists/[slug]/page.tsx
  - app/(app)/factory-pm/readiness/page.tsx
  - app/_components/escalation-amend-panel.tsx
  - app/(app)/disputes/[projectId]/page.tsx
  - tests/actions/escalation.test.ts
  - tests/actions/escalation-amend.test.ts
autonomous: true
requirements: [QT-260727-gow]

must_haves:
  truths:
    - "Escalating a checklist now persists a durable step_escalations row (project, stepN, checklist slug/label, reason, targetPosition captured at creation) in addition to the existing per-recipient notifications."
    - "On /disputes/{projectId}, a holder of the escalation's targetPosition (or an admin) sees the escalated checklist's template items pre-filled with the officer's latest recorded answers, editable inline."
    - "Saving the panel amends the existing submission in place when one exists, and creates a new submission when the officer left it blank."
    - "A non-admin viewer whose position differs from the escalation's targetPosition can read the dispute page but cannot save an amendment — the server action rejects them even if the request is forged."
    - "An amended submission shows 'Amended by <name>, <time>' in the panel."
    - "Amending never changes projects.currentStep, projectStepCompletions or workflowStepStates."
  artifacts:
    - path: "db/schema.ts"
      provides: "step_escalations table + checklists.amended_by / amended_at columns"
      contains: "stepEscalations"
    - path: "actions/escalation.ts"
      provides: "escalation persistence + amendEscalatedChecklistAction upsert"
      exports: ["escalateChecklistAction", "amendEscalatedChecklistAction", "loadEscalationPanelData"]
    - path: "lib/escalation.ts"
      provides: "pure canAmendEscalation authorization predicate"
      exports: ["canAmendEscalation"]
    - path: "app/_components/escalation-amend-panel.tsx"
      provides: "client editing panel rendered inline in the dispute thread"
    - path: "tests/actions/escalation-amend.test.ts"
      provides: "authorization + upsert-path coverage"
  key_links:
    - from: "app/(app)/disputes/[projectId]/page.tsx"
      to: "app/_components/escalation-amend-panel.tsx"
      via: "server-loaded escalation rows + items + latest answers passed as props"
      pattern: "EscalationAmendPanel"
    - from: "app/_components/escalation-amend-panel.tsx"
      to: "actions/escalation.ts"
      via: "amendEscalatedChecklistAction(getTabToken(), …)"
      pattern: "amendEscalatedChecklistAction"
    - from: "app/_components/escalate-button.tsx"
      to: "actions/escalation.ts"
      via: "checklistSlug + stepN threaded into escalateChecklistAction input"
      pattern: "checklistSlug"
---

<objective>
Escalations become actionable. Today an escalation writes only `notifications` rows — the
supervisor reads a sentence and has no way to act. This plan gives an escalation durable step
identity (`step_escalations`) and puts an inline editing panel on the dispute page so the
escalation's target superior (or an admin) can view and UPSERT the escalated step's checklist
content without leaving the thread.

Purpose: close the loop between "I flagged this" and "my superior fixed the record".
Output: additive schema, an authorization-gated upsert server action, an inline client panel on
`/disputes/{projectId}`, and tests over authorization + both upsert paths.

**User-locked decisions (do NOT revisit):**
- D-01 WHO may upsert: holders of the escalation's captured `targetPosition` PLUS `isAdminRole`
  (super_admin / operations). Nobody else.
- D-02 PAST-STEP semantics: AMEND RECORD ONLY. Editing a step the project has moved past rewrites
  the recorded content in place with an "amended by <name>" trail. `projects.currentStep`,
  `projectStepCompletions` and `workflowStepStates` are NEVER touched by this feature.
- D-03 SURFACE: INLINE on the dispute page. No linking out to the checklist wizard.

**Explicit out-of-scope boundaries (state them, do not build them):**
- Photo evidence editing. `checklists.photoData` is left untouched by the amend path. If existing
  photos are trivially renderable read-only in the panel, show them; otherwise omit entirely.
  Never delete or replace photo data.
- Backfill. Only escalations created AFTER this ships have a `step_escalations` row and are
  therefore actionable. Pre-existing escalations keep rendering as the read-only banner. Acceptable.
- The existing notifications-derived "ESCALATION / FLAG REASON" banner stays exactly as-is. The new
  panel is additive and keys off `step_escalations`, not off notifications.
- Readiness-form escalations (`/factory-pm/readiness`) have no checklist definition — `readinessForms`
  is a separate table. Those rows carry a null `checklistSlug` and render a "no inline checklist
  content for this escalation" note instead of an editor.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@db/schema.ts
@actions/escalation.ts
@lib/escalation.ts
@app/_components/escalate-button.tsx
@app/(app)/disputes/[projectId]/page.tsx
@actions/checklists.ts
@lib/dal.ts
@tests/actions/escalation.test.ts
@tests/actions/readiness.test.ts

<interfaces>
<!-- Extracted from the codebase. Use these directly — do not go exploring. -->

From `lib/dal.ts`:
```ts
export async function verifySessionForAction(explicitToken?: string | null): Promise<{ userId: string; role: Role }>
export { isAdminRole } // from lib/workflow
```

From `lib/workflow.ts`:
```ts
export function isAdminRole(role: UserRole): boolean   // true for super_admin | operations
export function userRoleLabel(role: string): string
export const Roles = { /* FactoryPm, SitePm, … */ }
```

From `lib/escalation.ts` (existing):
```ts
export const ESCALATION_TARGET_POSITION: Partial<Record<UserRole, string>>
export function escalationTargetPosition(role: UserRole): string | null
```

From `db/schema.ts` (existing, relevant columns only):
```ts
users            = { id, position: text('position') /* nullable */, name, … }
checklistDefinitions   = { id, slug (unique), name, targetRole, isActive, createdAt }
checklistTemplateItems = { id, definitionId, step, sectionTitle, sortOrder, label,
                           itemType: 'radio'|'text'|'file',
                           responseOptions: 'yes_no'|'yes_no_na',
                           isPhotoAllowed, isPhotoRequired, helpText, isActive }
checklists       = { id, definitionId, projectId, createdBy, status, submittedAt,
                     photoData: text[], createdAt, updatedAt }
checklistResponses = { id, checklistId, templateItemId,
                       value: 'yes'|'no'|'na'|null, textValue, notes, createdAt, updatedAt }
notifications    = { id, recipientId, type, title, body, projectId, callId, actorId, readAt, createdAt }
projectDisputes  = { id, projectId, authorId, body, createdAt }
```

From `actions/checklists.ts` (the answer shape to mirror):
```ts
type ResponseValue = 'yes' | 'no' | 'na'
export type ChecklistAnswer = { value?: ResponseValue | null; textValue?: string | null; notes?: string | null }
```

Client tab-token pattern (`app/_components/escalate-button.tsx`):
```ts
import { getTabToken } from '@/lib/use-tab-token'
useActionState(async (_prev, formData) => someAction(getTabToken(), { … }), INITIAL)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Persist escalation step identity (schema + capture at creation)</name>
  <files>db/schema.ts, lib/escalation.ts, actions/escalation.ts, app/_components/escalate-button.tsx, app/(app)/checklists/[slug]/page.tsx, app/(app)/factory-pm/readiness/page.tsx, tests/actions/escalation.test.ts</files>
  <behavior>
    - `canAmendEscalation('super_admin', null, 'head_of_projects')` → true (admin bypass, D-01).
    - `canAmendEscalation('operations', 'anything', 'head_of_projects')` → true (isAdminRole).
    - `canAmendEscalation('site_pm', 'head_of_projects', 'head_of_projects')` → true (position match).
    - `canAmendEscalation('site_pm', 'head_of_design', 'head_of_projects')` → false.
    - `canAmendEscalation('site_pm', null, 'head_of_projects')` → false (null position never matches).
    - `escalateChecklistAction` inserts exactly one `stepEscalations` row carrying projectId, stepN,
      checklistSlug, checklistLabel, reason and the resolved targetPosition, and still fans out one
      notification per recipient (existing tests must stay green unchanged).
    - When no one holds the target position, NO step_escalations row is written (early return is
      before the insert) — an unroutable escalation must not leave an orphan actionable row.
  </behavior>
  <action>
Add the additive schema, the pure authorization predicate, and escalation-creation persistence.

**1. `db/schema.ts`** — add a `stepEscalations` table near `projectDisputes` (place it directly
after `projectDisputes` so the dispute-adjacent tables sit together):

Columns: `id` uuid pk defaultRandom; `projectId` uuid notNull references `projects.id` onDelete
cascade; `stepN` integer NULLABLE; `checklistSlug` text NULLABLE; `checklistLabel` text notNull;
`reason` text; `targetPosition` text notNull; `createdBy` uuid references `users.id` onDelete
'set null'; `createdAt` timestamp defaultNow notNull.

Dense why-comment above the table covering: (a) escalations previously persisted nothing but
notifications, so there was no durable step identity to act on; (b) `targetPosition` is captured
at CREATION time deliberately — authorization must not depend on the escalator's CURRENT role
later, since a role change would silently re-route who may amend; (c) `stepN` and `checklistSlug`
are nullable because readiness-form escalations have no checklist definition (`readinessForms` is
a separate table) and legacy call sites may lack step context; (d) `createdBy` is SET NULL, not
cascade — the escalation is historical record and must survive user deletion, matching the
`checklists.createdBy` rationale already documented in this file.

Also add two additive columns to the existing `checklists` table:
`amendedBy` uuid references `users.id` onDelete 'set null', and `amendedAt` timestamp (both
nullable). Why-comment: these mark a submission whose recorded content was rewritten in place by a
superior via the escalation panel — null means "as originally submitted by the officer". Explicitly
note that amending is record-correction only and never re-runs step completion (D-02).

**2. `lib/escalation.ts`** — add a PURE predicate (no db, no session, trivially unit-testable):

```
export function canAmendEscalation(
  role: UserRole,
  viewerPosition: string | null | undefined,
  targetPosition: string,
): boolean
```
Returns `isAdminRole(role) || (!!viewerPosition && viewerPosition === targetPosition)`. Import
`isAdminRole` from `@/lib/workflow`. Why-comment: encodes D-01 in one place so the server action
and the page's render gate can never drift; `viewerPosition` is always a FRESH db read at the call
site, never a session claim, because position is mutable and the session token is not re-minted on
change.

**3. `actions/escalation.ts`** — extend `escalateChecklistAction`'s input with optional
`checklistSlug?: string | null` and `stepN?: number | null`. After the recipients check passes (so
an unroutable escalation writes nothing) and BEFORE the notification fan-out, insert one
`stepEscalations` row with the sanitized values (`checklistSlug` trimmed to a slug-safe string or
null; `stepN` coerced with `Number.isFinite` or null). Keep the notification loop byte-for-byte
behaviourally identical — the banner on the dispute page depends on it. Wrap the insert so a
failure there does not swallow the notification path silently; prefer letting the insert run first
and returning the existing error message shape on failure.

**4. Thread the context through the two call sites.** `app/_components/escalate-button.tsx` gains
optional `checklistSlug?: string | null` and `stepN?: number | null` props and forwards them in the
action input. `app/(app)/checklists/[slug]/page.tsx` passes `checklistSlug={def.slug}` and
`stepN={workflowStepN}`. `app/(app)/factory-pm/readiness/page.tsx` passes `stepN={workflowStepN}`
only and leaves `checklistSlug` unset — comment WHY (readiness is not a checklist definition, so
its escalation is informational-only in the panel).

**5. Apply the schema:** run `npm run db:push`. Additive tables/columns only — this pushes against
the shared live Neon DB, so confirm the drizzle-kit plan contains no DROP/ALTER-TYPE statements
before accepting. If drizzle-kit proposes anything destructive, STOP and report rather than
accepting.

**6. Tests:** extend `tests/actions/escalation.test.ts`. Add the `canAmendEscalation` table above,
and extend the existing db mock (currently `select` only) with an `insert` mock so the new
`stepEscalations` write is asserted (fields present, called once) and the "no one holds the target
position" case asserts the insert was NOT called. Do not weaken any existing assertion.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm test -- tests/actions/escalation.test.ts && grep -v '^\s*//' db/schema.ts | grep -c "stepEscalations"</automated>
  </verify>
  <done>`step_escalations` exists in schema and in the live DB via db:push; `checklists` has `amended_by`/`amended_at`; `canAmendEscalation` is exported and unit-covered for all five cases; escalating from a checklist page writes one row carrying slug+stepN+targetPosition; existing escalation tests still pass unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: amendEscalatedChecklistAction — authorization + upsert both paths</name>
  <files>actions/escalation.ts, tests/actions/escalation-amend.test.ts</files>
  <behavior>
    - Admin caller (`super_admin`) with a mismatched/absent position → allowed.
    - Caller whose FRESH `users.position` equals the escalation's `targetPosition` → allowed.
    - Non-admin caller with a different position → rejected, `ok: false`, and NO db write happens
      (assert insert/update mocks were never called).
    - Position is read from the db, not from the session — assert the users lookup is performed even
      when the session object carries a position-like field.
    - Amend path: a prior submission exists → responses are UPDATEd in place (no new `checklists`
      row inserted), and the `checklists` row gets `amendedBy` = caller and a fresh `amendedAt`.
    - Create-from-blank path: no prior submission → one `checklists` row inserted (status
      'submitted', createdBy = caller, amendedBy/amendedAt set) plus one response row per active
      template item.
    - An answer for a templateItemId that is not an active item of this definition is DISCARDED —
      the item set is derived server-side, never from the client payload.
    - Unknown escalation id → `ok: false`, no writes.
    - Escalation with a null `checklistSlug` → `ok: false` with a "nothing to edit" style message.
    - No call to any workflow/step API: assert the action's module does not touch step completion
      (no import of `completeGraphStep` / `advanceOrConfirmDualRole` in this action's code path).
  </behavior>
  <action>
Add two server exports to `actions/escalation.ts`.

**A. `loadEscalationPanelData(projectId: string, viewerId: string, viewerRole: UserRole)`** — a
server helper the dispute page calls to render. For the given project it returns, per
`stepEscalations` row (newest first): the escalation row fields, the viewer's `canAmend` boolean
(computed with `canAmendEscalation` using a FRESH `users.position` read for `viewerId`), the
resolved `checklistDefinitions` row (by slug, may be null), the ACTIVE `checklistTemplateItems`
ordered by `step, sortOrder`, the newest `checklists` submission for `(projectId, definitionId)`
ordered `createdAt desc limit 1` (may be null), its `checklistResponses` keyed by `templateItemId`,
and the amender's display name when `amendedBy` is set. Read the viewer's position ONCE for the
whole page, not per row.

**B. `amendEscalatedChecklistAction(tabToken: string | null, input: { escalationId: string;
answers: Record<string, ChecklistAnswer> }): Promise<EscalateResult>`**

Order of operations — authorization strictly before any write:
1. `verifySessionForAction(tabToken)` → `{ userId, role }`.
2. Load the `stepEscalations` row by id. Missing → `{ ok: false, message: 'Escalation not found.' }`.
3. Fresh `db.select({ position: users.position }).from(users).where(eq(users.id, userId))` — never
   trust a session-carried position (comment WHY: positions are mutable and the JWT is not re-minted).
4. `canAmendEscalation(role, position, escalation.targetPosition)` → false ⇒
   `{ ok: false, message: 'You are not authorized to update this checklist.' }`. No writes.
5. Resolve the definition by `escalation.checklistSlug` (null slug or missing definition ⇒
   `{ ok: false, message: 'This escalation has no editable checklist content.' }`).
6. Load ACTIVE template items for the definition. Empty ⇒ error return.
7. Find the newest `checklists` row for `(projectId, definitionId)`.
8. **Amend path** (submission exists): for each active item, sanitize the incoming answer exactly
   like `submitChecklistAction` does (`value` must be one of 'yes' | 'no' | 'na' else null;
   `textValue`/`notes` coerced to string or null). If a `checklistResponses` row exists for
   `(checklistId, templateItemId)` UPDATE it and bump `updatedAt`; if not, INSERT it (handles items
   added to the template after the original submission). Then UPDATE the `checklists` row setting
   `amendedBy = userId`, `amendedAt = new Date()`, `updatedAt = new Date()`.
   **Create-from-blank path** (no submission): INSERT one `checklists` row
   (`definitionId`, `projectId`, `createdBy: userId`, `status: 'submitted'`, `submittedAt: now`,
   `amendedBy: userId`, `amendedAt: now`) — mirror `submitChecklistAction`'s insert shape — then
   insert one response row per active item.
9. `revalidatePath('/disputes/' + escalation.projectId)`.
10. Return `{ ok: true, message: 'Checklist updated.' }`.

**Hard constraints to encode as comments in the action (D-02):** this action MUST NOT touch
`projects.currentStep`, `projectStepCompletions` or `workflowStepStates`, MUST NOT call
`completeGraphStep` / `advanceOrConfirmDualRole` / `recordAdditionalRequirement`, and MUST NOT
modify `checklists.photoData`. It is record correction, not workflow progression — a superior
fixing a past step's content must never silently rewind or advance the project.

Wrap the write block in try/catch returning the repo's standard
"Could not save… Please try again." shape, matching `submitChecklistAction`.

**Tests:** new `tests/actions/escalation-amend.test.ts` following the `tests/actions/readiness.test.ts`
hoisted-mock pattern (`vi.mock('server-only')`, `vi.mock('next/cache')`, `vi.mock('@/db')`,
`vi.mock('@/lib/dal')`). Build a db mock exposing chained `select`/`insert`/`update` so each
behavior above is asserted, including the negative "no writes on rejection" assertions.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm test -- tests/actions/escalation-amend.test.ts tests/actions/escalation.test.ts && grep -c "completeGraphStep\|advanceOrConfirmDualRole\|projectStepCompletions\|workflowStepStates" actions/escalation.ts | grep -qx 0 && echo "no-workflow-coupling OK"</automated>
  </verify>
  <done>`amendEscalatedChecklistAction` and `loadEscalationPanelData` are exported; every behavior case above has a passing test; rejection paths perform zero writes; the action file contains no reference to step-completion or workflow-state APIs.</done>
</task>

<task type="auto">
  <name>Task 3: Inline amend panel on the dispute page</name>
  <files>app/_components/escalation-amend-panel.tsx, app/(app)/disputes/[projectId]/page.tsx</files>
  <action>
Wire the panel into the dispute thread (D-03: inline, no link-out).

**1. `app/_components/escalation-amend-panel.tsx`** — new `'use client'` component. Props: the
escalation metadata (id, checklistLabel, reason, stepN, createdAt), `definitionName: string | null`,
`items: Array<{ id, label, helpText, itemType, responseOptions, step, sectionTitle }>`,
`initialAnswers: Record<string, { value: 'yes'|'no'|'na'|null; textValue: string|null; notes: string|null }>`,
`canAmend: boolean`, `amendedByName: string | null`, `amendedAt: string | null`, and
`hasSubmission: boolean`.

Behaviour:
- Collapsed by default behind a "Review / update checklist" toggle so the thread stays readable.
- Renders items grouped by `sectionTitle` (fall back to ungrouped when null), mirroring the visual
  language already used by `checklist-wizard.tsx` — do not invent a new design system.
- Per item: a yes/no (or yes/no/na when `responseOptions === 'yes_no_na'`) radio group, a text input
  when `itemType === 'text'`, and a notes textarea. Pre-filled from `initialAnswers`.
- When `hasSubmission === false`, show a neutral "The officer has not filled this in yet — you are
  creating the first record." line. Do NOT frame it as an error.
- When `canAmend === false`, render every control disabled and show "Only <target position holders>
  and admins can update this." No submit button. (Server still re-checks; this is UX only.)
- Submit via `useActionState` calling `amendEscalatedChecklistAction(getTabToken(), { escalationId,
  answers })` — same tab-token pattern as `escalate-button.tsx`. Show the returned message.
- Audit line when `amendedByName` is set: "Amended by {name}, {localized amendedAt}".
- Photo evidence: read-only thumbnails only if the existing submission's `photoData` is already
  being passed and rendering is a one-liner; otherwise omit the concept entirely. Never send photo
  data back to the server from this panel.

**2. `app/(app)/disputes/[projectId]/page.tsx`** — after the existing alerts block (which stays
untouched), call `loadEscalationPanelData(projectId, userId, role)` and render one
`EscalationAmendPanel` per escalation row under a heading like "Escalated steps". Import `role`
from the existing `verifySession()` destructure (currently only `userId` is taken — add `role`).
When a row has a null `checklistSlug`/definition, render a compact read-only card noting there is no
inline checklist content for that escalation instead of the editor. When there are no
`stepEscalations` rows, render nothing extra — the page must look exactly as it does today for
projects with only legacy escalations. Add a short comment explaining that only escalations created
after this ships carry a `step_escalations` row.

Serialize dates to strings at the server/client boundary; the panel receives strings, not `Date`s.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm test</automated>
    <human-check>Sign in as a factory_pm, escalate a checklist from a project step. Sign in as the chief_production_officer holder, open /disputes/{projectId}: the escalation banner still renders AND an "Escalated steps" panel shows the checklist items with the officer's answers pre-filled. Change an answer, save, reload — the change persists and "Amended by …" appears. Confirm the project's current step on the projects board is unchanged. Sign in as an unrelated non-admin role on the same project: the panel is visible but disabled.</human-check>
  </verify>
  <done>`/disputes/{projectId}` renders an inline, pre-filled, authorization-gated editing panel per escalation; saving persists via the Task 2 action; the legacy notifications banner and the discussion thread are unchanged; `npx tsc --noEmit`, `npm run lint` and `npm test` are all green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → Server Action (`amendEscalatedChecklistAction`) | Untrusted: escalationId, answers map, and the per-tab token all originate client-side. |
| session claims → authorization | The JWT carries `role` but NOT a trustworthy `position`; position is mutable in the db without re-minting the token. |
| Server Action → live Neon DB | Writes touch permanent record (`checklists`, `checklistResponses`). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gow-01 | Elevation of Privilege | `amendEscalatedChecklistAction` | mitigate | Authorization runs before any write: `canAmendEscalation(role, freshDbPosition, escalation.targetPosition)`. Client `canAmend` prop is UX only. Tests assert zero writes on rejection. |
| T-gow-02 | Spoofing | position claim | mitigate | Position is re-read from `users` per invocation; never taken from the session or the client payload. |
| T-gow-03 | Tampering | `answers` payload | mitigate | Active template items are derived server-side from the escalation's definition; answers for unknown/inactive item ids are discarded. `value` is whitelisted to 'yes'/'no'/'na'. |
| T-gow-04 | Tampering | workflow state | mitigate | The action is forbidden from importing or calling step-completion APIs (D-02); verified by a grep gate in Task 2's automated check. |
| T-gow-05 | Repudiation | amended records | mitigate | `checklists.amendedBy` / `amendedAt` capture who rewrote the record and when; surfaced in the panel. |
| T-gow-06 | Tampering | `step_escalations.targetPosition` | mitigate | Captured at escalation-creation time from the escalator's role, so a later role change cannot re-route who may amend. |
| T-gow-07 | Information Disclosure | dispute page render | accept | The dispute page is already visible to the project team + all super admins by existing design; the panel reuses that access model for READ and narrows only WRITE. |
| T-gow-08 | Denial of Service | live schema push | mitigate | `npm run db:push` is additive-only (new table + two nullable columns); the plan requires aborting if drizzle-kit proposes any destructive statement. |
| T-gow-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies are introduced by this task. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean.
- `npm run lint` clean.
- `npm test` green (full suite — the existing `tests/actions/escalation.test.ts` must not regress).
- `npm run db:push` applied against the live Neon DB with an additive-only plan.
- Grep gate: `actions/escalation.ts` contains no reference to `completeGraphStep`,
  `advanceOrConfirmDualRole`, `projectStepCompletions` or `workflowStepStates`.
- Manual: the human-check flow in Task 3.
</verification>

<success_criteria>
- Escalating a checklist writes a `step_escalations` row alongside the unchanged notification fan-out.
- On `/disputes/{projectId}`, the escalation's target-position holder or an admin can edit the
  escalated checklist's items inline and save, with both the amend-existing and create-from-blank
  paths working.
- A non-admin, non-target-position caller is rejected server-side with zero writes.
- `projects.currentStep`, `projectStepCompletions` and `workflowStepStates` are provably untouched.
- "Amended by <name>, <time>" is visible after an amendment.
- Existing dispute-page banner and thread behaviour is unchanged.
</success_criteria>

<output>
Create `.planning/quick/260727-gow-escalation-step-content-upsert-by-superv/260727-gow-SUMMARY.md` when done.
</output>
