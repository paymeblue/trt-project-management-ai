---
phase: quick-260726-dw4
plan: 01
subsystem: video-calls
tags: [drizzle, postgres, netlify-scheduled-functions, notifications, next16, cron]

requires:
  - phase: quick-260724-alz
    provides: videoCalls.scheduledFor (nullable), createVideoCall/createVideoCallAction scheduling support
provides:
  - videoCalls.reminderSentAt idempotency-gate column
  - sendDueCallReminders() reminder job (lib/video-calls.ts)
  - VIDEO_CALL_REMINDER_NOTIFICATION_TYPE + widened sidebar badge count
  - CRON_SECRET-protected internal cron route (app/api/cron/call-reminders/route.ts)
  - Netlify Scheduled Function trigger (netlify/functions/send-call-reminders.mts) + netlify.toml
affects: [video-calls, notifications, netlify-infra]

tech-stack:
  added:
    - "@netlify/functions@^5.3.0 (devDependency, Config type only)"
    - "netlify-cli@^27.0.0 (devDependency, local testing)"
  patterns:
    - "SQL-native now() (drizzle sql`now()`) for both the due-call window comparison and the reminderSentAt write — established convention from quick task 260706-bpg's naive-timestamp clock-skew incident, applied here per explicit executor override rather than the plan's literal new Date() wording"
    - "Netlify Functions v2 API shape (export default + export const config: Config) for scheduled functions, per RESEARCH.md's verified-current convention — not the deprecated exports.handler/schedule() wrapper"

key-files:
  created:
    - app/api/cron/call-reminders/route.ts
    - tests/app/api/cron-call-reminders.test.ts
    - netlify.toml
    - netlify/functions/send-call-reminders.mts
    - app/_components/participant-picker.tsx
    - app/_components/schedule-call-form.tsx
  modified:
    - db/schema.ts
    - lib/video-calls.ts
    - lib/notifications.ts
    - tests/lib/video-calls.test.ts
    - package.json
    - package-lock.json
    - .env.local (gitignored, not committed)
    - app/_components/new-call-form.tsx
    - app/(app)/calls/page.tsx

key-decisions:
  - "Task 2 deviated from the plan's literal new Date()/windowEnd wording: used gt(videoCalls.scheduledFor, sql`now()`) / lte(videoCalls.scheduledFor, sql`now() + interval '1 hour'`) for the window query, and sql`now()` (not new Date()) for the reminderSentAt write — per explicit orchestrator override citing the repo's documented naive-timestamp clock-skew incident (260706-bpg, commit 618ea95)."
  - "Task 4's npm install used --legacy-peer-deps: netlify-cli's transitive dependency tree has a peer range on @opentelemetry/api that conflicted with vitest's own peer requirement under strict ERESOLVE. devDependency-only addition, no runtime code affected, so the override is safe. (Installed/committed by the coordinator directly as d0f10dc after an earlier attempt by this executor appeared to hang — see Known Issues below for the real root cause.)"

requirements-completed: []  # partial plan execution — see Status below; final requirements marked complete only once all 8 tasks finish (specifically Task 6's human-action checkpoint)

duration: in-progress (Tasks 1-2, 4-5, 7-8 complete; Task 6 still pending human dashboard verification)
completed: null
---

# Quick Task 260726-dw4: Schedule Call button/modal + 1-hour reminders Summary

**Tasks 1-2, 4-5, 7-8 complete (schema, reminder backend, cron route, Netlify scheduled function + netlify.toml, shared ParticipantPicker, new-call-form.tsx pure start-now revert, Schedule Call modal wired into /calls). Only Task 6 (blocking human-action: real Netlify deploy + dashboard verification) remains outstanding — deliberately worked ahead of it per the orchestrator's direction since Tasks 7-8 have no technical dependency on Task 6 succeeding.**

## Status

IN PROGRESS — 7/8 tasks complete. Task 6 (checkpoint:human-action, gate="blocking") is the only remaining item; it requires the user to log into the Netlify dashboard, which cannot be done from this environment. All frontend/backend code is complete and verified; only the live-deploy confirmation is outstanding.

## Task Commits

