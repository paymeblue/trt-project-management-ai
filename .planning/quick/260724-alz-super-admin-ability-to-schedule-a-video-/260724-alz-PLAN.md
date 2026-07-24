---
phase: quick-260724-alz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/schema.ts
  - lib/video-calls.ts
  - actions/video-calls.ts
  - app/_components/new-call-form.tsx
  - app/(app)/calls/page.tsx
  - app/(app)/calls/[id]/page.tsx
  - app/_components/video-call-room.tsx
  - tests/lib/video-calls.test.ts
  - tests/actions/video-calls.test.ts
autonomous: true
requirements: [SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05]

must_haves:
  truths:
    - "A super_admin or operations user sees a 'Schedule for later' control in the new-call form and can pick a future date/time; non-admin users see today's 'Start a call' form unchanged, with no scheduling control visible"
    - "A tampered request that supplies scheduledFor from a non-admin caller is rejected server-side by createVideoCallAction, even though the UI never exposes the control to that caller"
    - "A tampered request that supplies a past or unparseable scheduledFor from an admin caller is rejected server-side with a clear error"
    - "The invited-participant notification for a scheduled call reads like '{creator} scheduled a video call for {date/time}' instead of '{creator} started a video call'"
    - "The GetStream video room and chat channel are created immediately at schedule time (call.getOrCreate + chat channel), never deferred to the scheduled time — scheduledFor never gates joinability"
    - "/calls shows a distinct 'Scheduled' grouping for the caller's own calls whose scheduledFor is set and in the future, separate from 'Active' and 'Past'"
    - "The call room shows an informational-only banner when scheduledFor is in the future, and never blocks joining"
    - "db/schema.ts's videoCalls.scheduledFor nullable timestamp column exists in the live Neon DB after db:push, with zero unrelated schema drift"
  artifacts:
    - path: "db/schema.ts"
      provides: "videoCalls.scheduledFor nullable timestamp column"
      contains: "scheduled_for"
    - path: "lib/video-calls.ts"
      provides: "createVideoCall accepts opts.scheduledFor, inserts it, varies invitee notification title when set"
      contains: "scheduledFor"
    - path: "actions/video-calls.ts"
      provides: "createVideoCallAction validates input.scheduledFor gated to isAdminRole + future-datetime check"
      contains: "scheduledFor"
    - path: "app/_components/new-call-form.tsx"
      provides: "admin-only 'Schedule for later' datetime control"
      contains: "isAdmin"
    - path: "app/(app)/calls/page.tsx"
      provides: "isAdmin prop passthrough + Scheduled section grouping"
      contains: "Scheduled"
    - path: "app/_components/video-call-room.tsx"
      provides: "informational scheduled-for-future banner, never gates joining"
      contains: "Scheduled for"
  key_links:
    - from: "app/_components/new-call-form.tsx"
      to: "actions/video-calls.ts"
      via: "createVideoCallAction(getTabToken(), { ..., scheduledFor })"
      pattern: "scheduledFor"
    - from: "actions/video-calls.ts"
      to: "lib/video-calls.ts"
      via: "createVideoCall({ ..., scheduledFor })"
      pattern: "createVideoCall\\("
    - from: "lib/video-calls.ts"
      to: "db/schema.ts videoCalls"
      via: "insert(videoCalls).values({ ..., scheduledFor })"
      pattern: "scheduledFor"
    - from: "app/(app)/calls/[id]/page.tsx"
      to: "app/_components/video-call-room.tsx"
      via: "scheduledFor prop drives the informational banner"
      pattern: "scheduledFor"
---

<objective>
Add a "schedule for later" option to the existing instant video-call feature: admin-equivalent callers (`isAdminRole` — super_admin or operations) can set a future `scheduledFor` time when starting a call. The GetStream room and chat channel are still created immediately (early-join, per locked decision) — `scheduledFor` is purely a display/notification concern, never a joinability gate.

Purpose: Let a super admin or operations lead pre-schedule a call (e.g. a design review tomorrow at 10am) and have invitees see it as "Scheduled" rather than "Active" on their calls list, without changing the underlying instant-join mechanics the feature already has.

Output: `videoCalls.scheduledFor` column (db/schema.ts + live db:push), extended `createVideoCall`/`createVideoCallAction` (lib/video-calls.ts, actions/video-calls.ts), admin-only scheduling control in `new-call-form.tsx`, a "Scheduled" section on `/calls`, and an informational early-join banner in the call room.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@AGENTS.md
@.planning/quick/260724-alz-super-admin-ability-to-schedule-a-video-/260724-alz-CONTEXT.md

