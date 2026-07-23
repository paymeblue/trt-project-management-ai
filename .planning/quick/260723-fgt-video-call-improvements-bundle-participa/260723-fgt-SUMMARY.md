---
phase: quick-260723-fgt
plan: 01
subsystem: ui
tags: [getstream, stream-chat, video-calls, drizzle, react, tdd]

requires: []
provides:
  - "lib/text-case.ts toTitleCase — display-layer name normalization, no DB writes"
  - "lib/video-calls.ts removeCallParticipant + participant-removal action + UI"
  - "video-call-room.tsx End for everyone visible to isCreator || isAdmin"
  - "lib/video-chat.ts GetStream Chat backend (mintChatToken/getOrCreateChatChannel/addChatChannelMembers)"
  - "app/_components/call-chat-panel.tsx docked in-call chat panel"
  - "app/(app)/admin/call-analytics/page.tsx admin-only call usage analytics"
affects: [video-calls, admin-analytics]

tech-stack:
  added: [stream-chat@^9.50.2, stream-chat-react@^14.10.0]
  patterns:
    - "toTitleCase applied at data-source points (upsertVideoCallUsers, getCallParticipants, allUsers queries), never persisted to DB"
    - "removeCallParticipant mirrors endVideoCall's non-fatal try/catch around the GetStream side-effect — our own DB row deletion is the source of truth"
    - "lib/video-chat.ts mirrors lib/video-calls.ts's lazy-singleton structure for a second, independent GetStream product client (StreamChat vs. StreamClient)"
    - "Chat-channel lifecycle wired into the same 3 call sites lib/video-calls.ts already mutates video membership at (createVideoCall/addVideoCallParticipants/ensureCallParticipant)"

key-files:
  created:
    - lib/text-case.ts
    - lib/video-chat.ts
    - app/_components/call-chat-panel.tsx
    - "app/(app)/admin/call-analytics/page.tsx"
  modified:
    - lib/video-calls.ts
    - actions/video-calls.ts
    - app/(app)/calls/page.tsx
    - "app/(app)/calls/[id]/page.tsx"
    - app/_components/add-call-participants.tsx
    - app/_components/video-call-room.tsx
    - app/_components/sidebar-nav.tsx
    - package.json
    - package-lock.json
    - tests/lib/video-calls.test.ts
    - tests/actions/video-calls.test.ts
    - tests/lib/video-chat.test.ts

key-decisions:
  - "Task 3 (GetStream dashboard check) cleared by the user — Chat product confirmed enabled on the app matching GETSTREAM_APIKEY/GETSTREAM_APP_ID; Tasks 4-6 then executed in the same session"
  - "stream-chat-react's actual installed 14.10.0 has NO MessageInput export at all (0 references in the compiled bundle) despite the plan/RESEARCH.md and the package's own bundled AI.md referencing it — MessageComposer (148 references, verified via dist/es/index.mjs and type declarations) is the current replacement; used that instead"
  - "tests/lib/video-chat.test.ts mocks '@/lib/video-calls' directly (providing just a requiredEnv implementation) rather than importing the real module, avoiding a heavy transitive import chain (@/db's neon() call throws without DATABASE_URL, @stream-io/node-sdk, notifications) purely to reach one env-var helper"

requirements-completed: [TITLECASE-01, PARTREM-01, ENDALL-01, CHAT-01, CHAT-02, ANALYTICS-01]

duration: ~2h (across two sessions, paused once at Task 3 checkpoint)
completed: 2026-07-23
---

# Quick Task 260723-fgt: Video call improvements bundle Summary

**Title-cased display names across the video-call feature (including GetStream video tiles), participant removal + superadmin end-call-for-all UI fix, a docked GetStream-Chat-SDK in-call chat panel, and an admin-only call-usage analytics page**

## Performance

- **Tasks:** 6 of 6 complete
- **Files created:** 4 (`lib/text-case.ts`, `lib/video-chat.ts`, `app/_components/call-chat-panel.tsx`, `app/(app)/admin/call-analytics/page.tsx`)
- **Files modified:** 12

