---
phase: quick-260706-bpg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/schema.ts
  - app/api/messages/route.ts
  - app/api/messages/conversations/route.ts
  - app/api/messages/reactions/route.ts
  - app/api/messages/typing/route.ts
  - app/_components/chat-drawer.tsx
autonomous: true
requirements: [GROUPCHAT-01, EMOJI-01, TYPING-01, FULLSCREEN-01]

must_haves:
  truths:
    - "A user can create a group conversation by selecting 2+ users and giving it a title"
    - "In a group thread, each message bubble shows the sender's name"
    - "A user can pick a native emoji from an in-house picker and insert it into the composer"
    - "A user can hover a message and add an emoji reaction; reaction chips show counts and toggle on click"
    - "When another participant is typing, an open thread shows 'X is typing…'"
    - "An expand button grows the chat into a fullscreen Slack-like layout (conversation sidebar + thread) with a GSAP animation, and collapse returns to the vaul drawer"
    - "The existing 1:1 DM flow continues to work unchanged"
  artifacts:
    - path: "db/schema.ts"
      provides: "conversations.title, conversations.isGroup, conversationParticipants.lastTypingAt, messageReactions table"
      contains: "messageReactions"
    - path: "app/api/messages/reactions/route.ts"
      provides: "POST toggle reaction + reactions returned via messages GET"
      exports: ["POST"]
    - path: "app/api/messages/typing/route.ts"
      provides: "POST typing heartbeat"
      exports: ["POST"]
    - path: "app/_components/chat-drawer.tsx"
      provides: "group creation, sender names, emoji picker, reactions UI, typing indicator, fullscreen expand"
      min_lines: 500
  key_links:
    - from: "app/_components/chat-drawer.tsx"
      to: "/api/messages/reactions"
      via: "fetch on reaction click"
      pattern: "api/messages/reactions"
    - from: "app/_components/chat-drawer.tsx"
      to: "/api/messages/typing"
      via: "heartbeat POST while typing"
      pattern: "api/messages/typing"
    - from: "app/api/messages/route.ts"
      to: "messageReactions"
      via: "join reactions + typers into GET response"
      pattern: "messageReactions"
---

<objective>
Upgrade the existing human-to-human chat (vaul drawer, polling transport) into a Slack-like experience: multi-participant group conversations with titles and sender names, a lightweight native-emoji picker plus Slack-style message reactions, a polling-friendly typing indicator, and a GSAP fullscreen expand mode.

Purpose: Replace the constrained 1:1 DM UX with a richer team-collaboration surface while keeping the existing DM flow and the vaul drawer intact. All new realtime-feeling behavior (reactions, typing) rides the existing poll cycle — no new transport.

Output: Schema additions (group columns, typing heartbeat column, reactions table), two new API routes (reactions, typing), extended messages/conversations routes, and a substantially expanded `chat-drawer.tsx` covering group creation, emoji picker, reactions, typing indicator, and fullscreen expand.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@AGENTS.md

<interfaces>
<!-- Extracted from codebase. Use these directly — do NOT re-explore. -->

verifySession (lib/dal.ts) — returns `{ userId: string, role: Role }`. Reuse in EVERY new/modified route exactly as the existing /api/messages routes do:
```ts
const { userId } = await verifySession()
```

Existing schema (db/schema.ts, ~line 210) — Next 16 + drizzle-orm/pg-core imports already include `unique`:
```ts
export const conversations = pgTable('conversations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
export const conversationParticipants = pgTable('conversation_participants', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId:         uuid('user_id').notNull().references(() => users.id),
  lastReadAt:     timestamp('last_read_at'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})
export const messages = pgTable('messages', {
  id, conversationId, senderId, body, attachmentData, attachmentName, attachmentType, createdAt
})
```

Messages GET (app/api/messages/route.ts) already returns per-message `senderName` via innerJoin on users, and `{ messages, meId }`. `isParticipant(conversationId, userId)` helper guards access.

Conversations GET (app/api/messages/conversations/route.ts) currently assumes 1:1 — it selects a single `other` participant with `.limit(1)`. This MUST be generalized for groups (see Task 2).

