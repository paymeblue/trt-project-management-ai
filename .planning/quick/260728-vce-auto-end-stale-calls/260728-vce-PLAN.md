---
phase: quick-260728-vce
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/schema.ts
  - lib/call-sweep.ts
  - lib/video-calls.ts
  - app/(app)/calls/[id]/page.tsx
  - app/api/calls/[id]/leave/route.ts
  - app/api/cron/end-stale-calls/route.ts
  - app/_components/video-call-room.tsx
  - netlify/functions/end-stale-calls.mts
  - netlify.toml
  - scripts/end-stale-calls.ts
  - tests/lib/call-sweep.test.ts
  - tests/lib/video-calls.test.ts
  - tests/app/api/cron-end-stale-calls.test.ts
autonomous: true
requirements: [VCE-01, VCE-02, VCE-03]
must_haves:
  truths:
    - "When the last person in a call room leaves, the call stops being ACTIVE without anyone clicking 'End for everyone'"
    - "A call that everybody abandoned (tab closed, no request ever reached the server) is ended by the scheduled sweep within one cron interval past its grace window"
    - "A scheduled call whose scheduled_for is still in the future is never swept"
    - "A call with people currently in it is never swept"
    - "The 3 existing zombie rows no longer appear under ACTIVE with a Join button"
    - "A call still appears in every past participant's call history after they leave it"
  artifacts:
    - path: "lib/call-sweep.ts"
      provides: "Pure, dependency-free sweepability predicate + thresholds"
      exports: ["evaluateCallForSweep", "EMPTY_GRACE_MINUTES", "NEVER_JOINED_MINUTES", "MAX_AGE_HOURS"]
    - path: "app/api/calls/[id]/leave/route.ts"
      provides: "Unload-survivable leave endpoint (keepalive fetch target)"
      exports: ["POST"]
    - path: "app/api/cron/end-stale-calls/route.ts"
      provides: "CRON_SECRET-protected sweep trigger"
      exports: ["POST"]
    - path: "netlify/functions/end-stale-calls.mts"
      provides: "Scheduled trigger for the sweep route"
    - path: "scripts/end-stale-calls.ts"
      provides: "Dry-run-by-default one-off cleanup of existing zombie rows"
    - path: "tests/lib/call-sweep.test.ts"
      provides: "Exhaustive coverage of the predicate that could wrongly kill a live call"
  key_links:
    - from: "app/_components/video-call-room.tsx"
      to: "/api/calls/{id}/leave"
      via: "fetch with keepalive:true on unmount and pagehide"
      pattern: "keepalive:\\s*true"
    - from: "app/api/calls/[id]/leave/route.ts"
      to: "markCallParticipantLeft"
      via: "server-side presence write + auto-end"
      pattern: "markCallParticipantLeft"
    - from: "lib/video-calls.ts"
      to: "evaluateCallForSweep"
      via: "sweepStaleCalls delegates every end/skip decision to the pure predicate"
      pattern: "evaluateCallForSweep"
    - from: "scripts/end-stale-calls.ts"
      to: "evaluateCallForSweep"
      via: "same predicate as the cron job — cannot drift"
      pattern: "evaluateCallForSweep"
---

<objective>
Video calls stay ACTIVE forever because `endVideoCall()` — the only thing that
sets `ended_at` — is wired to exactly one button. Fix the DATA lifecycle with
two layers: an event-driven auto-end when the last person leaves the room, and
an authoritative server-side sweep that ends calls nobody could still be in.
Then clean up the 3 existing zombie rows.

Purpose: a call the user actually left should not keep offering a Join button.
Output: presence tracking on participants, an auto-end-on-last-leave path, a
scheduled stale-call sweep reusing the existing CRON_SECRET mechanism, and a
one-off cleanup script.

## Deviation from the brief — read before Task 1

The brief says the leave path should "prune their participant row". **Do not
delete the row.** `getMyCalls()` (lib/video-calls.ts:343-356) derives a user's
entire call list — active AND past — from `video_call_participants`. Deleting
on leave would erase the call from the leaver's history the moment they hang
up, and would shrink the "N people invited" count shown in the room header as
people drop off. `video_call_participants` is the INVITE list, not the
in-the-room list.