## Accomplishments
- `lib/text-case.ts` created with `toTitleCase` — pure, display-layer only, no stored `users.name` value changed. Applied at the three data-source points feeding every name-rendering consumer: `upsertVideoCallUsers` (fixes GetStream's own video-tile labels), `getCallParticipants` (feeds `/calls` list + call-room participant pills), and the `allUsers` picker query in both `calls/page.tsx` and `calls/[id]/page.tsx`.
- `removeCallParticipant` (lib) + `removeVideoCallParticipantAction` (action) added, TDD'd, mirroring `endVideoCallAction`'s creator/admin authorization shape; creator can never be removed. `video-call-room.tsx`'s "End for everyone" button now shows for `isCreator || isAdmin`. `add-call-participants.tsx` pills show a remove "x" control when the caller can manage the call.
- `lib/video-chat.ts` created: a second, independent GetStream client (`StreamChat`, the Chat product — distinct from `StreamClient`, the Video product) reusing the exported `requiredEnv` credential helper. `mintChatToken`, `getOrCreateChatChannel`, `addChatChannelMembers` wired into the same three call sites `lib/video-calls.ts` already mutates video membership at (`createVideoCall`, `addVideoCallParticipants`, `ensureCallParticipant`).
- `app/_components/call-chat-panel.tsx` created: docked, toggleable chat panel using `useCreateChatClient` + `Chat`/`Channel`/`Window`/`MessageList`/`MessageComposer` — exactly one fixed channel per call, no `ChannelList`/`Thread`. Toggled from a new "Chat" button in `video-call-room.tsx`'s header row; renders beside the video grid (not replacing it) when open.
- `app/(app)/admin/call-analytics/page.tsx` created: 4 stat cards (total calls, total hours used, avg call duration, active now) computed only from `video_calls` columns, gated by `requireAdmin()`, styled like the existing `admin/analytics/page.tsx`'s `StatCard`. Linked from the super_admin sidebar's Insights group (covers `operations` via its existing fallback).

## Task Commits

Each task was committed atomically:

1. **Task 1: Title-case helper and apply across the video-call feature** - `6398693` (feat)
2. **Task 2: Participant removal + superadmin end-call-for-all UI fix** - `41b5ef9` (test — RED), `798095a` (feat — GREEN)
3. **Task 3: Confirm GetStream Chat product is enabled** - checkpoint, cleared by user confirmation (no code changes, no commit)
4. **Task 4: GetStream Chat backend — channel/token minting wired into call lifecycle** - `d6adf9a` (test — RED), `cbc5ba7` (feat — GREEN)
5. **Task 5: In-call chat panel (client UI, docked beside the video grid)** - `20f0c63` (feat)
6. **Task 6: Call usage analytics page (admin-only)** - `6fa5321` (feat)

**Plan metadata:** not yet committed (deferred to orchestrator per constraints)

_Note: commit `9ba560e` ("update") between Task 2 and Task 4 was made by an external/concurrent process committing the untracked planning docs (CONTEXT/PLAN/RESEARCH.md) — not part of this executor's task-commit protocol, expected and benign per orchestrator confirmation._

## Files Created/Modified
- `lib/text-case.ts` - `toTitleCase(value: string): string`, pure display-layer helper
- `lib/video-calls.ts` - `toTitleCase` applied in `upsertVideoCallUsers`/`getCallParticipants`; `removeCallParticipant` added; `requiredEnv` exported; chat-channel calls wired into `createVideoCall`/`addVideoCallParticipants`/`ensureCallParticipant`
- `lib/video-chat.ts` (new) - `chatServerClient()` singleton, `mintChatToken`, `getOrCreateChatChannel`, `addChatChannelMembers`
- `actions/video-calls.ts` - added `removeVideoCallParticipantAction`
- `app/(app)/calls/page.tsx` - title-cases the `allUsers` picker list
- `app/(app)/calls/[id]/page.tsx` - title-cases `allUsers`; passes `isAdmin`/`creatorId`/`chatToken` to `VideoCallRoom`
- `app/_components/video-call-room.tsx` - "End for everyone" gated on `isCreator || isAdmin`; `canManage`/`creatorId` passed to `AddCallParticipants`; `chatOpen` toggle + docked `CallChatPanel`
- `app/_components/add-call-participants.tsx` - per-pill remove control, calls `removeVideoCallParticipantAction`
- `app/_components/call-chat-panel.tsx` (new) - docked GetStream Chat panel, `'use client'`
- `app/(app)/admin/call-analytics/page.tsx` (new) - 4 stat cards, admin-only
- `app/_components/sidebar-nav.tsx` - "Call Analytics" entry added to Insights group
- `package.json` / `package-lock.json` - `stream-chat@^9.50.2`, `stream-chat-react@^14.10.0`
- `tests/lib/video-calls.test.ts` - `removeCallParticipant` tests, `db.delete` mock branch, `@/lib/video-chat` mocked wholesale + chat-wiring assertions on all three call sites
- `tests/actions/video-calls.test.ts` - `removeVideoCallParticipantAction` tests
- `tests/lib/video-chat.test.ts` (new) - `getOrCreateChatChannel`/`addChatChannelMembers`/`mintChatToken` tests

## Decisions Made
- Followed CONTEXT.md/PLAN.md's locked decisions throughout (GetStream Chat SDK, id-mapped channel-per-call, `lib/video-chat.ts` as a separate module, docked Zoom/Meet-style panel, dedicated `/admin/call-analytics` page).
- Where the plan referenced an API surface that turned out not to exist in the actually-installed package version, followed the real, verified API instead of the plan's literal text (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a test regression introduced by Task 1's title-casing**
- **Found during:** Task 2, writing the RED tests
- **Issue:** `tests/lib/video-calls.test.ts`'s `addVideoCallParticipants > skips ids already on the call...` test shares one generic `selectWhereMock` across all `db.select().from().where()` calls. Once `upsertVideoCallUsers` started wrapping the fetched name in `toTitleCase(r.name ?? r.id)`, an unrelated select call in that test resolved to a row shaped `{ userId: 'u1' }` (no `name`/`id`), so `toTitleCase` received `undefined` and threw on `.toLowerCase()`. Can't happen in production (`users.name` is `notNull()`).
- **Fix:** Sequenced the mock with `mockResolvedValueOnce` so each select call returns a shape matching what it's actually querying.
- **Files modified:** `tests/lib/video-calls.test.ts`
- **Committed in:** `41b5ef9`

**2. [Rule 3 - Blocking] `MessageInput` does not exist in the installed stream-chat-react version — used `MessageComposer` instead**
- **Found during:** Task 5, before writing `call-chat-panel.tsx`
- **Issue:** RESEARCH.md, the plan text, and even `stream-chat-react`'s own bundled `AI.md` all reference a `MessageInput` component. Direct inspection of the installed `stream-chat-react@14.10.0` package (both `dist/types/*` declarations and the compiled `dist/es/index.mjs` bundle) showed zero references to `MessageInput` anywhere — it doesn't exist as an export, type-only or runtime. `MessageComposer` (148 references in the compiled bundle) is the current, actual replacement.
- **Fix:** Used `MessageComposer` from `stream-chat-react` in place of `MessageInput`. Verified this exists in both the type declarations (`components/MessageComposer/MessageComposer.d.ts`) and the compiled bundle.
- **Files modified:** `app/_components/call-chat-panel.tsx`
- **Verification:** `tsc --noEmit` and `npm run lint` clean for the file; manual smoke test not performed (see below)
- **Committed in:** `20f0c63`

**3. [Rule 1 - Bug] `Date.now()` tripped the `react-hooks/purity` ESLint rule in a Server Component**
- **Found during:** Task 6, running `npm run lint`
- **Issue:** `Date.now()` in `app/(app)/admin/call-analytics/page.tsx` (a Server Component) triggered `react-hooks/purity`: "Cannot call impure function during render."
- **Fix:** Switched to `new Date().getTime()` — the exact pattern already used identically in `app/(app)/admin/analytics/page.tsx`'s own duration math, which does not trip the rule.
- **Files modified:** `app/(app)/admin/call-analytics/page.tsx`
- **Verification:** `npm run lint` clean (0 errors) after the fix
- **Committed in:** `6fa5321`

**4. [Test-infrastructure only, not a Rule 1-3 production fix] Mocked `@/lib/video-calls` directly in `tests/lib/video-chat.test.ts`**
- **Found during:** Task 4, writing `tests/lib/video-chat.test.ts`
- **Issue:** `lib/video-chat.ts` imports `requiredEnv` from `@/lib/video-calls` per the plan. Importing the real module in the chat test pulled in its full transitive chain (`@/db`, which calls `neon(process.env.DATABASE_URL!)` at module load and throws immediately without a real `DATABASE_URL`), crashing the test suite before any test could run.
- **Fix:** Mocked `@/lib/video-calls` in `tests/lib/video-chat.test.ts` with just a `requiredEnv` implementation matching the real one's trim-and-throw behavior, scoping this file's coverage to `lib/video-chat.ts`'s own logic (consistent with how `tests/actions/video-calls.test.ts` already mocks `@/lib/video-calls` wholesale).
- **Files modified:** `tests/lib/video-chat.test.ts`
- **Committed in:** `d6adf9a`

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking-compile fix, 1 test-infrastructure fix). No scope creep — all were necessary to keep the codebase compiling/linting/testing clean per the plan's own `<done>`/`<verification>` criteria.