<interfaces>
<!-- Extracted from the codebase. Use these directly — do not re-explore. -->

db/schema.ts videoCalls (current):
export const videoCalls = pgTable('video_calls', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  status:    text('status').default('active').notNull(), // 'active' | 'ended'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  endedAt:   timestamp('ended_at'),
})
`timestamp` is already imported from `drizzle-orm/pg-core` at the top of this file — no new import needed for a `timestamp('scheduled_for')` column.

lib/video-calls.ts current shape (all server-only, CALL_TYPE = 'default'):
- `export type VideoCallRow = { id: string; title: string | null; createdBy: string; status: string; createdAt: Date; endedAt: Date | null }` — this is a hand-maintained type (not schema-inferred); it must gain `scheduledFor: Date | null` or downstream consumers (calls/page.tsx grouping, calls/[id]/page.tsx banner prop) won't type-check against it.
- `createVideoCall(opts: { creatorId; creatorName; title?; participantUserIds })` — inserts `{ title, createdBy: opts.creatorId }` into `videoCalls`, then creates the GetStream call + chat channel inside a try/catch that deletes the row and rethrows on failure, then notifies invitees via `notifyUser({ ..., title: \`${opts.creatorName} started a video call\`, ... })`.
- `notifyUser` (from `@/lib/notifications`) signature: `{ recipientId; actorId; type; title; body?; projectId?; callId?; actorId? }` — `type: 'video_call'` and `callId: row.id` stay unchanged; only `title` text varies.
- `getMyCalls(userId)` returns `MyCallSummary = VideoCallRow & { participants: CallParticipant[] }` — reading `db.select().from(videoCalls)`, so `scheduledFor` is returned automatically once the column exists; only the `VideoCallRow` type needs updating for TS to see it.
- `requiredEnv`, `streamClient()` — unchanged, not touched by this plan.

actions/video-calls.ts current shape:
- `createVideoCallAction(tabToken, input: { title?: string; participantUserIds: string[] })` — calls `verifySessionForAction(tabToken)` -> `{ userId, role }`, validates participants, then `createVideoCall({ creatorId: userId, creatorName: me?.name ?? 'Someone', title, participantUserIds })`.
- `isAdminRole` and `type UserRole` are already imported: `import { verifySessionForAction, isAdminRole } from '@/lib/dal'` and `import type { UserRole } from '@/lib/workflow'`. `endVideoCallAction` shows the exact gating idiom to mirror: `!isAdminRole(role as UserRole)`.
- `VideoCallActionState = { status: 'idle' | 'success' | 'error'; message?: string; callId?: string }` — return type for every action, unchanged.

app/_components/new-call-form.tsx current shape:
- `'use client'`, props today: `{ allUsers: PersonOption[] }`. Local state: `title`, `query`, `picked: Set<string>`, `pending` (useTransition), `message`. `submit()` calls `createVideoCallAction(getTabToken(), { title: title.trim() || undefined, participantUserIds: [...picked] })`, redirects to `/calls/${callId}` on success.
- Collapsed/expanded toggle via `open` state; the expanded form is a `div` with title input, participant picker, and a submit/cancel button row. Follow this existing conventions (labels: `text-[11px] font-medium uppercase tracking-wide text-gray-400`, inputs: `rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none`).

app/(app)/calls/page.tsx current shape:
- `const { userId, role } = await verifySession()` — `role` is already available; `isAdminRole` is NOT currently imported here (must add `import { verifySession, isAdminRole } from '@/lib/dal'`, matching the import pattern already used in `calls/[id]/page.tsx`).
- `formatWhen(d: Date): string` local helper already exists (`d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })`) — reuse for the Scheduled section's displayed time, do not duplicate.
- Current grouping: `const active = calls.filter((c) => c.status === 'active')` / `const ended = calls.filter((c) => c.status !== 'active')`, each rendered as its own `<h2>`-headed block (Active) or `<details>` block (Past calls). `<NewCallForm allUsers={allUsers} />` is rendered with no other props today.

