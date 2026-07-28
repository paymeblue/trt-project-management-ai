---
phase: quick-260728-esc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(app)/disputes/[projectId]/page.tsx
  - app/_components/escalation-amend-panel.tsx
  - actions/escalation.ts
  - tests/actions/escalation-amend.test.ts
  - lib/notification-autosurface.ts
  - app/_components/notifications-bell.tsx
  - app/_components/pending-step-gate.tsx
  - app/_components/pending-call-gate.tsx
  - tests/lib/notification-autosurface.test.ts
autonomous: true
requirements: [ESC-A, ESC-B, ESC-C]

must_haves:
  truths:
    - "An escalated-step card header shows the project name alongside the checklist label and step number"
    - "When a supervisor amends an escalated checklist, the officer who raised the escalation receives a notification naming the project, checklist, step and amender"
    - "A supervisor amending their OWN escalation notifies nobody"
    - "A notification failure never fails or rolls back a successful amend"
    - "A user with unread notifications sees the actual titles/bodies surfaced once per session without clicking the bell"
    - "The notification auto-surface never appears while the action-required step gate or the incoming-call gate is on screen"
    - "Auto-surfacing never moves keyboard focus out of a field the user is typing in"
  artifacts:
    - path: "lib/notification-autosurface.ts"
      provides: "Pure shouldAutoOpenBell decision + forcing-overlay registration store"
      exports: ["shouldAutoOpenBell", "useRegisterForcingOverlay", "useForcingOverlayActive", "AUTO_SURFACED_KEY"]
    - path: "tests/lib/notification-autosurface.test.ts"
      provides: "Unit coverage of the auto-open decision matrix"
    - path: "actions/escalation.ts"
      provides: "amendEscalatedChecklistAction notifies the escalation creator (best-effort)"
      contains: "escalation.createdBy"
  key_links:
    - from: "app/(app)/disputes/[projectId]/page.tsx"
      to: "app/_components/escalation-amend-panel.tsx"
      via: "projectName prop"
      pattern: "projectName=\\{project.name\\}"
    - from: "actions/escalation.ts"
      to: "lib/notifications.ts"
      via: "notifyUser in amendEscalatedChecklistAction"
      pattern: "notifyUser\\("
    - from: "app/_components/notifications-bell.tsx"
      to: "lib/notification-autosurface.ts"
      via: "shouldAutoOpenBell + useForcingOverlayActive"
      pattern: "shouldAutoOpenBell"
    - from: "app/_components/pending-step-gate.tsx"
      to: "lib/notification-autosurface.ts"
      via: "useRegisterForcingOverlay"
      pattern: "useRegisterForcingOverlay"
---

<objective>
Close the escalation loop end to end: (A) name the project on every escalated-step
card, (B) tell the originating officer when a supervisor amends their step, and
(C) surface notification CONTENT automatically instead of a bare count badge —
without introducing a second competing auto-popup.

Purpose: today a supervisor's correction is invisible to the officer who raised
the escalation (`amendEscalatedChecklistAction` calls `notifyUser` zero times),
and the escalated-step card does not say which project it belongs to, so a
supervisor with escalations across several projects cannot tell them apart.
Even when a notification does exist, the bell only shows a number until clicked.

Output: project name on the panel header, an `escalation_amended` notification to
`step_escalations.createdBy`, a once-per-session bell auto-surface with a single
documented overlay precedence, and tests for both the notify behaviour and the
auto-open decision.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md

@actions/escalation.ts
@lib/notifications.ts
@app/_components/escalation-amend-panel.tsx
@app/(app)/disputes/[projectId]/page.tsx
@app/_components/notifications-bell.tsx
@app/_components/pending-step-gate.tsx
@app/_components/pending-call-gate.tsx
@tests/actions/escalation-amend.test.ts

<interfaces>
<!-- Contracts the executor needs. Already verified in the codebase — do NOT re-explore. -->

