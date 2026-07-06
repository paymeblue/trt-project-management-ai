---
phase: quick-260706-bpg
plan: 01
subsystem: ui
tags: [chat, drizzle, next16, react-compiler, gsap, postgres]

requires: []
provides:
  - Group (multi-participant) conversations alongside existing 1:1 DMs
  - Slack-style message reactions (toggleable emoji chips with counts)
  - Native emoji picker in the chat composer (no new dependency)
  - Typing indicator driven by a poll-friendly heartbeat
  - GSAP fullscreen expand/collapse for the chat drawer (Slack-like sidebar + thread layout)
affects: [chat, messaging, human-collaboration]

tech-stack:
  added: []
  patterns:
    - "Sub-render JSX helpers that touch refs/ref-effect callbacks must be hoisted to module-level components (not nested plain functions called during render) so the React Compiler ESLint rule (react-hooks/refs) recognizes them as components and applies the standard event-handler exemption."
    - "1:1 conversation dedup queries must filter on conversations.isGroup = false once groups exist, to avoid a shared group conversation being mistaken for a 1:1 thread."

key-files:
  created:
    - app/api/messages/reactions/route.ts
    - app/api/messages/typing/route.ts
  modified:
    - db/schema.ts
    - app/api/messages/route.ts
    - app/api/messages/conversations/route.ts
    - app/_components/chat-drawer.tsx

key-decisions:
  - "Reactions and typing ride the existing polling cycle (tightened active-thread poll from 3s to 2s) — no websocket/Supabase transport added, per plan constraint."
  - "Extracted ConversationList/MessageThread/MessageComposer as module-level (not nested) components to satisfy the React Compiler's react-hooks/refs lint rule and to keep stable component identity across polling re-renders (avoids remounting/losing composer focus)."
  - "Fixed a latent bug the group feature would have introduced: the 1:1 conversation find-or-create dedup query now filters to isGroup=false so a shared group conversation is never mistaken for (and returned as) a 1:1 thread."

patterns-established:
  - "Server routes reuse the existing `isParticipant(conversationId, userId)` guard inlined per-route (matches existing /api/messages pattern) rather than a shared import."

requirements-completed: [GROUPCHAT-01, EMOJI-01, TYPING-01, FULLSCREEN-01]

duration: 20min
completed: 2026-07-06
---

# Quick Task 260706-bpg: Slack-like Group Chat Upgrade Summary

**Upgraded the 1:1 DM drawer into group conversations with sender names, native-emoji reactions, a polling-based typing indicator, and a GSAP fullscreen Slack-like layout — all on the existing poll transport, zero new dependencies.**

## Performance

- **Duration:** ~20 min (task commits 08:36–08:48 UTC+1)
- **Started:** 2026-07-06T08:29:01+01:00 (plan commit)
- **Completed:** 2026-07-06T08:48:24+01:00
- **Tasks:** 3/3
- **Files modified:** 5 (1 created new dirs: 2 new route files)

## Accomplishments
- Group conversations: create with 2+ selected users + optional title; conversations GET generalized to `others[]`/`isGroup`/`title`/`name` while preserving `other` for 1:1 back-compat
- Slack-style reactions: hover "react" button + emoji popover, toggle-on/off via a unique-constrained `message_reactions` table, chips show emoji+count and highlight when mine
- Native emoji picker in the composer (~40 hardcoded emoji, no emoji-mart or other dependency — package.json/package-lock.json diff is empty)
- Typing indicator: throttled (~2.5s) heartbeat POST + `lastTypingAt` column + 2s active-thread poll (tightened from 3s) surfaces "X is typing…" / "Several people are typing…"
- GSAP fullscreen expand/collapse mirroring the existing `paul-arredo.tsx` animation pattern, with a Slack-like sidebar (conversation list) + thread + composer layout
- 1:1 DM flow fully preserved and verified working (schema-level integration smoke test + auth-gate parity check)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema additions + drizzle push** - `12d83ca` (feat)
2. **Task 2: Backend — group creation, reactions + typing routes, generalized reads** - `87fbeb5` (feat)
3. **Task 3: Drawer UI — group creation, sender names, emoji picker, reactions, typing, fullscreen expand** - `f26253d` (feat)