app/(app)/calls/[id]/page.tsx current shape:
- `const { userId, role } = await verifySession()`; `const isAdmin = isAdminRole(role)` already computed and passed to `VideoCallRoom` (imported via `import { verifySession, isAdminRole } from '@/lib/dal'`). `const call = await getCall(id)` — `call.scheduledFor` will be typed once `VideoCallRow` is updated.
- `<VideoCallRoom apiKey userId userName token chatToken callId title isCreator isAdmin creatorId participants allUsers dashboard />` — this is the exact current prop list; a new `scheduledFor` prop must be added here and threaded to `VideoCallRoom`.

app/_components/video-call-room.tsx current shape:
- Props destructured today: `{ apiKey, userId, userName, token, chatToken, callId, title, isCreator, isAdmin, creatorId, participants, allUsers, dashboard }`. The header renders `<h1>{title ?? 'Video call'}</h1>` then a participant-count `<p>`. Below the header button row, `{endError && ...}` and `{(mediaBlocked.camera || mediaBlocked.microphone) && ...}` banners already exist — the new scheduled-for-future banner belongs in this same banner stack, above `<AddCallParticipants .../>`.

tests/lib/video-calls.test.ts and tests/actions/video-calls.test.ts mocking conventions (extend, don't replace):
- `vi.hoisted(() => ({ ...Mock: vi.fn() }))` for every mock fn referenced inside `vi.mock(...)` factories.
- The `@/db` mock's `insert(...).values(rows)` in `tests/lib/video-calls.test.ts` captures every call via `insertValuesMock(rows)`; the existing test distinguishes the single-row `videoCalls` insert from the bulk `videoCallParticipants` insert via `insertValuesMock.mock.calls.find((c) => Array.isArray(c[0]))` (participants) vs `.find((c) => !Array.isArray(c[0]))` (the call row) — use the same pattern to assert `scheduledFor` on the call-row insert.
- `tests/actions/video-calls.test.ts` mocks `@/lib/dal` wholesale: `vi.mock('@/lib/dal', () => ({ verifySessionForAction: verifyMock, isAdminRole: (role: string) => role === 'super_admin' || role === 'operations' }))` and `@/lib/video-calls` wholesale (`createVideoCall: createVideoCallMock`, etc.) — add no new mock functions, just new test cases against the existing `createVideoCallMock`.
</interfaces>
</context>

<constraints>
- Do NOT revisit who-can-schedule (locked: `isAdminRole` — super_admin OR operations, not super_admin-only) or the early-join decision (room + chat channel created immediately regardless of `scheduledFor`; never gate joinability on it).
- Do NOT add a `notifications` schema change — reuse `type: 'video_call'` + `callId` routing, vary only the `title` text.
- Do NOT add recurring-meeting support — one-off `scheduledFor` only.
- Non-admin users must see the exact same "Start a call" flow as today — no visible scheduling control, and the server action must reject a tampered `scheduledFor` value from a non-admin caller.
- This project has no `drizzle/` migrations directory — schema changes are applied by `npm run db:push` directly against the live Neon DB (`DATABASE_URL` in `.env.local`, loaded via `drizzle.config.ts`'s `dotenv.config({ path: '.env.local' })`). The executor must run this for real, report its actual output, and must NOT blindly auto-confirm any destructive-change prompt for an unrelated column — if one appears, stop and surface it instead of proceeding.
- No new third-party dependency — this is a schema + existing-pattern extension only.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Schema — add scheduledFor column and push to the live DB</name>
  <files>db/schema.ts</files>
  <action>
Per the required-changes schema decision. In db/schema.ts's `videoCalls` table definition, add a nullable `scheduledFor: timestamp('scheduled_for'),` column directly after `endedAt: timestamp('ended_at'),` (no default, no `.notNull()` — null means "instant call, not scheduled"). `timestamp` is already imported at the top of the file.

Run `npm run db:push` against the live Neon DB. Read its output carefully:
- If it reports only an additive `ADD COLUMN "scheduled_for" timestamp` (or equivalent) for `video_calls` with no other table affected, confirm and let it apply.
- If drizzle-kit prompts interactively about renaming/dropping any OTHER column (a "destructive change" prompt unrelated to this additive nullable column), STOP immediately, do not answer/confirm the prompt, and surface the exact prompt text as a finding instead of proceeding — this indicates unrelated schema drift that must be investigated separately, not silently accepted.

After a successful push, run `npm run db:push` a second time and confirm it reports no further changes (idempotent) — this is the same idempotency pattern already established elsewhere in this project's history (see STATE.md decisions log).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "db/schema\.ts" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo SCHEMA_TSC_OK</automated>
  </verify>
  <done>videoCalls.scheduledFor exists in db/schema.ts and in the live Neon DB (confirmed via a successful `npm run db:push`, with a second consecutive run reporting no changes); no unrelated destructive prompt was auto-accepted; tsc --noEmit reports no errors in db/schema.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend — createVideoCall/createVideoCallAction accept and gate scheduledFor</name>
  <files>lib/video-calls.ts, actions/video-calls.ts, tests/lib/video-calls.test.ts, tests/actions/video-calls.test.ts</files>
  <behavior>
    - `createVideoCall({ ..., scheduledFor: someDate })` inserts `scheduledFor: someDate` into the `videoCalls` row (the call-row insert, not the participants bulk insert) and notifies invitees with a title reading "{creatorName} scheduled a video call for {formatted}" where `formatted = opts.scheduledFor.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })`.
    - `createVideoCall({ ... })` with no `scheduledFor` (or `null`/`undefined`) inserts `scheduledFor: null` and keeps today's exact notification title "{creatorName} started a video call" unchanged.
    - `createVideoCallAction(tabToken, { ..., scheduledFor: '2099-01-01T10:00:00.000Z' })` called by a caller whose `role` fails `isAdminRole` returns `{ status: 'error', message: '<clear message>' }` and never calls `createVideoCall`.
    - `createVideoCallAction(tabToken, { ..., scheduledFor: 'not-a-date' })` or a past ISO datetime, called by an admin caller (`isAdminRole(role)` true), returns `{ status: 'error', message: '<clear message>' }` and never calls `createVideoCall`.
    - `createVideoCallAction(tabToken, { ..., scheduledFor: '<valid future ISO string>' })` called by an admin caller parses it to a `Date` and passes it through as `createVideoCall`'s `scheduledFor` option; omitting `scheduledFor` entirely behaves exactly as today (no regression for any existing test case).
  </behavior>
  <action>
Per SCHED-01/SCHED-02 (backend scheduling support), honoring the locked who-can-schedule (`isAdminRole`) and early-join (room/chat created immediately, `scheduledFor` never gates joinability) decisions.

1. lib/video-calls.ts:
   - Update `export type VideoCallRow` to add `scheduledFor: Date | null` alongside the existing fields.
   - Extend `createVideoCall`'s `opts` parameter type with `scheduledFor?: Date | null`.
   - In the `db.insert(videoCalls).values({ title, createdBy: opts.creatorId })` call, add `scheduledFor: opts.scheduledFor ?? null`.
   - In the invitee notification loop, compute the title conditionally: if `opts.scheduledFor` is set, use the scheduled-call title format above; otherwise keep the existing started-a-call title. `type: 'video_call'` and `callId: row.id` stay exactly as-is — no `notifications` schema change.

2. actions/video-calls.ts:
   - Extend `createVideoCallAction`'s `input` parameter type with `scheduledFor?: string` (ISO datetime string from the client).
   - After the existing `role` is available from `verifySessionForAction`, add validation before calling `createVideoCall`: if `input.scheduledFor` is present and truthy:
     - If `!isAdminRole(role as UserRole)`, return `{ status: 'error', message: 'Only an admin can schedule a call for later.' }` (do not call `createVideoCall`).
     - Parse `new Date(input.scheduledFor)`; if `Number.isNaN(parsed.getTime())` or `parsed.getTime() <= Date.now()`, return `{ status: 'error', message: 'Pick a valid future date and time.' }` (do not call `createVideoCall`).
     - Otherwise pass `scheduledFor: parsed` into the `createVideoCall({...})` call.
   - When `input.scheduledFor` is absent, behavior is unchanged (no `scheduledFor` passed to `createVideoCall`, defaults to `null` inside `lib/video-calls.ts`).

3. Extend tests/lib/video-calls.test.ts's `describe('createVideoCall', ...)` block with two new cases per the behavior block above (scheduled title + inserted column; unscheduled title unchanged + `scheduledFor: null` inserted) — reuse the existing hand-rolled `@/db` mock and `insertValuesMock` call-shape distinction already documented in this file's own comments.

4. Extend tests/actions/video-calls.test.ts's `describe('createVideoCallAction', ...)` block with three new cases per the behavior block above (non-admin caller rejected before `createVideoCallMock` is invoked; admin caller with an invalid/past `scheduledFor` rejected; admin caller with a valid future `scheduledFor` reaches `createVideoCallMock` with a `Date` argument) — reuse the existing `verifyMock`/`queueWhere` conventions already in this file.
  </action>
  <verify>
    <automated>npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts && npx tsc --noEmit 2>&1 | grep -iE "lib/video-calls\.ts|actions/video-calls\.ts" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo BACKEND_OK</automated>
  </verify>
  <done>createVideoCall accepts and persists scheduledFor, varies the invitee notification title accordingly; createVideoCallAction rejects a non-admin-supplied scheduledFor and any invalid/past scheduledFor from an admin, and passes a valid future Date through otherwise; both extended test files pass (new + pre-existing cases green); tsc --noEmit reports no errors in the touched lib/action files.</done>
</task>

<task type="auto">
  <name>Task 3: UI — admin-only scheduling control + Scheduled section on /calls</name>
  <files>app/_components/new-call-form.tsx, app/(app)/calls/page.tsx</files>
  <action>
Per SCHED-03/SCHED-04 (UI for scheduling + list grouping). Exact UI treatment and section-order wording are Claude's Discretion per CONTEXT.md — follow this file's existing form/section conventions.

1. app/_components/new-call-form.tsx:
   - Accept a new prop `isAdmin: boolean` on the component's props type.
   - Add local state `scheduledFor: string` (bound to an `<input type="datetime-local">`'s value) and `schedule: boolean` (whether the "Schedule for later" toggle is on).
   - When `isAdmin` is true, render a toggle control (e.g. a small button/checkbox styled like the existing labels: `text-[11px] font-medium uppercase tracking-wide text-gray-400`) reading "Schedule for later". When toggled on, render a `<input type="datetime-local">` beneath it, styled like the existing title/query inputs (`rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none`). When `isAdmin` is false, render nothing extra — the form is visually identical to today.
   - In `submit()`, before calling `createVideoCallAction`: if `isAdmin && schedule && scheduledFor`, validate client-side that `new Date(scheduledFor).getTime() > Date.now()`; if not, set the existing `message` state to an error (e.g. "Pick a future date and time.") and return without submitting. Otherwise pass `scheduledFor: new Date(scheduledFor).toISOString()` into the `createVideoCallAction(getTabToken(), { title, participantUserIds, scheduledFor })` call; when scheduling is off (or `isAdmin` is false), omit `scheduledFor` entirely from the call (unchanged today's payload shape).
   - Update the submit button's label to reflect state (e.g. "Schedule call" vs "Start call") when `isAdmin && schedule` is true, mirroring the existing `pending ? 'Starting…' : ...` conditional pattern.

2. app/(app)/calls/page.tsx:
   - Add `isAdminRole` to the existing `import { verifySession } from '@/lib/dal'` line (becomes `import { verifySession, isAdminRole } from '@/lib/dal'`).
   - Compute `const isAdmin = isAdminRole(role)` and pass `isAdmin={isAdmin}` as a new prop to `<NewCallForm allUsers={allUsers} isAdmin={isAdmin} />`.
   - Split the existing `active` grouping into two: a call belongs in "Scheduled" when `c.status === 'active' && c.scheduledFor && c.scheduledFor.getTime() > Date.now()`; otherwise (status active and either no scheduledFor or scheduledFor already in the past) it stays in "Active" exactly as today. `ended` (`c.status !== 'active'`) is unchanged.
   - Render a new `<h2>` "Scheduled" section (mirroring the existing "Active" section's markup/classes exactly — same card styling, same "Join" affordance since scheduled calls are still joinable now per the early-join decision) placed directly after the "Active" section, showing each scheduled call's title, participant names, and the scheduled time via the existing `formatWhen(c.scheduledFor)` helper (e.g. as a small "Scheduled for {formatWhen(...)}" line under the title, replacing the participants-name line or appended beneath it — match the Active card's existing information density). Only render this section when `scheduled.length > 0`, same conditional-render pattern as the existing Active/Past blocks.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "new-call-form\.tsx|app/\(app\)/calls/page\.tsx" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && npm run lint 2>&1 | grep -iE "new-call-form|calls/page" | grep -viE "warning" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo UI_LIST_OK</automated>
  </verify>
  <done>Admin callers see a "Schedule for later" datetime control in the new-call form; non-admins see today's form unchanged; submitting a scheduled call passes an ISO scheduledFor to createVideoCallAction; /calls renders a distinct "Scheduled" section for the caller's own future-scheduled active calls, separate from "Active" and "Past"; scheduled calls remain joinable via the same "Join" affordance; tsc and lint report no errors in the touched files.</done>
</task>

<task type="auto">
  <name>Task 4: UI — informational early-join banner in the call room</name>
  <files>app/(app)/calls/[id]/page.tsx, app/_components/video-call-room.tsx</files>
  <action>
Per SCHED-05 (informational-only banner, never blocks joining — the locked early-join decision).

1. app/(app)/calls/[id]/page.tsx: after `const call = await getCall(id)` is confirmed active, compute `const scheduledForFuture = call.scheduledFor && call.scheduledFor.getTime() > Date.now() ? call.scheduledFor.toISOString() : null` and pass `scheduledFor={scheduledForFuture}` (type `string | null`) as a new prop to `<VideoCallRoom .../>`, alongside the existing props. Pass an ISO string (not a raw `Date`) across the server-to-client component boundary — the client component formats it for display.

2. app/_components/video-call-room.tsx: accept a new prop `scheduledFor: string | null`. In the existing banner stack (same location as the `endError`/`mediaBlocked` banners, above `<AddCallParticipants .../>`), add: when `scheduledFor` is non-null, render an informational banner (visually distinct from the amber `mediaBlocked` warning banner — e.g. a blue/primary-tinted `rounded-lg border ... p-3 text-sm` block) reading "Scheduled for {formatted} — you're early, feel free to join now." where `{formatted}` is `new Date(scheduledFor).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })` computed client-side. This banner must never gate, delay, or condition the existing `call.join()` effect, the `CallRoomInner` rendering, or any other joining logic — it is purely additive UI.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "calls/\[id\]/page\.tsx|video-call-room\.tsx" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && npm run lint 2>&1 | grep -iE "calls/\[id\]/page|video-call-room" | grep -viE "warning" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo BANNER_OK</automated>
  </verify>
  <done>Visiting a call room whose scheduledFor is in the future shows an informational banner with the formatted scheduled time; the banner never blocks or delays call.join(); a call with no scheduledFor (or one already in the past) shows no banner and behaves exactly as today; tsc and lint report no errors in the touched files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Browser (new-call-form.tsx) -> createVideoCallAction | Untrusted client input: scheduledFor ISO string, potentially supplied even from a non-admin session via a tampered request |
| Server (actions/video-calls.ts) -> lib/video-calls.ts -> DB/GetStream | Trusted server-to-server calls, unchanged by this plan |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|------------------|
| T-alz-01 | Elevation of Privilege | createVideoCallAction | mitigate | Server-side `isAdminRole(role)` check rejects any `scheduledFor` value from a non-admin caller before `createVideoCall` is ever invoked, regardless of what the client UI shows — covered by new action tests in Task 2 |
| T-alz-02 | Tampering | createVideoCallAction | mitigate | `scheduledFor` is parsed via `new Date(...)` and validated as a real, strictly-future timestamp server-side; invalid or past values are rejected before reaching `createVideoCall` — covered by new action tests in Task 2 |
| T-alz-03 | Tampering | `npm run db:push` against the live Neon DB | mitigate | Task 1 explicitly instructs the executor to inspect push output and halt on any unrelated destructive-change prompt rather than auto-confirming it |
</threat_model>

<verification>
- `npx tsc --noEmit` passes project-wide (or at minimum shows zero errors in every file listed in `files_modified`).
- `npm run lint` passes for every touched file.
- `npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts` passes (existing + new cases).
- `npm run db:push` was run against the live Neon DB and confirmed idempotent on a second consecutive run.
- Manual smoke (dev server): as an admin, toggle "Schedule for later", pick a future time, start the call — confirm it appears under "Scheduled" on `/calls` for both the creator and an invitee, the invitee's notification reads the scheduled-call title, and the room is joinable immediately with the informational banner visible. As a non-admin, confirm no scheduling control is visible and the form behaves exactly as before.
</verification>

<success_criteria>
- All 4 tasks' `<done>` criteria met.
- Every `must_haves` truth is observable in the running app.
- No `notifications` schema change; no new third-party dependency; no change to who-can-schedule or early-join semantics.
- Non-admin "Start a call" flow is pixel-for-pixel unchanged.
</success_criteria>

<output>
Create `.planning/quick/260724-alz-super-admin-ability-to-schedule-a-video-/260724-alz-SUMMARY.md` when done.
</output>