lib/notifications.ts:
  export async function notifyUser(input: {
    recipientId: string
    type: string
    title: string
    body?: string | null
    projectId?: string | null
    callId?: string | null
    actorId?: string | null
  }): Promise<void>
  // Self-guards: returns early when recipientId === actorId.
  export const DISPUTE_NOTIFICATION_TYPES = ['escalation', 'bypass_request', 'pause_flag'] as const

db/schema.ts (step_escalations, line ~507):
  id, projectId, stepN (nullable), checklistSlug (nullable), checklistLabel,
  reason (nullable), targetPosition, createdBy (uuid, NULLABLE — onDelete: 'set null'),
  createdAt

actions/escalation.ts:
  export type EscalationPanelRow = { id, projectId, stepN, checklistSlug, checklistLabel,
    reason, targetPosition, createdAt, canAmend, definitionName, items, hasSubmission,
    initialAnswers, amendedByName, amendedAt, photos }
  // NOTE: the row already carries projectId, NOT the project's name. The dispute
  // page has `project.name` in scope (line ~25) — thread it from there.

app/_components/notifications-bell.tsx:
  type Item = { id, type, title, body, projectId, callId, read, createdAt }
  type Feed = { items: Item[]; unread: number }
  const NO_NAVIGATE_TYPES = new Set(['assignment','approval_request','approval_rejected','step_turn'])
  // Any type NOT in NO_NAVIGATE_TYPES that carries a projectId routes to
  // /disputes/{projectId} on click. /disputes has no role guard beyond
  // verifySession(), so an officer CAN open it — no bell change is needed for
  // the new 'escalation_amended' type to route correctly.

Established overlay z-order (do not change):
  PendingCallGate  z-[70]  (live call wins — someone is waiting right now)
  PendingStepGate  z-[60]  (action required)
  Bell dropdown    z-50    (header-anchored, non-modal — must yield to both)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Show the project name on each escalated-step card (ESC-A)</name>
  <files>app/_components/escalation-amend-panel.tsx, app/(app)/disputes/[projectId]/page.tsx</files>
  <action>
Add a required `projectName: string` prop to `EscalationAmendPanel` and render it
in the collapsed header (lines ~124-127), which today shows only `{checklistLabel}`
plus `Step {stepN}`. Render order: project name first as the primary identifier,
then the checklist label, then the step number — a supervisor scanning a list of
escalated cards must be able to answer "which project?" before "which checklist?".
Match the header's existing type scale: reuse the `text-sm font-semibold text-gray-900`
treatment for the project name and demote `checklistLabel` to the same muted
`text-xs text-gray-400` register as `Step {stepN}`, separated by a middot, so the
header does not grow to two competing bold strings. Do not introduce a new colour
or spacing token.

In `app/(app)/disputes/[projectId]/page.tsx`, pass `projectName={project.name}` in
the `EscalationAmendPanel` render (line ~114). The page already selected
`projects.name` at line ~25 for the `<h1>` — reuse that value. Do NOT add a
projects query inside the panel, inside `loadEscalationPanelData`, or a
`projectName` field on `EscalationPanelRow`: every panel on this page belongs to
the same project by construction (`loadEscalationPanelData` is scoped by
`projectId`), so a per-row lookup would be N identical queries for one already-known
string.