Client types (app/_components/chat-drawer.tsx):
```ts
type ChatUser = { id: string; name: string; role: string; email?: string }
type Conversation = { conversationId; other: ChatUser; lastMessage; unread }
type Msg = { id; senderId; senderName; body; attachment...; createdAt }
```
Polling: conversations every 6s (loadConversations), active thread every 3s (loadMessages). `userRoleLabel` from `@/lib/workflow`.

GSAP fullscreen pattern to mirror (app/_components/paul-arredo.tsx openChat/closeChat):
```ts
gsap.fromTo(panelRef.current,
  { scale: 0.15, opacity: 0, transformOrigin: 'bottom right' },
  { scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' })
// close: gsap.to(..., { scale: 0.15, opacity: 0, duration: 0.3, ease: 'power3.in', onComplete: () => setExpanded(false) })
```
</interfaces>

<constraints>
- Roles: use `Roles.*` / `userRoleLabel` from `@/lib/workflow`, never string literals.
- Do NOT add emoji-mart or any heavy emoji dep — hand-build a small native-emoji grid (~40 common emojis).
- Keep the 1:1 DM flow fully working. Group chat is additive.
- Reactions + typing must ride the existing poll cycle (tighten active-thread poll to 2s while a thread is open). No Supabase/websocket wiring.
- Next 16: `await` params/cookies/headers if touched; routes stay in Node runtime.
- Apply schema via `npx drizzle-kit push` (DATABASE_URL in .env.local, Neon). No SQL migration files by hand.
</constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema additions + drizzle push</name>
  <files>db/schema.ts</files>
  <action>
Add group + typing + reactions support to the schema, then push.

1. On `conversations` add: `title: text('title')` (nullable) and `isGroup: boolean('is_group').notNull().default(false)`.
2. On `conversationParticipants` add: `lastTypingAt: timestamp('last_typing_at')` (nullable — set on heartbeat).
3. Add a new table BELOW the `messages` table:
   `messageReactions` → `pgTable('message_reactions', { id: uuid pk defaultRandom, messageId: uuid notNull references messages.id { onDelete: 'cascade' }, userId: uuid notNull references users.id, emoji: text notNull, createdAt: timestamp defaultNow notNull })` with a table-level unique constraint on `(messageId, userId, emoji)` using the already-imported `unique()` helper (third pgTable arg returning `[unique().on(t.messageId, t.userId, t.emoji)]`).
4. Run `npx drizzle-kit push` to apply to Neon (accept prompts; these are additive nullable/defaulted columns + a new table, non-destructive).

Do NOT rename or drop any existing column. `boolean` and `unique` are already imported in db/schema.ts.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -i "schema.ts" | grep -v "^#" | wc -l | tr -d ' ' | grep -qx 0 && echo SCHEMA_OK</automated>
  </verify>
  <done>schema.ts has conversations.title, conversations.isGroup, conversationParticipants.lastTypingAt, and a messageReactions table with the unique constraint; `npx drizzle-kit push` reports the columns/table applied with no errors; tsc reports no schema.ts type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Backend — group creation, reactions + typing routes, generalized reads</name>
  <files>app/api/messages/conversations/route.ts, app/api/messages/route.ts, app/api/messages/reactions/route.ts, app/api/messages/typing/route.ts</files>
  <action>
Reuse `const { userId } = await verifySession()` and the `isParticipant` guard pattern in ALL routes below.

A. conversations/route.ts POST — support group creation alongside existing 1:1:
   - If body contains `userIds: string[]` (length >= 2) and optional `title: string`: create a group. Insert `conversations` with `{ createdBy: userId, isGroup: true, title: title?.trim() || null }`, then insert participants for `[userId, ...userIds]` (dedupe, drop self-dupes). Return `{ conversationId }`. Do NOT attempt find-or-create dedup for groups — always create a new group.
   - Keep the existing `{ userId: otherId }` 1:1 branch exactly as-is (find-or-create).