_Plan metadata commit (dc9acbc, pre-dispatch) and STATE.md/SUMMARY.md updates are handled by the orchestrator, not this executor._

## Files Created/Modified
- `db/schema.ts` - Added `conversations.title`/`isGroup`, `conversationParticipants.lastTypingAt`, new `messageReactions` table (unique on messageId+userId+emoji)
- `app/api/messages/conversations/route.ts` - POST branches to group creation (userIds.length>=2) vs existing 1:1 find-or-create; GET returns `others[]`/`isGroup`/`title`/`name` per conversation
- `app/api/messages/route.ts` - GET now attaches per-message `reactions[]` and a `typers[]` array (participants with `lastTypingAt` within 6s)
- `app/api/messages/reactions/route.ts` (new) - POST toggles a reaction row, guarded by `isParticipant`
- `app/api/messages/typing/route.ts` (new) - POST stamps `lastTypingAt`, guarded by `isParticipant`
- `app/_components/chat-drawer.tsx` - Expanded from ~430 to 986 lines: group creation UI, sender names on group bubbles, emoji picker, reaction chips, typing indicator, GSAP fullscreen panel; `ConversationList`/`MessageThread`/`MessageComposer` extracted as module-level components

## Decisions Made
- Reactions/typing ride the existing poll cycle exactly as specified (no new transport); active-thread poll tightened from 3000ms to 2000ms.
- Module-level component extraction (not nested `renderX()` helpers) for the drawer's shared UI blocks — required to satisfy `eslint-plugin-react-hooks`'s `react-hooks/refs` rule (React Compiler), and beneficial because it keeps a stable component identity across the poll-driven re-renders (nested inline components would get a new function identity every render, causing full remounts and lost composer input focus).
- Restricted the 1:1 dedup lookup in `conversations` POST to `isGroup = false` conversations only (see Deviations below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed 1:1 dedup query incorrectly matching group conversations**
- **Found during:** Task 2 (conversations route)
- **Issue:** The existing 1:1 find-or-create logic detects a "shared conversation" by intersecting the caller's and the other user's conversation-participant rows, with no filter on conversation type. Once groups exist, if two users share a group conversation, starting a fresh 1:1 DM between them would incorrectly return the group's conversationId instead of creating (or finding) a real 1:1 thread — breaking the "existing 1:1 DM flow continues to work unchanged" success criterion in a way only reachable via the group feature this plan adds.
- **Fix:** Joined `conversations` and filtered both the caller's and the other user's conversation-id sets to `isGroup = false` before intersecting.
- **Files modified:** `app/api/messages/conversations/route.ts`
- **Verification:** DB-level smoke script created a group between the same three users and confirmed the group conversationId is absent from the `isGroup=false` dedup query result set.
- **Committed in:** `87fbeb5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Directly protects the plan's own "keep 1:1 DM flow fully working" invariant; no scope creep.

## Issues Encountered
- **Worktree base drift:** the worktree's branch was one commit behind the plan commit (`dc9acbc`) at spawn time; corrected via the mandatory `git reset --hard` branch-check step before any work began.
- **Missing `.env.local` and `node_modules` in the worktree:** copied `.env.local` from the main repo (never committed) and ran `npm install` to materialize `node_modules` (git-worktrees don't share these). A resulting no-op `package-lock.json` diff (unrelated optional-dependency entry) was reverted before committing, so `package.json`/`package-lock.json` show zero diff — confirming no new emoji/other dependency was added.
- **`npx drizzle-kit push` interactive prompt:** the push flagged an unrelated pre-existing unique constraint on `project_step_deadlines` (not part of this plan's schema changes) requiring a "truncate y/n" TTY confirmation. Verified via direct query that the constraint already existed with zero duplicate rows, then used `expect` to answer the safe default ("No, add the constraint without truncating") since the CLI requires a real TTY and cannot be piped. Push completed with "Changes applied" and all new columns/table confirmed present via a direct schema query.
- **React Compiler ESLint error (`react-hooks/refs`, "Cannot access refs during render"):** the plan's suggested "small inline sub-renders" pattern (plain nested functions called directly during render, e.g. `{renderConversationList()}`) is flagged by this project's `eslint-config-next` (React Compiler rule) because the compiler doesn't recognize non-JSX-instantiated helper functions as component boundaries, so it can't apply the standard exemption for ref access inside event handlers. Resolved by hoisting `ConversationList`, `MessageThread`, and `MessageComposer` to module-level components instantiated via JSX (`<ConversationList .../>` etc.), which both satisfies the lint rule and avoids remount-driven focus loss from inline component definitions.
- **No browser automation tool available:** this environment has no Playwright/Puppeteer/browser MCP tool, so the plan's "manual smoke (dev server)" verification step (visually creating a group, watching typing indicators across two sessions, seeing the GSAP fullscreen animation) could not be performed as literal browser interaction. Compensated with: (a) `npm run build` (production build succeeds, all new routes listed), (b) `npm test` (74/74 vitest tests pass), (c) an HTTP-level check that the two new routes and the existing `/api/messages` route respond identically when unauthenticated (307 redirect to `/sign-in`, matching existing auth-gating behavior), and (d) a direct-DB integration script (using real, pre-existing user rows, fully cleaned up afterward) that exercised the exact query logic each route implements: group creation + `others[]` projection, reaction add/toggle-off, the `message_reactions` unique constraint, the typing heartbeat + typers-within-6s query, and confirmation that the group conversation does not leak into the 1:1 dedup query. This validates the underlying logic End-to-end at the data layer; it does not substitute for a human visually confirming the GSAP animation or picker styling.

## User Setup Required

None - no external service configuration required. Schema changes were applied directly via `npx drizzle-kit push` against the existing Neon `DATABASE_URL`.

## Next Phase Readiness
- Group chat, reactions, typing, and fullscreen expand are live in `chat-drawer.tsx`; ready for a human to do a visual pass (open two browser sessions, confirm the typing indicator and GSAP animation feel right) whenever browser tooling/credentials are available.
- No blockers. The existing 1:1 DM flow was not only preserved but had a related latent bug (group/1:1 dedup collision) preempted before it could ship.

---
*Phase: quick-260706-bpg*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: db/schema.ts
- FOUND: app/api/messages/route.ts
- FOUND: app/api/messages/conversations/route.ts
- FOUND: app/api/messages/reactions/route.ts
- FOUND: app/api/messages/typing/route.ts
- FOUND: app/_components/chat-drawer.tsx
- FOUND: .planning/quick/260706-bpg-slack-like-group-chat-group-conversation/260706-bpg-SUMMARY.md
- FOUND commit: 12d83ca (Task 1)
- FOUND commit: 87fbeb5 (Task 2)
- FOUND commit: f26253d (Task 3)

## Post-Execution Browser Verification (orchestrator, 2026-07-06)

Live two-session browser test (dev server + agent-browser, seeded Super Admin + Operations accounts). All four features confirmed working end-to-end, after fixing four issues found only in the browser (commit 618ea95):

1. **Typing indicator never displayed** — `lastTypingAt` written with JS `new Date()` landed 1 hour behind the DB clock on this UTC+1 host (naive `timestamp` column), so the 6s freshness window never matched. Fixed by stamping with SQL `now()` and comparing against `now() - interval` in the typers query; `lastReadAt` writes switched to `now()` for the same reason. Verified: "Operations is typing…" renders in the other participant's open thread while typing.
2. **Fullscreen panel painted underneath page content** — the header the drawer mounts in creates a sticky stacking context. Fixed by rendering the expanded panel via `createPortal(document.body)`. Verified: fullscreen Slack-like layout (sidebar + thread) renders fully opaque; collapse returns to the drawer.
3. **Reaction picker unclickable for messages near the top of the thread** (opened upward under the drawer header). Fixed by flipping it below the button within 110px of the scroll-area top. Verified: 👍 reaction applied, chip with count renders.
4. **Freshly created group showed generic "Conversation" header** until the next list poll. Fixed with an optimistic `activeConv` carrying the chosen title.

Also verified live: group creation (Direct/Group tabs, multi-select, name field), group appears in list with icon + unread badge for other participants, emoji picker inserts into composer, message with emoji delivers cross-user. Test conversation removed from the dev DB afterwards. `tsc`, lint (1 pre-existing warning), and 74/74 vitest pass after fixes.