Instead: add two nullable presence timestamps and treat "present" as a derived
predicate. `removeCallParticipant()`'s hard delete stays exactly as-is — that
is "uninvite", a genuinely different operation, and it keeps its only caller
(`removeVideoCallParticipantAction`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md

@lib/video-calls.ts
@actions/video-calls.ts
@app/_components/video-call-room.tsx
@app/api/cron/call-reminders/route.ts
@netlify/functions/send-call-reminders.mts
@scripts/backfill-step-escalations.ts
@tests/lib/video-calls.test.ts
@tests/app/api/cron-call-reminders.test.ts
</context>

<interfaces>
<!-- Contracts already in the codebase. Use directly; no exploration needed. -->

From db/schema.ts (line 584):
```
videoCalls: id, title, createdBy, status ('active'|'ended'), createdAt,
            endedAt, scheduledFor, reminderSentAt      (all timestamps NAIVE)
videoCallParticipants: id, callId (cascade), userId, invitedBy, createdAt
            + unique(callId, userId)
```

From lib/video-calls.ts:
```ts
export async function endVideoCall(callId: string): Promise<void>          // status+endedAt, then best-effort GetStream .end()
export async function removeCallParticipant(callId, userId): Promise<void> // hard delete — uninvite, leave as-is
export async function ensureCallParticipant(callId, userId): Promise<void> // early-returns when row exists
export async function sendDueCallReminders(): Promise<{ remindedCallIds: string[] }>
```

From lib/dal.ts:
```ts
export const verifySession: () => Promise<{ userId: string; role: Role }>   // reads Authorization: Bearer <tabToken>, else cookie session; redirect()s on failure
export async function verifySessionForAction(explicitToken?: string | null)
```

From lib/use-tab-token.ts (client):
```ts
export function getTabToken(): string | null
```

Existing cron auth shape (app/api/cron/call-reminders/route.ts) — copy verbatim:
```ts
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  ...
}
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Presence columns + the pure sweepability predicate</name>
  <files>db/schema.ts, lib/call-sweep.ts, tests/lib/call-sweep.test.ts</files>
  <behavior>
    `evaluateCallForSweep(candidate, now)` returns `{ sweep, reason }`. Rules are
    evaluated IN THIS ORDER — the two refusals come first so they can never be
    overridden by an age rule:

    1. `scheduledFor` > now                          -> { sweep: false, reason: 'scheduled-in-future' }
    2. `presentCount` > 0                            -> { sweep: false, reason: 'participants-present' }
    3. everJoined && lastLeftAt && now - lastLeftAt >= EMPTY_GRACE_MINUTES
                                                     -> { sweep: true,  reason: 'empty-since-last-leave' }
    4. !everJoined && now - effectiveStart >= NEVER_JOINED_MINUTES
                                                     -> { sweep: true,  reason: 'never-joined' }
    5. now - effectiveStart >= MAX_AGE_HOURS         -> { sweep: true,  reason: 'absolute-age-ceiling' }
    6. otherwise                                     -> { sweep: false, reason: 'within-grace' }

    `effectiveStart = scheduledFor ?? createdAt` — a scheduled call is measured
    from when it was supposed to START, not from when it was created days earlier.

    Test table (every row an explicit `it`):
    - future scheduledFor + created 5 days ago + nobody joined -> false/'scheduled-in-future' (rule 1 beats rules 4 AND 5 — the exact "never sweep a future scheduled call" guarantee)
    - future scheduledFor + 30 days old -> false (absolute ceiling must NOT override rule 1)
    - presentCount 3 + created 5 days ago -> false/'participants-present'
    - presentCount 1 + 30 days old -> false (absolute ceiling must NOT override rule 2)
    - everJoined, presentCount 0, lastLeftAt 14 min ago -> false/'within-grace'
    - everJoined, presentCount 0, lastLeftAt exactly EMPTY_GRACE_MINUTES ago -> true/'empty-since-last-leave' (boundary is inclusive)
    - everJoined, presentCount 0, lastLeftAt 2 h ago -> true/'empty-since-last-leave'
    - never joined, created 59 min ago -> false/'within-grace'
    - never joined, created exactly NEVER_JOINED_MINUTES ago -> true/'never-joined'
    - never joined, scheduledFor 10 min in the PAST, created 5 days ago -> false/'within-grace' (effectiveStart is scheduledFor, not createdAt)
    - never joined, scheduledFor 3 h in the past -> true/'never-joined'
    - everJoined, presentCount 0, lastLeftAt null (impossible-by-construction defensive case), created 13 h ago -> true/'absolute-age-ceiling'
    - everJoined, presentCount 0, lastLeftAt null, created 1 h ago -> false/'within-grace' (defensive case must NOT sweep early)
  </behavior>
  <action>
Add two nullable timestamp columns to `videoCallParticipants` in db/schema.ts:
`joinedAt: timestamp('joined_at')` and `leftAt: timestamp('left_at')`. Comment
them densely (quick task 260728-vce): the row itself is the INVITE record and
must survive a leave (getMyCalls reads it for call history), so presence is
derived, not represented by row existence. "Currently present" ==
`joinedAt IS NOT NULL AND (leftAt IS NULL OR leftAt < joinedAt)` — the
`leftAt < joinedAt` half is what makes rejoining the same call work without
clearing anything.

Create lib/call-sweep.ts as a PURE module: no `server-only`, no db import, no
env access, no `new Date()` inside it. It takes `now` as an argument
specifically so callers pass Postgres' own clock (the schema's `timestamp`
columns are naive — this repo has a documented incident, quick task 260706-bpg,
where a JS-side `new Date()` compared against a naive column landed skewed by
the app server's UTC offset and silently broke a freshness window). Being
dependency-free is also what lets both the cron job and the tsx cleanup script
import the identical predicate, so they can never drift.

Export:
```ts
export const EMPTY_GRACE_MINUTES = 15
export const NEVER_JOINED_MINUTES = 60
export const MAX_AGE_HOURS = 12
export type SweepCandidate = {
  callId: string
  createdAt: Date
  scheduledFor: Date | null
  presentCount: number
  everJoined: boolean
  lastLeftAt: Date | null
}
export type SweepReason =
  | 'scheduled-in-future' | 'participants-present' | 'within-grace'
  | 'empty-since-last-leave' | 'never-joined' | 'absolute-age-ceiling'
export type SweepDecision = { sweep: boolean; reason: SweepReason }
export function evaluateCallForSweep(c: SweepCandidate, now: Date): SweepDecision
```
Justify each threshold in a comment: 15 min after the last person leaves is far
longer than any reconnect/refresh gap (the room re-stamps joinedAt on every
render, so a refresh restores presence long before the window elapses); 60 min
covers "created a call, nobody ever opened the room"; the 12 h ceiling exists
only to guarantee no row can be immortal if presence tracking itself has a bug.

Write tests/lib/call-sweep.test.ts covering the full table above. Build dates
relative to a fixed `now` constant so the tests are not clock-dependent.

Run `npm run db:push` to apply the additive columns (both nullable, no
backfill needed — see Task 3's note on what NULL joinedAt means for pre-existing rows).
  </action>
  <verify>
    <automated>npx vitest run tests/lib/call-sweep.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Columns exist in Neon (`npm run db:push` clean), predicate exported, every behavior row above has a passing test, and rules 1 and 2 provably beat the age rules.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Auto-end when the last person leaves (event-driven path)</name>
  <files>lib/video-calls.ts, app/(app)/calls/[id]/page.tsx, app/api/calls/[id]/leave/route.ts, app/_components/video-call-room.tsx, tests/lib/video-calls.test.ts</files>
  <behavior>
    - `markCallParticipantLeft` on a call where OTHER participants are still present: stamps leftAt, does NOT call endVideoCall, returns `{ callEnded: false }`.
    - `markCallParticipantLeft` on the last present participant: stamps leftAt, calls endVideoCall once, returns `{ callEnded: true }`.
    - `markCallParticipantLeft` for a call already `status !== 'active'`: no endVideoCall call, returns `{ callEnded: false }` (idempotent — unmount and pagehide can both fire).
    - `ensureCallParticipant` on an EXISTING participant row: still inserts nothing and still touches no GetStream membership, but now stamps `joinedAt = now(), leftAt = null`.
  </behavior>
  <action>
In lib/video-calls.ts add, next to `removeCallParticipant`:

`markCallParticipantJoined(callId, userId)` — `update videoCallParticipants set joinedAt = sql\`now()\`, leftAt = null` for that (callId, userId). Postgres clock, per Task 1's rationale.

Refactor `ensureCallParticipant` so its existing-row early return skips only the
insert + upsertUsers + updateCallMembers + addChatChannelMembers work, then
ALWAYS calls `markCallParticipantJoined` on the way out. Keep the existing
comment and add why: the room page is the single join site, and a rejoin must
re-establish presence even though the invite row already exists. No change to
app/(app)/calls/[id]/page.tsx is needed if the marking lives inside
ensureCallParticipant — verify that and leave the page alone if so; only touch
it if the refactor makes a separate call site clearer.

`markCallParticipantLeft(callId, userId): Promise<{ callEnded: boolean }>`:
1. `update ... set leftAt = sql\`now()\`` for that (callId, userId).
2. Re-read the call; if `status !== 'active'` return `{ callEnded: false }` — someone already ended it.
3. Count still-present rows for the call using the derived predicate
   (`joinedAt IS NOT NULL AND (leftAt IS NULL OR leftAt < joinedAt)`), expressed
   with drizzle's `sql` template against the columns.
4. If the count is 0, `await endVideoCall(callId)` and return `{ callEnded: true }`.
Comment the reuse explicitly: endVideoCall is NOT forked — status + endedAt +
best-effort GetStream `.end()` behavior stays identical to the button path, so
the two ways a call can end can never diverge.

Create app/api/calls/[id]/leave/route.ts (Next 16: `params` is a Promise —
`const { id } = await params`, and copy the `RouteContext`/params shape from an
existing dynamic route if one is handier). Auth: call `verifySession()`, which
already reads `Authorization: Bearer <tabToken>` and falls back to the cookie
session (lib/dal.ts:25-35). Wrap it in try/catch and return
`NextResponse.json({ error: 'unauthorized' }, { status: 401 })` on throw —
verifySession `redirect()`s on failure, which throws NEXT_REDIRECT, and a
fire-and-forget beacon must never surface a redirect. Then:
- Derive userId ONLY from the session. Never accept a userId from the body — that
  would let any signed-in user mark anyone else as gone and force-end a live call (T-vce-01).
- Confirm a `video_call_participants` row exists for (id, userId); 403 if not.
- `await markCallParticipantLeft(id, userId)`, return `{ ok: true, callEnded }`.
- `export const dynamic = 'force-dynamic'`.

In app/_components/video-call-room.tsx, add a `notifyServerLeft(callId)` helper
and a `leftNotifiedRef` guard so it POSTs at most once per room mount:
```
fetch(`/api/calls/${callId}/leave`, {
  method: 'POST',
  keepalive: true,
  headers: { authorization: `Bearer ${getTabToken() ?? ''}` },
}).catch(() => {})
```
Call it from BOTH exit paths already added by 260728-vpm: the join effect's
unmount cleanup (alongside `releaseCallResources`) and the `pagehide` handler.
Do NOT put it inside `releaseCallResources` — that function is documented as
media-hardware release and must stay synchronous-ish and failure-isolated.

Comment the transport choice densely:
- `keepalive: true` is what lets the request outlive the document being torn
  down, which is the whole point on `pagehide`.
- `navigator.sendBeacon` gives the same unload survivability but cannot set an
  `Authorization` header (it only takes a body + content-type), which would
  force this app's per-tab token into a request body and fork the auth path
  that lib/dal.ts already supports. keepalive fetch keeps one auth path.
- One code path for unmount AND pagehide (rather than a server action for one
  and a beacon for the other) so the two can never drift — same reasoning the
  file already applies to `enableMedia`.
- This is BEST-EFFORT by nature: a hard tab kill, a crash, an OS-level process
  kill, or an offline device can all drop the request. That is precisely why
  Task 3's sweep exists as the authoritative backstop, not as a nice-to-have.

Extend tests/lib/video-calls.test.ts with the four behaviors above, following
the existing `selectWhereMock.mockResolvedValueOnce` chaining style. The mock
`db.update()` already records via `updateSetMock`/`updateWhereMock`.
  </action>
  <verify>
    <automated>npx vitest run tests/lib/video-calls.test.ts && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>Leaving a room stamps leftAt server-side; the last leaver's request ends the call via the existing endVideoCall; a second fire is a no-op; the route rejects unauthenticated callers and ignores any body-supplied user id.</done>
</task>

<task type="auto">
  <name>Task 3: Stale-call sweep (authoritative backstop)</name>
  <files>lib/video-calls.ts, app/api/cron/end-stale-calls/route.ts, netlify/functions/end-stale-calls.mts, netlify.toml, tests/app/api/cron-end-stale-calls.test.ts</files>
  <action>
Add `sweepStaleCalls(): Promise<{ examined: number; endedCallIds: string[]; skipped: { callId: string; reason: string }[] }>` to lib/video-calls.ts:

1. Read the DB clock once: `select now()` via `db.execute(sql\`select now() as now\`)`.
   Pass that as `now` to every predicate call. Do NOT use `new Date()` — same naive-timestamp
   rationale as Task 1, and the same convention `sendDueCallReminders` already follows.
2. Select candidate calls: `status = 'active' AND endedAt IS NULL`.
3. One grouped query over `video_call_participants` for those call ids producing,
   per call: `presentCount` (count where the derived present predicate holds),
   `everJoined` (bool_or joinedAt IS NOT NULL), `lastLeftAt` (max leftAt).
   Assemble `SweepCandidate`s in JS; a call with zero participant rows gets
   presentCount 0 / everJoined false / lastLeftAt null.
4. For each, `evaluateCallForSweep(candidate, now)`. Push non-sweepable ones into
   `skipped` with their reason (the reason string is the operational trail for why
   a call was left alone — keep it).
5. For each sweepable candidate, run a best-effort GetStream live-session veto
   BEFORE ending: `streamClient().video.call('default', id).get()` and skip the
   call if the response reports a live session with participants. Check the
   installed @stream-io/node-sdk types for the real field name rather than
   guessing (likely `call.session?.participants`); if the installed version does
   not expose live session participants, DROP the veto entirely and say so in a
   comment — an invented field that always reads undefined is worse than no veto,
   because it looks like a safety net while doing nothing. Wrap in try/catch: a
   GetStream error proceeds with the DB decision (the thresholds are already
   conservative), never blocks our own DB update — same contract as endVideoCall.
6. `await endVideoCall(id)` for survivors. Reuse it, do not fork it.

Dense comment on why the veto matters at deploy time specifically: every
participant row that predates this task has `joined_at = NULL`, so any call
in progress at deploy that was created over NEVER_JOINED_MINUTES ago looks
"never joined" to the predicate. The room page re-stamps joinedAt on render,
but a tab that is already open does not re-render. The GetStream live-session
check is the mitigation for exactly that one-time window.

Create app/api/cron/end-stale-calls/route.ts as a byte-for-byte structural copy
of app/api/cron/call-reminders/route.ts (same Bearer CRON_SECRET check, same
`dynamic = 'force-dynamic'`, same NextResponse shape), returning
`{ ok, endedCount, endedCallIds, skippedCount }`.

Create netlify/functions/end-stale-calls.mts mirroring send-call-reminders.mts
exactly — same `SITE_URL ?? URL` fallback and its comment, same thin-trigger
posture (zero logic in the function), pointing at `/api/cron/end-stale-calls`,
with `export const config: Config = { schedule: '*/10 * * * *' }`. 10 minutes,
not 5: the sweep's tightest window is a 15-minute grace, so a 10-minute cadence
bounds worst-case staleness at 25 minutes while halving the invocations.

netlify.toml already has `[functions] directory = "netlify/functions"`, so the
new function is picked up automatically — add only a comment noting the second
scheduled function. Do NOT add a `[build]` section (the existing comment in that
file explains why at length).

Write tests/app/api/cron-end-stale-calls.test.ts mirroring
tests/app/api/cron-call-reminders.test.ts: missing header -> 401 and
sweepStaleCalls never called; wrong secret -> 401; CRON_SECRET unset -> 401;
correct Bearer -> 200 with the counts from the mocked lib function.
  </action>
  <verify>
    <automated>npx vitest run tests/app/api/cron-end-stale-calls.test.ts && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>A scheduled function calls a CRON_SECRET-protected route that ends only calls the pure predicate approves and GetStream does not veto; unauthorized callers get 401 and trigger no DB work.</done>
</task>

<task type="auto">
  <name>Task 4: One-off zombie cleanup + full verification</name>
  <files>scripts/end-stale-calls.ts, package.json</files>
  <action>
Create scripts/end-stale-calls.ts following scripts/backfill-step-escalations.ts
conventions exactly: `config({ path: '.env.local' })`, `drizzle(neon(process.env.DATABASE_URL!), { schema })`,
`const APPLY = process.argv.includes('--apply')`, a header comment stating root
cause + usage, per-row `WOULD END` / `END` logging, and a `── Summary ──` block.

It imports `evaluateCallForSweep` from ../lib/call-sweep (pure, no server-only,
no GetStream env) so the one-off and the cron can never disagree about what
"stale" means. It deliberately does NOT import lib/video-calls.ts and therefore
does NOT call GetStream `.end()` — it performs the DB half only
(`status = 'ended', ended_at = now()`), which is the half every page in this app
actually reads. Say that in the header comment: these rows are days-old
abandoned sessions GetStream has long since torn down on its own, and requiring
GETSTREAM_SECRET would make a cleanup script fail for a reason unrelated to its job.

Same DB-clock discipline: read `select now()` once and pass it to the predicate.
Build each SweepCandidate from the same presence aggregation Task 3 uses.

Print, for every active call: id, title, createdAt, scheduledFor, presentCount,
everJoined, lastLeftAt, and the decision `{ sweep, reason }` — dry run must be
truthful enough to decide from without re-querying. After `--apply`, print the
remaining `status='active'` count.

Add `"calls:end-stale": "tsx scripts/end-stale-calls.ts"` to package.json
scripts, matching the existing `verify:*` / `db:migrate-*` entries.

Then, in order:
1. `npx tsx scripts/end-stale-calls.ts` (dry run). Report the exact output —
   including which of the 3 known zombie rows (created 2026-07-22T11:45:58Z,
   2026-07-23T11:31:53Z, 2026-07-28T12:52:00Z) are flagged and with what reason.
   The 2026-07-28 row may legitimately fall inside a grace window; if the
   predicate declines it, that is CORRECT behavior — do not widen a threshold to
   force it, the scheduled sweep will take it later.
2. `npx tsx scripts/end-stale-calls.ts --apply`.
3. Re-run the dry run to confirm the applied rows are gone from the candidate set.
4. Full gates: `npx tsc --noEmit`, `npm run lint`, `npm test`.
   Baseline is 450 passed + 1 todo — assert the new total equals 450 + the tests
   added in Tasks 1-3, with zero previously-passing tests newly failing. If any
   pre-existing test broke, fix the cause, do not adjust the test.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm test</automated>
  </verify>
  <done>Dry run reported, --apply run, remaining active-call count printed, and tsc/lint/test all green with no regression against the 450-passed baseline.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> /api/calls/[id]/leave | Any signed-in user can POST here; a leave now has the side effect of ENDING a call |
| Netlify scheduled fn -> /api/cron/end-stale-calls | Public internet can reach the route; only the shared secret separates it |
| sweepStaleCalls -> video_calls | An automated writer that can terminate an in-progress meeting |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vce-01 | Spoofing / Elevation | app/api/calls/[id]/leave/route.ts | mitigate | userId comes ONLY from `verifySession()`; a body-supplied userId is never read; caller must already have a participant row for that call (403 otherwise) — so it can only ever end a call by removing its OWN presence |
| T-vce-02 | Denial of Service | sweepStaleCalls | mitigate | Refusal rules (future `scheduledFor`, `presentCount > 0`) are evaluated FIRST and cannot be overridden by any age rule; thresholds are 15 min / 60 min / 12 h; best-effort GetStream live-session veto; predicate is pure and exhaustively unit-tested (Task 1) |
| T-vce-03 | Spoofing | app/api/cron/end-stale-calls/route.ts | mitigate | Bearer CRON_SECRET check copied verbatim from the existing call-reminders route; unset secret fails closed (401); route does zero DB work before the check |
| T-vce-04 | Tampering | scripts/end-stale-calls.ts | mitigate | Dry run is the default; writes require an explicit `--apply`; the same shared predicate gates every row so an operator cannot hand-pick a live call |
| T-vce-05 | Information disclosure | leave route response | accept | Response is `{ ok, callEnded }` only — no participant identities or call metadata leak to a caller who is already a participant |
| T-vce-SC | Tampering | npm/pip/cargo installs | n/a | No new dependencies in this task — nothing is installed, so the package legitimacy gate does not apply |
</threat_model>

<verification>
- `npx tsc --noEmit` clean
- `npm run lint` clean
- `npm test` green, no regression against the 450-passed + 1-todo baseline
- `npm run db:push` applied both nullable columns without a destructive prompt
- Manual: open a call in two tabs, close one -> call stays ACTIVE; close the second -> call moves out of ACTIVE without anyone pressing "End for everyone"
- Manual: the call still appears under the ended/past list for both participants afterwards (history preserved — the deviation in `<objective>` is load-bearing here)
</verification>

<success_criteria>
- Calls nobody is in stop being listed as ACTIVE with a Join button
- The `/calls` page's active/ended filter expressions are UNCHANGED (`app/(app)/calls/page.tsx:34-39`) — only the data reaching them changed
- `endVideoCall` is unmodified and is the single code path that ends a call
- The 3 known zombie rows are resolved (ended by the script, or explicitly reported as within-grace with the scheduled sweep owning them)
- A future-scheduled call is provably never swept, backed by a test
</success_criteria>

<output>
Create `.planning/quick/260728-vce-auto-end-stale-calls/260728-vce-SUMMARY.md` when done
</output>