1. **Task 1: Schema — add reminderSentAt column and push to the live DB** - `01f545a` (feat)
2. **Task 2: Backend — sendDueCallReminders + reminder-aware sidebar badge** - `d6be44a` (feat)
3. **Task 3: Confirm @netlify/functions and netlify-cli are legitimate before installing** - RESOLVED (human independently verified both packages on npmjs.com; checkpoint cleared)
4. **Task 4: Internal cron route handler — CRON_SECRET Bearer auth + sendDueCallReminders** - `d0f10dc` (npm install, committed by coordinator directly) + `fe931d2` (route handler + test + env vars)
5. **Task 5: Netlify Scheduled Function trigger + minimal netlify.toml** - `4e24069` (feat)
6. **Task 6: Deploy and verify the Netlify Scheduled Function actually runs** - PENDING (checkpoint:human-action, gate=blocking — requires a real Netlify deploy + dashboard access this environment cannot perform; user's dashboard session in progress)
7. **Task 7: Shared participant picker + revert new-call-form.tsx to pure start-now flow** - `43073de` (refactor)
8. **Task 8: Schedule Call button + modal, wired into /calls** - `a8beb81` (feat)

## Task 1 detail

- Added `reminderSentAt: timestamp('reminder_sent_at')` (nullable, no default) to `videoCalls` in `db/schema.ts`, directly after `scheduledFor`.
- Ran `npm run db:push` against the live Neon DB for real: applied cleanly with no prompt (drizzle-kit detected an unambiguous additive `ADD COLUMN`, no rename/destructive-change prompt appeared).
- Verified directly against the live DB via `information_schema.columns` that `video_calls` gained exactly one new nullable `timestamp without time zone` column (`reminder_sent_at`) — no other table/column touched.
- Ran `npm run db:push` a second time: reported "No changes detected" — confirmed idempotent.
- `npx tsc --noEmit` clean project-wide.

## Task 2 detail

- `lib/notifications.ts`: added `VIDEO_CALL_REMINDER_NOTIFICATION_TYPE = 'video_call_reminder'`. Widened `getVideoCallUnreadCount`'s filter from a single `eq` to `inArray(notifications.type, [VIDEO_CALL_NOTIFICATION_TYPE, VIDEO_CALL_REMINDER_NOTIFICATION_TYPE])`. Did not touch `pending-call-gate.tsx`'s hardcoded `'video_call'`-only filter (deliberate, per constraints).
- `lib/video-calls.ts`: added `sendDueCallReminders(): Promise<{ remindedCallIds: string[] }>`. Selects `videoCalls` rows where `status='active'`, `scheduledFor` is not null, inside the next-hour window, and `reminderSentAt IS NULL`; for each due call, queries its participants, derives invitees (participants minus creator), notifies each via `notifyUser` with `type: 'video_call_reminder'`, then marks `reminderSentAt` and collects the call id.
- **Deviation from the plan's literal wording (per explicit orchestrator override, not a self-directed Rule 1-4 decision):** the plan's Task 2 action text specified computing `now = new Date()` / `windowEnd = new Date(now.getTime() + 3600000)` and comparing with `gt`/`lte` against those JS Date values, then writing `reminderSentAt: new Date()`. Deviated to use Postgres-native `now()` via drizzle's `sql` template for both the window comparison (`gt(videoCalls.scheduledFor, sql\`now()\`)`, `lte(videoCalls.scheduledFor, sql\`now() + interval '1 hour'\`)`) and the `reminderSentAt` write (`sql\`now()\``) instead — this repo has a documented, previously-fixed incident (quick task 260706-bpg, commit 618ea95) where a JS `new Date()` compared against a naive (no-timezone) `timestamp` column diverged from Postgres's own clock, silently breaking a freshness-window comparison (typing-indicator staleness). The existing `app/api/messages/typing/route.ts` and `app/api/messages/route.ts` already encode this exact convention (`sql\`now()\`` for both the write and the freshness-window read) — `sendDueCallReminders` now follows the same established pattern for consistency and to avoid reintroducing the same bug class in a brand-new time-window query.
- Extended `tests/lib/video-calls.test.ts`: destructured `sendDueCallReminders` from the module import; added a `vi.mock('@/lib/notifications', ...)` export for `VIDEO_CALL_REMINDER_NOTIFICATION_TYPE`; added a new `describe('sendDueCallReminders', ...)` block with 4 cases — (a) notifies non-creator participants once each with the expected type/title, marks reminded; (b) a call excluded by the WHERE clause (empty select) results in zero notifications; (c) calling the function twice never re-notifies on the second run; (d) the creator is never included in the invitee list even when present in the participants rows.
- `npx vitest run tests/lib/video-calls.test.ts`: 13/13 passed (9 pre-existing + 4 new).
- `npx tsc --noEmit` and `npm run lint`: clean on both touched files.

## Task 3 detail (checkpoint, resolved)

- Ran `npm view @netlify/functions version/repository.url/maintainers/time.created` and the same for `netlify-cli` against the live npm registry: both resolve to the exact versions RESEARCH.md assumed (`5.3.0` / `27.0.0`), official `@netlify`/`netlify` org repos, maintainer emails at `@netlify.com`, multi-year publication history (2021 / 2014).
- Presented this to the human for independent confirmation on npmjs.com per the blocking-human gate (could not self-approve). Human confirmed independently — checkpoint cleared, proceeded to Task 4.

## Task 4 detail

- `npm install -D @netlify/functions netlify-cli`: a plain install ERESOLVE-failed — netlify-cli's large transitive dependency tree resolves `@opentelemetry/api` in a way that conflicts with vitest's own peer range for that same package (both ranges are individually satisfiable by a single version, but npm's strict resolver rejected it as a conflict rather than resolving to the compatible overlap). This is a legitimate, common npm dependency-resolution artifact of adding a large CLI tool's dependency tree to an existing project — not a package-legitimacy issue (Task 3 already independently verified both packages). Retried with `--legacy-peer-deps` (safe here: devDependency-only, no runtime code affected).
- **Known issue / process note:** this executor's own first retry attempt with `--legacy-peer-deps` appeared to hang for over 10 minutes with no output. The coordinator investigated directly and found the actual root cause was upstream of the hang appearance: an earlier attempt (piped through `| tail`) had silently swallowed a non-zero ERESOLVE exit code, making a fast failure look like a stall. The coordinator ran the install directly, it completed cleanly (1045 packages), and committed it as `d0f10dc`. This executor did not re-run the install per the coordinator's explicit instruction, and instead verified `package.json`/`package-lock.json` state and `tsc --noEmit` cleanliness before proceeding.
- Created `app/api/cron/call-reminders/route.ts`: `export const dynamic = 'force-dynamic'`, plain `Request`/`NextResponse`, no session/DAL (machine-to-machine, mirrors `app/api/auth/tab-refresh/route.ts`'s shape). Reads the `authorization` header, compares against `Bearer ${process.env.CRON_SECRET}` — returns 401 on missing header, mismatched header, or unset `CRON_SECRET` env var. On a valid match, calls `sendDueCallReminders()` and returns `{ ok: true, remindedCount, remindedCallIds }`.
- Generated `CRON_SECRET` via `crypto.randomBytes(32).toString('hex')` and appended it directly to `.env.local` (gitignored, confirmed via `git check-ignore -v`, value never echoed to any tool output — only its length, 64 hex chars, was logged for sanity-checking). Appended `SITE_URL` mirroring the existing `APP_URL` value.
- Created `tests/app/api/cron-call-reminders.test.ts` mirroring `tests/app/api/tab-refresh.test.ts`'s conventions: 4 cases — (a) missing `authorization` header -> 401, `sendDueCallReminders` never called; (b) header present but mismatched -> 401; (c) `CRON_SECRET` unset server-side -> 401 even with a plausible header; (d) correct `Bearer <secret>` header -> 200 with the mocked summary, `sendDueCallReminders` called exactly once.
- `npx vitest run tests/app/api/cron-call-reminders.test.ts`: 4/4 passed. `npx tsc --noEmit` and `npm run lint`: clean.

## Task 5 detail

- Created `netlify/functions/send-call-reminders.mts` using the v2 API shape (`export default async () => {...}`, `export const config: Config = { schedule: '*/5 * * * *' }`) per RESEARCH.md's verified-current convention. Reads `SITE_URL` (primary) falling back to `URL`; if neither is set, logs an error and returns without throwing. `fetch`es the internal cron route with `POST` + `authorization: Bearer ${CRON_SECRET}`; logs an error (status + body) on a non-ok response. Zero DB/GetStream/notification logic in this file.
- Created `netlify.toml` at the repo root: only a `[functions] directory = "netlify/functions"` declaration, deliberately no `[build]` section (documented rationale in the file's own header comment) — avoids overriding an unknown, possibly-already-working dashboard build configuration.
- Verify: `test -f netlify.toml && test -f netlify/functions/send-call-reminders.mts && grep -q "schedule" ... && ! grep -q "^\[build\]" netlify.toml` → `NETLIFY_FILES_OK`.
- `npx tsc --noEmit`: clean (`.mts` files are included via tsconfig's `**/*.mts` glob). `npm run lint`: 0 errors — 1 pre-existing warning on an unrelated file (`app/layout.tsx`, `no-page-custom-font`) plus 1 new stylistic warning on the function file itself (`import/no-anonymous-default-export` — expected, since this is the exact `export default async (...) => {}` shape RESEARCH.md verified as Netlify's own documented v2 API convention; not an error, not fixed).

## Task 7 detail

- Created `app/_components/participant-picker.tsx`: exports `PersonOption` type and a default `ParticipantPicker({ allUsers, picked, onToggle })` component — the search-input + `max-h-48` scrollable checkbox-list block extracted byte-for-byte (markup/classes) from `new-call-form.tsx`'s original inline implementation, now parameterized by `picked`/`onToggle` props instead of owning `picked` state itself.
- Refactored `app/_components/new-call-form.tsx`: removed the `isAdmin` prop, `schedule`/`scheduledFor` state, and the entire `{isAdmin && (...)}` "Schedule for later" checkbox block. Replaced the inline picker JSX with `<ParticipantPicker allUsers={allUsers} picked={picked} onToggle={toggle} />` (picked/toggle stay locally owned). `submit()` now unconditionally omits `scheduledFor` from the `createVideoCallAction` payload. Submit button label reverted to always read `Start call${...}` (no schedule-conditional branch). Props type is now `{ allUsers: PersonOption[] }` only.
- **Transient, expected, self-documented state:** this commit alone left `app/(app)/calls/page.tsx` failing `tsc` (still passing the old `isAdmin` prop to `NewCallForm`) — resolved in the very next commit (Task 8). The commit message explicitly notes this. Task 7's own scoped verify command (grep-filtered to `participant-picker.tsx`/`new-call-form.tsx` only) passed as designed.
- Verify: `NEWCALLFORM_REVERT_OK` (tsc scoped clean, lint scoped clean with 0 non-warning issues, no "Schedule for later" string remains in `new-call-form.tsx`).

## Task 8 detail

- Created `app/_components/schedule-call-form.tsx`: admin-only, always-visible "Schedule Call" button (`event` icon, styled to match `new-call-form.tsx`'s collapsed "Start a call" button) that opens a modal (`fixed inset-0 z-50 ... bg-black/40`, backdrop click calls `close()` which hides + resets all local state; inner card has `onClick={(e) => e.stopPropagation()}` so inner clicks don't bubble). Modal contains: title input, native `<input type="date">` + `<input type="time">` side-by-side, the reused `<ParticipantPicker>`, and submit/cancel buttons mirroring `new-call-form.tsx`'s own styling.
- `submit()` validates client-side (at least one other participant picked; date/time both present; parses to a valid `Date`; must be strictly in the future) before calling `createVideoCallAction` with `scheduledFor` **always** set (`parsedDate.toISOString()`) — the one thing that distinguishes this form from `new-call-form.tsx`, which never sends `scheduledFor`. On success, redirects to `/calls/{callId}`.
- Wired into `app/(app)/calls/page.tsx`: dropped the now-unused `isAdmin` prop from `<NewCallForm>` (matches Task 7's prop-type change), added `{isAdmin && <ScheduleCallForm allUsers={allUsers} />}` alongside it, both wrapped in a shared `flex flex-wrap items-start gap-3` row so "Schedule Call" reads next to "Start a call" per the locked decision.
- Verify: `SCHEDULE_MODAL_OK` (tsc scoped clean, lint scoped clean with 0 non-warning issues on both touched files).
- **Post-Task-8 full-project verification** (beyond the plan's own scoped verify commands, run to confirm the transient Task 7 state was fully resolved): `npx tsc --noEmit` project-wide — clean, zero errors anywhere. `npm run lint` project-wide — 0 errors, only the same 3 pre-existing/expected warnings (`app/layout.tsx`'s `no-page-custom-font`, `send-call-reminders.mts`'s `import/no-anonymous-default-export` from Task 5, and a pre-existing unrelated `tests/actions/workflow.test.ts` unused-var warning). `npx vitest run` (full suite) — 301 passed + 1 todo (302 total), 36 test files, no failures. `tests/actions/video-calls.test.ts` (constraint: must remain untouched) — confirmed zero diff (`git diff --stat HEAD -- tests/actions/video-calls.test.ts` empty) and still green (23/23 passed).

## Deviations from Plan

### Auto-fixed / directed Issues

**1. [Executor override, not a Rule 1-4 self-decision] SQL-native `now()` instead of JS `new Date()` in Task 2's window query and reminderSentAt write**
- **Found during:** Task 2
- **Issue:** Plan's literal wording specified JS `new Date()`/`windowEnd` for the due-call window comparison and `new Date()` for the `reminderSentAt` write.
- **Fix:** Used drizzle `sql\`now()\`` for the window comparison (`gt`/`lte`) and for the `reminderSentAt` write, per the repo's established incident-derived convention (260706-bpg).
- **Files modified:** `lib/video-calls.ts`
- **Commit:** `d6be44a`

**2. [Rule 3 — blocking issue, not a package-legitimacy concern] `--legacy-peer-deps` for Task 4's npm install**
- **Found during:** Task 4
- **Issue:** `npm install -D @netlify/functions netlify-cli` (plain) failed with ERESOLVE — netlify-cli's transitive `@opentelemetry/api` peer range conflicted with vitest's own peer range under npm's strict resolver.
- **Fix:** Retried with `--legacy-peer-deps`. This is distinct from the Rule 3 package-manager-install exclusion (which exists to guard against slopsquatted/hallucinated package names) — the package identities were already independently verified in Task 3; this was purely an npm dependency-resolution mechanics issue on a devDependency-only addition.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `d0f10dc`

No other deviations — Tasks 1-5, 7-8 otherwise executed exactly as written. Tasks 7-8 were executed ahead of Task 6's checkpoint resolution per the orchestrator's explicit direction (no technical dependency between them — Task 6 only concerns the Netlify infra from Tasks 4-5, not the frontend forms from Tasks 7-8).

## Known Stubs

None.

## Threat Flags

None beyond what the plan's own threat model already accounts for. T-dw4-01 (Bearer CRON_SECRET spoofing) is mitigated by Task 4's route + tests. T-dw4-02 (idempotent reminder DoS/repudiation) is mitigated by Task 2's `reminderSentAt` gate. T-dw4-03 (`.env.local` CRON_SECRET/SITE_URL disclosure) — gitignored, never echoed; Netlify dashboard env vars are the production source of truth, to be confirmed at Task 6.

## Self-Check

- `db/schema.ts` contains `reminder_sent_at` — FOUND (live DB query confirmed the column exists as nullable `timestamp without time zone`).
- `lib/video-calls.ts` contains `sendDueCallReminders` — FOUND.
- `lib/notifications.ts` contains `video_call_reminder` — FOUND.
- `app/api/cron/call-reminders/route.ts` contains `CRON_SECRET` — FOUND.
- `netlify/functions/send-call-reminders.mts` exists and contains `schedule` — FOUND.
- `netlify.toml` exists and has no `[build]` section — FOUND.
- `app/_components/participant-picker.tsx` contains `ParticipantPicker` — FOUND.
- `app/_components/schedule-call-form.tsx` contains `scheduledFor` — FOUND.
- `new-call-form.tsx` contains no "Schedule for later" string — FOUND (confirmed via grep, zero matches).
- Commits `01f545a`, `d6be44a`, `d0f10dc`, `fe931d2`, `4e24069`, `43073de`, `a8beb81` — all FOUND in `git log --oneline`.

## Self-Check: PASSED

## Next Steps (for the resuming executor)

1. Task 6 checkpoint (blocking human-action) is the only remaining item. Must be resumed with "netlify verified" (or a description of what broke). Requires: confirming a live Netlify site exists for this repo (or onboarding one), deploying with the now-complete `netlify.toml`/`netlify/functions/` (already committed), confirming `send-call-reminders` appears in the Functions dashboard (both general + scheduled panels), setting `CRON_SECRET`/`SITE_URL` in Netlify's dashboard env vars, and a manual "Run now"/CLI invoke confirming the trigger reaches the internal route successfully.
2. Tasks 1-2, 4-5, 7-8 are all complete, committed, and verified (tsc/lint/vitest all clean project-wide, full 301-test suite green). Once Task 6 clears, the plan's `<verification>`/`<success_criteria>` sections are fully satisfiable — no further code changes are anticipated unless the Netlify deploy itself surfaces an issue (e.g. Assumption A1 — custom function coexistence with the Next.js Runtime's auto-generated functions — turning out to be wrong).