## Issues Encountered
None beyond the deviations above.

## Final Verification (full plan, all 6 tasks)

- `npx tsc --noEmit` — **clean project-wide, 0 errors**
- `npm run lint` — **0 errors**, 4 pre-existing unrelated warnings (font/no-page-custom-font in `app/layout.tsx`, one unused test var in `tests/actions/workflow.test.ts`) — none in any file this plan touched
- `npx vitest run` (full suite) — **35 test files passed, 286 tests passed, 1 todo** (287 total)
- `npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts tests/lib/video-chat.test.ts` (plan's own specified verification command) — **3 files passed, 29 tests passed**
- Confirmed no diff in `app/_components/chat-drawer.tsx` or `app/api/chat/**` (the existing Slack-like chat feature) across this entire session's commits
- Confirmed `package.json` diff shows only `stream-chat`/`stream-chat-react` added as new dependencies

### Manual Smoke Test — NOT performed
The plan's `<verification>` section calls for a manual two-browser-session smoke test (start a call, verify remove control, verify admin end-for-all, verify title-case rendering, exchange a chat message across sessions, verify ending a call doesn't error chat, visit `/admin/call-analytics`). This was **not performed** in this execution — no dev server was started and no browser automation was run in this session. All verification above is static (tsc/lint) and unit-level (vitest with mocked GetStream clients); the actual GetStream Video/Chat wire protocol, real browser rendering, and cross-session message delivery have not been exercised end-to-end. This should be performed before considering the feature fully done, per MEMORY.md's concurrent-session caution (use a fresh/isolated test call, do not disrupt the other live session).

## User Setup Required
None beyond what was already confirmed at the Task 3 checkpoint (GetStream Chat product enabled on the existing `GETSTREAM_APIKEY`/`GETSTREAM_APP_ID`). No new environment variables were introduced — chat reuses the existing `GETSTREAM_APIKEY`/`GETSTREAM_SECRET` pair.

## Next Phase Readiness
- All 6 tasks complete, committed, and statically/unit-test verified clean.
- Recommended before calling this fully "done" in production: the manual two-browser smoke test described above, particularly around real GetStream Chat channel creation/token validity (unit tests mock the GetStream SDK entirely) and the `MessageComposer` swap's actual rendered behavior.

---
*Phase: quick-260723-fgt*
*Completed: 2026-07-23*