B. conversations/route.ts GET — generalize the per-conversation shape for groups:
   - Load the conversation row (including `isGroup`, `title`).
   - Fetch ALL other participants (remove the `.limit(1)`), returning an array `others: ChatUser[]`.
   - For groups, set a display `name` = `title` if present, else the joined participant names (e.g. "Alice, Bob, Carol"). Keep `other` (first other participant) for backward-compat with 1:1 rendering.
   - Return added fields per conversation: `isGroup: boolean`, `title: string | null`, `others: ChatUser[]`, `name: string` (computed display name). Preserve existing `other`, `lastMessage`, `unread`, `totalUnread`, and sort.

C. messages/route.ts GET — attach reactions + typers:
   - After loading `rows`, fetch all reactions for those message ids: select `{ messageId, userId, emoji }` from `messageReactions` where messageId in the set. Group into `reactions: { emoji: string; count: number; mine: boolean }[]` per message (mine = includes current userId). Attach `reactions` array to each message object.
   - Compute `typers`: other participants of this conversation whose `lastTypingAt` is within the last 6 seconds (`gt(lastTypingAt, now - 6s)`), joined to users for names. Return `typers: { id, name }[]`.
   - Response becomes `{ messages: rows, meId: userId, typers }`. Keep the existing lastReadAt update.

D. New file app/api/messages/reactions/route.ts — `export async function POST`:
   - Body `{ messageId, emoji }`. verifySession. Look up the message's conversationId, guard with `isParticipant`. Toggle: if a row `(messageId, userId, emoji)` exists, delete it; else insert it. Return `{ ok: true }`. (You may inline a small isParticipant-equivalent query or import — match the existing guard pattern.)

E. New file app/api/messages/typing/route.ts — `export async function POST`:
   - Body `{ conversationId }`. verifySession + isParticipant guard. `update conversationParticipants set lastTypingAt = now() where conversationId and userId`. Return `{ ok: true }`. Keep it cheap — this is called frequently.

Import `messageReactions` from `@/db/schema` and needed drizzle ops (`and`, `eq`, `gt`, `inArray`, `sql`).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "api/messages" | grep -v "^#" | wc -l | tr -d ' ' | grep -qx 0 && echo API_OK</automated>
  </verify>
  <done>Group POST creates a conversation with isGroup=true and all participants; conversations GET returns isGroup/title/others/name without breaking 1:1; messages GET returns per-message reactions and a typers array; reactions POST toggles a reaction row (unique-constrained); typing POST stamps lastTypingAt; `npm run lint` and `npx tsc --noEmit` pass for these files.</done>
</task>

<task type="auto">
  <name>Task 3: Drawer UI — group creation, sender names, emoji picker, reactions, typing, fullscreen expand</name>
  <files>app/_components/chat-drawer.tsx</files>
  <action>
Extend the existing drawer. Keep the vaul Drawer for the compact mode; add a fullscreen panel branch. Preserve all existing 1:1 behavior.

Types: extend `Conversation` with `isGroup?: boolean; title?: string | null; others?: ChatUser[]; name?: string`. Extend `Msg` with `reactions?: { emoji: string; count: number; mine: boolean }[]`. Add response typing for `typers` in loadMessages.

1. GROUP CREATION: In the "New message" area, add a mode toggle between "Direct" and "Group". In group mode render the same user list but with checkboxes for multi-select plus a title text input; a "Create group" button POSTs `{ userIds: selectedIds, title }` to `/api/messages/conversations`, then opens the returned conversation. Keep the single-select `startChat(u)` path for direct.

2. SENDER NAMES: In the thread render, when the active conversation `isGroup` is true and a message is not mine, show `m.senderName` as a small label above the bubble (text-xs text-gray-400, aligned left). Do not show names in 1:1 threads. Header title uses `activeConv.name`/`title` for groups instead of `activeOther.name`.

3. EMOJI PICKER (composer): Add an emoji button (material-symbols "mood") next to the attach button. Toggling it opens a small popover grid of ~40 hardcoded native emoji characters (a flat `const EMOJIS = ['😀','😂','👍','🙏',...]`). Clicking one appends the character to `input`. No new deps.