Add a dense why-comment above the header markup tagging quick task 260728-esc and
stating the reason (supervisors hold escalations across multiple projects; the
card was previously unattributable).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && grep -v '^\s*[/*]' app/_components/escalation-amend-panel.tsx | grep -c 'projectName' | grep -qv '^0$' && grep -c 'projectName={project.name}' 'app/(app)/disputes/[projectId]/page.tsx'</automated>
  </verify>
  <done>`projectName` is a required prop on `EscalationAmendPanel`, rendered in the collapsed header alongside checklist label and step number; the dispute page supplies it from its existing `project.name`; `npx tsc --noEmit` passes (a missing prop at the single call site would fail the build).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Notify the originating officer when their escalated step is amended (ESC-B)</name>
  <files>actions/escalation.ts, tests/actions/escalation-amend.test.ts</files>
  <behavior>
    - On a successful amend by a DIFFERENT user, `notifyUser` is called exactly once with `recipientId === escalation.createdBy`, `actorId === the amender`, `projectId === escalation.projectId`, and a title/body naming project, checklist label, step number and amender.
    - When the amender IS `escalation.createdBy`, `notifyUser` is never called (zero calls) — and the amend still returns `{ ok: true }`.
    - When `escalation.createdBy` is null (the officer's account was deleted; the column is `onDelete: 'set null'`), `notifyUser` is never called and the amend still returns `{ ok: true }`.
    - When `notifyUser` throws, the action still returns `{ ok: true }` and the writes already performed are not reverted.
  </behavior>
  <action>
In `amendEscalatedChecklistAction`, AFTER the write `try/catch` block succeeds and
BEFORE `revalidatePath`, add a best-effort notification to the escalation's
originating officer (`escalation.createdBy`).

Shape it exactly like `escalateChecklistAction`'s existing `notifyUser` call at
line ~85 (same argument object, same ordering of keys):
  - `type`: a new literal `'escalation_amended'`. Do NOT add it to
    `DISPUTE_NOTIFICATION_TYPES` in `lib/notifications.ts` — that set drives the
    supervisor-facing Disputes sidebar badge and `getDisputeList`, and an officer
    being told "your record was corrected" is not a dispute landing on their desk.
    It is also NOT in `NO_NAVIGATE_TYPES`, so the bell already routes a click to
    `/disputes/{projectId}` where the officer can read the amended record. No
    change to either constant is required.
  - `title`: names the project, the checklist and the step, e.g.
    `Your escalated step was updated: {checklistLabel} on {projectName}` (append
    ` · Step {stepN}` only when `stepN != null` — readiness-form escalations carry
    no step).
  - `body`: names who amended it, e.g. `Amended by {amenderName}.` Fall back to a
    role-neutral phrase when the name lookup returns nothing.
  - `projectId`: `escalation.projectId`; `actorId`: the amending `userId`.

Guards, in this order:
  1. Skip entirely when `!escalation.createdBy` (nullable column).
  2. Skip entirely when `escalation.createdBy === userId` — a supervisor who
     escalated and then amended their own record must not be told about themselves.
     `notifyUser` already self-guards on `recipientId === actorId`, but the explicit
     skip is the documented invariant AND avoids two pointless DB reads.

Best-effort: wrap the whole block (the `projects.name` lookup, the `users.name`
lookup, and the `notifyUser` call) in a single `try { ... } catch { /* ... */ }`
that swallows. Rationale to put in the comment: the checklist write has already
committed, so a notification fault must never surface as "Could not save your
changes" nor trigger a retry that double-writes — this mirrors how
`sendApprovalAction` (actions/workflow-graph.ts ~line 215) treats its post-write
notification fan-out as non-fatal for a staffing gap.

Do NOT touch `canAmendEscalation`, the authorization block, or the amend-only
invariant. Do NOT import or reference `completeGraphStep`,
`advanceOrConfirmDualRole`, `projectStepCompletions` or `workflowStepStates` —
including inside comments (the 260727-gow module-boundary test greps raw source).

TESTS — extend `tests/actions/escalation-amend.test.ts`. The file already mocks
`@/lib/notifications` with `{ notifyUser: vi.fn() }`; import that mock via
`vi.mocked(await import('@/lib/notifications')).notifyUser` or hoist a
`notifyUserMock` into the existing `vi.hoisted(...)` block and reference it from
the `vi.mock('@/lib/notifications', ...)` factory (preferred — matches the file's
established hoisted-mock pattern). Add a new
`describe('amendEscalatedChecklistAction — amend notification (260728-esc)')` with
one test per bullet in `<behavior>`. Each test must extend the existing
`selectMock.mockReturnValueOnce(rowsQuery([...]))` chain with the TWO extra
selects the new block performs, in order: `[{ name: 'Villa Rossi' }]` (projects)
then `[{ name: 'Head of Projects' }]` (users). For the throw case use
`notifyUserMock.mockRejectedValueOnce(new Error('smtp down'))` and assert
`res.ok === true`.

Do NOT rewrite the existing tests' select chains. They deliberately run out of
`mockReturnValueOnce` entries at the new block, `db.select(...)` resolves to
`undefined`, the property access throws, and the new `try/catch` swallows it —
which is itself evidence the notification is non-fatal. Leave them untouched and
confirm all pre-existing assertions still pass.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/actions/escalation-amend.test.ts && grep -v '^\s*[/*]' actions/escalation.ts | grep -c 'completeGraphStep\|advanceOrConfirmDualRole\|projectStepCompletions\|workflowStepStates' | grep -q '^0$'</automated>
  </verify>
  <done>All four behaviours are covered by passing tests; every pre-existing test in `tests/actions/escalation-amend.test.ts` still passes unmodified; the 260727-gow module-boundary grep gate returns zero matches.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Auto-surface notification content once per session, behind one overlay precedence (ESC-C)</name>
  <files>lib/notification-autosurface.ts, app/_components/notifications-bell.tsx, app/_components/pending-step-gate.tsx, app/_components/pending-call-gate.tsx, tests/lib/notification-autosurface.test.ts</files>
  <behavior>
    - `shouldAutoOpenBell` returns true when there is >= 1 unread id not yet auto-surfaced, the panel is closed, no forcing overlay is active, and the user is not typing.
    - Returns false when every unread id has already been auto-surfaced this session (once-per-session), and true again as soon as a NEW unread id appears.
    - Returns false when a forcing overlay is active (step gate or call gate on screen).
    - Returns false when the user is typing in a field.
    - Returns false when the panel is already open, and false when unread is zero.
  </behavior>
  <action>
DESIGN DECISION (state this verbatim as the header comment of the new file, tagged
260728-esc): the bell must NOT auto-open on every navigation — that is hostile on
every page load and trains users to dismiss reflexively. Instead it auto-opens
ONCE PER SESSION while at least one unread notification has not yet been
auto-surfaced, so the actual titles/bodies get read; after that it stays closed
for the session unless a NEW unread arrives, which re-arms it exactly once more.
It is fully dismissible, it never marks anything read (the badge must survive an
unread notification the user glanced at but did not act on), and it never moves
focus.

PRECEDENCE (also documented in the file header): PendingCallGate (z-[70]) >
PendingStepGate (z-[60]) > bell auto-surface. The bell dropdown is a
header-anchored, non-modal popover; a forcing modal is a full-screen demand for a
decision. Two things demanding the screen at once is the failure mode to avoid, so
the bell yields — it does not race, it defers, and re-evaluates on the next poll
tick once the modal is gone or dismissed.

NEW FILE `lib/notification-autosurface.ts` with two export groups:

1. Pure decision (node-testable, no React, no DOM):
     export const AUTO_SURFACED_KEY = 'trt.bell.autoSurfacedIds'
     export function shouldAutoOpenBell(input: {
       unreadIds: string[]
       autoSurfacedIds: ReadonlySet<string>
       isOpen: boolean
       forcingOverlayActive: boolean
       isTypingInForm: boolean
     }): boolean
   Returns true only when `!isOpen && !forcingOverlayActive && !isTypingInForm` and
   at least one `unreadIds` entry is absent from `autoSurfacedIds`.

2. Forcing-overlay registration store (module-scope counter + listener Set, exposed
   through `useSyncExternalStore` — no context provider, so the gates and the bell
   do not need a shared ancestor beyond being client components):
     export function useRegisterForcingOverlay(active: boolean): void
     export function useForcingOverlayActive(): boolean
   `useRegisterForcingOverlay` increments on mount-while-active and decrements on
   cleanup/deactivate inside a `useEffect` keyed on `active`; it must be safe to
   call unconditionally with `false` (hooks rules).

WIRE THE GATES:
  - `app/_components/pending-step-gate.tsx`: move `const step = ...findStep(steps, item.stepN)`
    ABOVE the `if (!item) return null` early return (guard it: `item ? findStep(...) : null`),
    then call `useRegisterForcingOverlay(!!(item && step))` before ANY early return —
    the registration must reflect what actually renders, and hooks cannot live after
    a conditional return.
  - `app/_components/pending-call-gate.tsx`: call `useRegisterForcingOverlay(!!pending)`
    (or whatever the component's already-computed "there is a modal to show" value is
    named) before its early return, same rule.
  - Neither gate changes its own behaviour, markup, z-index, or dismissal semantics.

WIRE THE BELL (`app/_components/notifications-bell.tsx`):
  - Read `const forcingOverlayActive = useForcingOverlayActive()`.
  - Hold `const autoSurfaced = useRef<Set<string>>(new Set())`, hydrated once from
    `sessionStorage[AUTO_SURFACED_KEY]` inside an effect (SSR-safe: never touch
    `sessionStorage` at module scope or during render).
  - In an effect keyed on `[feed, open, forcingOverlayActive]`, compute
    `unreadIds = feed.items.filter(i => !i.read).map(i => i.id)`, call
    `shouldAutoOpenBell(...)`, and when true: `setOpen(true)`, add EVERY current
    `unreadIds` entry to the ref set, and persist the set back to `sessionStorage`.
    Persisting all currently-unread ids (not just the one that triggered) is what
    makes it once-per-session rather than once-per-notification.
  - `isTypingInForm`: derive at decision time from `document.activeElement` —
    true when the active element is an `input`, `textarea`, `select`, or has
    `isContentEditable`. This is the "must not steal focus from an in-progress form"
    guard; combined with the fact that auto-open only renders the panel and calls no
    `.focus()`, the user's caret never moves.
  - Deliberately do NOT call `markNotificationsReadAction` on auto-open. Opening the
    panel has never marked things read and must not start now — the user has to
    click an item or "Mark all read".
  - Existing behaviour that must be preserved unchanged: the 4s poll, the
    mousedown-outside close, `NO_NAVIGATE_TYPES` routing, `markOne`/`markAll`.

WHY SESSIONSTORAGE HERE, WHEN THE GATES USE IN-MEMORY SETS (put this in a comment):
the gates re-assert on hard reload on purpose — an uncompleted step is still on your
desk and should shout again. A notification you have already read the text of is not
work; re-popping it on every hard refresh is the exact nagging this feature is meant
to avoid. Notification ids are stable across reloads, so the seen-set is meaningful
where the gates' "still pending" set is not.

TESTS — NEW FILE `tests/lib/notification-autosurface.test.ts` (vitest node env, matching
`tests/lib/` convention): one test per bullet in `<behavior>`, calling
`shouldAutoOpenBell` directly with plain objects. No DOM, no React rendering — the
repo's vitest config is `environment: 'node'` and there is no component-test harness;
that is exactly why the decision is extracted as a pure function instead of living
inline in the effect.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/lib/notification-autosurface.test.ts && npx tsc --noEmit && grep -c 'useRegisterForcingOverlay' app/_components/pending-step-gate.tsx app/_components/pending-call-gate.tsx && grep -v '^\s*[/*]' app/_components/notifications-bell.tsx | grep -c 'shouldAutoOpenBell'</automated>
    <human-check>With a seeded unread notification: load any app page and confirm the bell panel opens by itself showing the notification's title and body (not just a red number); click into a text field first and confirm typing is never interrupted; dismiss it, navigate around, and confirm it does not reopen; confirm that when an "Action required" step modal is up, the bell panel does not appear behind or over it.</human-check>
  </verify>
  <done>`shouldAutoOpenBell`'s five decision cases are covered by passing tests; both gates register with the overlay store; the bell auto-opens once per session, defers while a forcing overlay is active, never marks read, and never calls `.focus()`; `npx tsc --noEmit` and `npm run lint` pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → `amendEscalatedChecklistAction` | Public Server Action HTTP endpoint; `escalationId`, `answers`, `newPhotos` are attacker-controlled |
| server → `notifications` table | New rows are addressed by server-derived `step_escalations.createdBy`, never by a client-supplied recipient |
| server → bell feed (`/api/notifications`) | Per-user, session-scoped; auto-surfacing changes only WHEN existing rows are displayed, never WHICH rows |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-esc-01 | Elevation of Privilege | `amendEscalatedChecklistAction` | mitigate | Task 2 adds code only AFTER the existing `canAmendEscalation` check and does not touch it; the 260727-gow grep gate plus the four existing authorization tests are re-run in Task 2's verify |
| T-esc-02 | Spoofing | amend notification recipient | mitigate | `recipientId` comes from the server-read `step_escalations.createdBy` row, never from `input`; explicit skip when `createdBy === userId`, plus `notifyUser`'s own self-guard |
| T-esc-03 | Denial of Service | amend write path | mitigate | The notification block is wrapped in its own swallowing `try/catch` after the write commits — a notification fault cannot surface as a save failure or provoke a double-write retry |
| T-esc-04 | Information Disclosure | notification title/body | accept | Content is limited to project name, checklist label, step number and amender name, sent solely to the person who raised that escalation on that project — they already see all four on `/disputes/{projectId}` |
| T-esc-05 | Information Disclosure | bell auto-open | accept | Auto-surfacing renders the SAME per-user feed the bell already served on click; no new data crosses to the client. Residual risk is shoulder-surfing on a shared factory-floor device — mitigated in practice by the panel being dismissible and never auto-opening more than once per session |
| T-esc-06 | Tampering | `sessionStorage[AUTO_SURFACED_KEY]` | accept | Client-writable, but the worst outcome is the user's own bell auto-opening more or less often; it gates no data access and no read-state mutation (auto-open never marks read) |
| T-esc-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs zero packages — no `package.json` change, so the Package Legitimacy Gate does not apply |
</threat_model>

<verification>
Run from `/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm`:

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npm test` — green, and the total is **> 346** (the current baseline) because Tasks 2 and 3 only ADD tests; a count at or below 346 means an existing test was deleted or replaced rather than extended.
4. 260727-gow module-boundary gate (comments stripped so a why-comment can never
   self-invalidate it):
   `grep -v '^\s*[/*]' actions/escalation.ts | grep -c 'completeGraphStep\|advanceOrConfirmDualRole\|projectStepCompletions\|workflowStepStates'` → `0`
5. No schema change was needed: `git diff --stat db/schema.ts` is empty. (The
   `notifications` table already carries `type/title/body/projectId/actorId`, and
   `step_escalations.createdBy` already exists.) If — and only if — an additive
   column proves genuinely necessary, apply it with `npm run db:push` and abort on
   any prompt that proposes a drop, rename, or truncation.
6. Next 16 conventions preserved: `params`/`cookies()`/`headers()` await sites
   untouched; no `middleware.ts` introduced.
</verification>

<success_criteria>
- Escalated-step card headers name the project; the dispute page supplies it from its existing `project.name` with no added query.
- `amendEscalatedChecklistAction` notifies `step_escalations.createdBy` on success with project name, checklist label, step number and amender; skips on self-amend and on a null `createdBy`; and returns `{ ok: true }` even when `notifyUser` throws.
- Unread notifications surface their titles and bodies automatically once per session, re-arming only on a new unread, dismissible, focus-preserving.
- Exactly one auto-surfacing precedence exists in the app: call gate > step gate > bell, enforced through a single shared registration store rather than two components guessing about each other.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (> 346 passing) and the 260727-gow grep gate all pass.
- Every new/changed block carries a dense why-comment tagged 260728-esc. No emojis.
</success_criteria>

<output>
Create `.planning/quick/260728-esc-escalation-notify-and-project-name/260728-esc-SUMMARY.md` when done.
</output>