4. REACTIONS: On each message bubble, on hover (group-hover) show a small "react" button (material-symbols "add_reaction") that opens a tiny emoji popover (reuse the same EMOJIS list, or a short subset). Selecting an emoji POSTs `{ messageId, emoji }` to `/api/messages/reactions`, then calls `loadMessages(activeConvId)`. Below each bubble, render reaction chips from `m.reactions`: each chip shows `{emoji} {count}`, highlighted when `mine`, and clicking a chip re-POSTs the same emoji to toggle it off/on. Do optimistic refresh via loadMessages.

5. TYPING INDICATOR: Store `typers` from loadMessages in state. When the active thread has typers (excluding me), render "X is typing…" (or "Several people are typing…" for >1) just above the composer. Heartbeat: in the composer `onChange`, throttle a POST to `/api/messages/typing` with `{ conversationId }` to at most once every ~2.5s while the user is actively typing (use a ref timestamp guard). Tighten the active-thread poll interval from 3000ms to 2000ms so typers/reactions feel live.

6. FULLSCREEN EXPAND: Add an `expanded` state and a `panelRef`. Add an expand button (material-symbols "open_in_full") in the drawer header. When clicked, close the vaul drawer visual constraint by rendering a fixed fullscreen panel (`fixed inset-0 z-50 flex bg-white`) INSTEAD of the drawer content — mirror paul-arredo: on expand `gsap.fromTo(panelRef, { scale:0.15, opacity:0, transformOrigin:'bottom right' }, { scale:1, opacity:1, duration:0.4, ease:'power3.out' })`; on collapse `gsap.to(panelRef, { scale:0.15, opacity:0, duration:0.3, ease:'power3.in', onComplete:()=>setExpanded(false) })`. Fullscreen layout is Slack-like: left sidebar = conversation list (reuse the conversation-row markup), right = the active thread + composer (reuse the thread/composer markup). A collapse button (material-symbols "close_fullscreen") returns to the drawer. Factor the conversation-list, thread, and composer JSX into small inline sub-renders so both drawer and fullscreen share them and the DM flow stays intact.

Keep everything client-side (`'use client'` already present). Run lint + tsc.
  </action>
  <verify>
    <automated>npm run lint 2>&1 | grep -iE "chat-drawer" | grep -viE "warning" | grep -v "^#" | wc -l | tr -d ' ' | grep -qx 0 && npx tsc --noEmit 2>&1 | grep -i "chat-drawer" | grep -v "^#" | wc -l | tr -d ' ' | grep -qx 0 && echo UI_OK</automated>
  </verify>
  <done>Drawer supports creating a group (multi-select + title); group threads show sender names on others' bubbles and the group title in the header; composer has a working native-emoji picker; messages show reaction chips with counts that toggle on click and a hover react button; an open thread shows "X is typing…" driven by the typing heartbeat + 2s poll; an expand button animates the chat to a fullscreen sidebar+thread layout via GSAP and collapse returns to the drawer; the existing 1:1 DM flow still works; lint + tsc pass.</done>
</task>

</tasks>

<verification>
- `npx drizzle-kit push` applied the new columns/table with no errors.
- `npm run lint` passes (no new errors in touched files).
- `npx tsc --noEmit` passes.
- Manual smoke (dev server): create a group, send a message (sender name shows), add + toggle a reaction, see typing indicator across two sessions, expand to fullscreen and collapse; confirm a plain 1:1 DM still creates, sends, and shows unread counts.
</verification>

<success_criteria>
- All three tasks' `<done>` criteria met.
- Every must_haves truth is observable in the running app.
- 1:1 DM flow unchanged and functional.
- No heavy emoji dependency added (git diff of package.json shows no new emoji package).
- Reactions and typing operate purely over the existing polling cycle.
</success_criteria>

<output>
Create `.planning/quick/260706-bpg-slack-like-group-chat-group-conversation/260706-bpg-SUMMARY.md` when done.
</output>
