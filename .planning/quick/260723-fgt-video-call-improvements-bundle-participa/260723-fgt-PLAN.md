---
phase: quick-260723-fgt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/text-case.ts
  - lib/video-calls.ts
  - actions/video-calls.ts
  - app/(app)/calls/page.tsx
  - app/(app)/calls/[id]/page.tsx
  - app/_components/add-call-participants.tsx
  - app/_components/video-call-room.tsx
  - app/_components/call-chat-panel.tsx
  - app/(app)/admin/call-analytics/page.tsx
  - app/_components/sidebar-nav.tsx
  - lib/video-chat.ts
  - package.json
  - package-lock.json
  - tests/lib/video-calls.test.ts
  - tests/actions/video-calls.test.ts
  - tests/lib/video-chat.test.ts
autonomous: false
requirements: [TITLECASE-01, PARTREM-01, ENDALL-01, CHAT-01, CHAT-02, ANALYTICS-01]

must_haves:
  truths:
    - "Call creator or an admin (super_admin/operations) can remove any other participant (never the creator) from an active call via a control on that participant's pill"
    - "A super_admin/operations user sees and can use the 'End for everyone' button on a call room even when they didn't create the call"
    - "Names render Title Case everywhere in the video-call feature (calls list, new-call/add-participant pickers, GetStream video tile labels) without any DB value being rewritten"
    - "Any participant in a call room can toggle a docked chat panel and exchange GetStream-Chat-backed messages scoped to that one call"
    - "An admin visiting /admin/call-analytics sees total calls, total hours used, average call duration, and count of currently-active calls, derived only from existing video_calls/video_call_participants columns"
  artifacts:
    - path: "lib/text-case.ts"
      provides: "toTitleCase(value: string): string — pure, display-layer only"
      exports: ["toTitleCase"]
    - path: "lib/video-chat.ts"
      provides: "chatServerClient/getOrCreateChatChannel/addChatChannelMembers/mintChatToken"
      exports: ["mintChatToken", "getOrCreateChatChannel", "addChatChannelMembers"]
    - path: "app/_components/call-chat-panel.tsx"
      provides: "docked GetStream Chat panel client component"
      min_lines: 30
    - path: "app/(app)/admin/call-analytics/page.tsx"
      provides: "call usage analytics stat cards, admin-only"
      min_lines: 40
    - path: "lib/video-calls.ts"
      provides: "removeCallParticipant + requiredEnv exported for reuse by lib/video-chat.ts"
      contains: "removeCallParticipant"
    - path: "actions/video-calls.ts"
      provides: "removeVideoCallParticipantAction with creator/admin authorization"
      contains: "removeVideoCallParticipantAction"
  key_links:
    - from: "app/_components/add-call-participants.tsx"
      to: "actions/video-calls.ts"
      via: "removeVideoCallParticipantAction call on the pill's remove control"
      pattern: "removeVideoCallParticipantAction"
    - from: "app/_components/video-call-room.tsx"
      to: "app/_components/call-chat-panel.tsx"
      via: "conditional render of the docked chat toggle"
      pattern: "CallChatPanel"
    - from: "app/(app)/calls/[id]/page.tsx"
      to: "lib/video-chat.ts"
      via: "mintChatToken + getOrCreateChatChannel called on every room page load"
      pattern: "mintChatToken"
    - from: "app/(app)/admin/call-analytics/page.tsx"
      to: "db/schema.ts videoCalls"
      via: "direct drizzle query, same pattern as admin/analytics/page.tsx"
      pattern: "videoCalls"
---

<objective>
Bundle of five improvements to the existing GetStream-backed video-call feature: (1) participant removal, (2) exposing the already-server-permitted superadmin end-call-for-all in the client UI, (3) display-layer name title-casing across the feature, (4) a GetStream-Chat-SDK-backed in-call chat panel, and (5) a new admin-only call-usage analytics page.

Purpose: Close UX gaps reported on the existing video-call feature (no way to remove someone, admins can't end calls they didn't start, inconsistent name casing) and add two net-new capabilities the team asked for (in-call chat, usage analytics) — without touching the unrelated Slack-like app chat feature or its conversations/messages tables.

Output: lib/text-case.ts (new), lib/video-chat.ts (new), app/_components/call-chat-panel.tsx (new), app/(app)/admin/call-analytics/page.tsx (new), plus extensions to lib/video-calls.ts, actions/video-calls.ts, add-call-participants.tsx, video-call-room.tsx, calls/page.tsx, calls/[id]/page.tsx, and sidebar-nav.tsx.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@AGENTS.md
@.planning/quick/260723-fgt-video-call-improvements-bundle-participa/260723-fgt-CONTEXT.md
@.planning/quick/260723-fgt-video-call-improvements-bundle-participa/260723-fgt-RESEARCH.md

<interfaces>
<!-- Extracted from the codebase. Use these directly — do not re-explore. -->

lib/video-calls.ts current shape (all server-only, CALL_TYPE = 'default'):
- requiredEnv(name) — private helper, trims env var, throws if missing. Must become "export function requiredEnv" so lib/video-chat.ts can reuse it (per CONTEXT.md: "reuse the existing streamClient()/requiredEnv() credential pattern ... no separate credential handling").
- streamClient(): StreamClient — lazy cached singleton, video product only, no .channel()/.chat method (confirmed by RESEARCH.md Pitfall 2).
- upsertVideoCallUsers(userIds: string[]) — selects {id, name} from users, calls streamClient().upsertUsers(rows.map(r => ({ id: r.id, name: r.name ?? r.id }))). This is the ONE place GetStream video-tile labels get their name from.
- getCallParticipants(callId): Promise<CallParticipant[]> ({ userId, name, role }) — the single query every consumer (/calls list via getMyCalls, call room, add-call-participants.tsx) reads participant names from.
- createVideoCall, addVideoCallParticipants, ensureCallParticipant, endVideoCall — each calls upsertVideoCallUsers(...) then a streamClient().video.call(CALL_TYPE, callId) membership mutation (getOrCreate/updateCallMembers). createVideoCall wraps its GetStream calls in try/catch that deletes the just-inserted video_calls row and rethrows on any failure — chat-channel wiring should live inside this same try block so a chat failure rolls back identically.
- db import is @/db; videoCalls/videoCallParticipants/users from @/db/schema; and, desc, eq, inArray already imported from drizzle-orm (add none new for removal — reuse and/eq).

actions/video-calls.ts current shape:
- verifySessionForAction(tabToken) from @/lib/dal returns { userId, role }; isAdminRole(role as UserRole) from the same import gates admin-only branches.
- endVideoCallAction is the exact permission shape to mirror for removal: call.createdBy !== userId && !isAdminRole(role as UserRole) -> error 'Only whoever started this call, or an admin, can end it for everyone.'.
- Every action signature is (tabToken: string | null, input: {...}) => Promise<VideoCallActionState>; VideoCallActionState = { status: 'idle'|'success'|'error'; message?: string; callId?: string }.

app/_components/video-call-room.tsx current shape:
- Props include isCreator: boolean, participants: CallParticipantInfo[], allUsers, dashboard. The header button row currently renders the "End for everyone" button gated only on isCreator — this is the exact guard that needs isCreator || isAdmin.
- Renders <AddCallParticipants callId={callId} existing={participants} allUsers={allUsers} /> directly beneath the media-permission banner.
- client = useMemo(() => new StreamVideoClient({ apiKey, user: { id: userId, name: userName }, token }), [...]) and call = useMemo(() => client.call('default', callId), [client, callId]) — both stay as-is; chat is a fully separate client/connection per RESEARCH.md Pitfall 2.
- Uses getTabToken() from @/lib/use-tab-token for every action call (endVideoCallAction(getTabToken(), { callId })) — the same pattern the new remove action must use.

app/_components/add-call-participants.tsx current shape:
- Props: { callId: string; existing: { userId: string; name: string }[]; allUsers: PersonOption[] }. Renders existing as rounded pills in a flex flex-wrap gap-1.5 row, with an "Add people" toggle button beside it. Uses useTransition + getTabToken() for addVideoCallParticipantsAction, then router.refresh() on success.

app/(app)/calls/[id]/page.tsx current shape:
- const { userId, role } = await verifySession(); const dashboard = roleDashboard(role); const call = await getCall(id); then await ensureCallParticipant(id, userId); then const [participants, allUsers] = await Promise.all([...]); then const { apiKey, token } = mintVideoToken(userId, id); renders <VideoCallRoom apiKey userId userName token callId title isCreator participants allUsers dashboard />.
- isAdminRole is re-exported from @/lib/dal ("export { isAdminRole }" in dal.ts) — import it alongside verifySession.

app/(app)/admin/analytics/page.tsx StatCard pattern to mirror stylistically:
- Local (not exported) StatCard({ label, value, hint }) component rendering a "rounded-xl border border-gray-200 bg-white p-5 shadow-sm" card; page wraps 4 of them in a grid section; gated by await requireAdmin() from @/lib/dal; export const dynamic = 'force-dynamic'.

app/_components/sidebar-nav.tsx: NAV.super_admin has an Insights group with items [{ href: '/admin/analytics', ... }, { href: '/admin/overview', ... }]. operations role has no own NAV entry and falls back to NAV.super_admin (the lookup line reads NAV[role] ?? NAV[role === Roles.Operations ? Roles.SuperAdmin : role] ?? []) — adding one entry to the Insights group's items array covers both admin roles.

tests/lib/video-calls.test.ts and tests/actions/video-calls.test.ts mocking conventions (extend, don't replace):
- vi.hoisted(() => ({ ...Mock: vi.fn() })) for every mock fn referenced inside vi.mock(...) factories.
- The @/db mock's insert/select/update builders are hand-rolled thenables; a delete: () => ({ where: deleteWhereMock }) branch must be added for the new removeCallParticipant — mirror the existing update/where shape.
- FakeStreamClient's video.call(...) factory returns { getOrCreate, updateCallMembers, end } — GetStream's real removal method is updateCallMembers({ remove_members: [...] }) (not a separate method), so no new mock method is needed — assert the existing updateCallMembersMock was called with { remove_members: [userId] }.
- tests/actions/video-calls.test.ts mocks @/lib/video-calls wholesale — add removeCallParticipant: removeCallParticipantMock to that factory and the vi.hoisted block.
</interfaces>
</context>

<constraints>
- Do NOT touch the app's existing Slack-like conversations/messages chat tables/routes/chat-drawer.tsx — GetStream Chat is a fully separate feature (chat-vendor decision).
- Do NOT add a "remove yourself" control — leaving a call already has its own in-room control (out of scope per CONTEXT.md).
- Do NOT change any stored users.name value — title-casing is display-layer only, applied where names are read/rendered/sent to GetStream.
- Do NOT add ChannelList or Thread from stream-chat-react — exactly one fixed channel per call (RESEARCH.md Anti-Patterns).
- Use import 'stream-chat-react/css/index.css' — NOT the legacy .../dist/css/v2/index.css path (RESEARCH.md Pitfall 1, verified against the installed tarball).
- Ending a call must NOT delete its chat channel/messages (CONTEXT.md — chat is scoped to the call, not deleted with it).
- Roles: use isAdminRole/Roles.* from @/lib/workflow (re-exported via @/lib/dal), never string literals.
- Next 16: await params/headers()/cookies() wherever touched (already correctly done in the read files — preserve the pattern).
- Package installs (stream-chat, stream-chat-react) are already vetted: RESEARCH.md's Package Legitimacy Audit table shows both OK/Approved — no additional legitimacy checkpoint needed before npm install.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Title-case helper and apply across the video-call feature</name>
  <files>lib/text-case.ts, lib/video-calls.ts, app/(app)/calls/page.tsx, app/(app)/calls/[id]/page.tsx</files>
  <action>
Per the name title-casing decision: create lib/text-case.ts following the lib/position-slug.ts convention (pure function, no server-only import, importable from server or client code) exporting toTitleCase(value: string): string — lowercase the whole string, then uppercase the first letter of every run following start-of-string, whitespace, or a hyphen/apostrophe, so "john o'brien" becomes "John O'Brien" and "mary-jane smith" becomes "Mary-Jane Smith".

Apply it at the three data-source points that feed every name-rendering consumer in the feature (this covers the /calls list, the new-call/add-participant pickers, the call-room header/participant list, AND GetStream's own video-tile labels, without needing to touch new-call-form.tsx, add-call-participants.tsx, or video-call-room.tsx directly — they all render names sourced from these three spots):
1. lib/video-calls.ts's upsertVideoCallUsers — wrap the name passed into streamClient().upsertUsers(...) with toTitleCase(r.name ?? r.id) (this is what fixes GetStream's own video-tile labels).
2. lib/video-calls.ts's getCallParticipants — apply toTitleCase to the returned name field (covers /calls list via getMyCalls, the call-room participant pills in add-call-participants.tsx, and userName passed into VideoCallRoom from calls/[id]/page.tsx).
3. The raw allUsers query in both app/(app)/calls/page.tsx and app/(app)/calls/[id]/page.tsx (db.select({ id, name, role }).from(users).where(ne(users.id, userId)).orderBy(users.name)) — map the result to title-case the name field before passing to NewCallForm/VideoCallRoom's allUsers prop.

Import toTitleCase from @/lib/text-case in all three files.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "text-case|video-calls\.ts|app/\(app\)/calls" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo TITLECASE_OK</automated>
  </verify>
  <done>lib/text-case.ts exports toTitleCase; upsertVideoCallUsers, getCallParticipants, and both allUsers queries title-case names before use; no stored users.name value is written; tsc --noEmit reports no errors in the touched files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Participant removal + superadmin end-call-for-all UI fix</name>
  <files>lib/video-calls.ts, actions/video-calls.ts, tests/lib/video-calls.test.ts, tests/actions/video-calls.test.ts, app/_components/add-call-participants.tsx, app/_components/video-call-room.tsx, app/(app)/calls/[id]/page.tsx</files>
  <behavior>
    - removeCallParticipant(callId, userId) (lib): deletes the video_call_participants row for (callId, userId) and calls streamClient().video.call(CALL_TYPE, callId).updateCallMembers({ remove_members: [userId] }); a GetStream failure here is non-fatal (mirror endVideoCall's try/catch — the DB row deletion is this app's source of truth).
    - removeVideoCallParticipantAction (action): call-not-found -> error; call already ended -> error "This call has ended."; actor is neither call.createdBy nor isAdminRole(role) -> error "Only whoever started this call, or an admin, can remove someone."; target userId === call.createdBy -> error "The call creator can't be removed."; otherwise calls removeCallParticipant, revalidatePath(/calls/{callId}), returns { status: 'success' }.
    - endVideoCallAction's existing authorization is UNCHANGED (already correct server-side per CONTEXT.md — only the client UI is wrong).
  </behavior>
  <action>
Per the participant-removal-permissions and superadmin-end-call-for-all decisions.

1. lib/video-calls.ts: add "export async function removeCallParticipant(callId: string, userId: string): Promise&lt;void&gt;" per the behavior block above, placed near endVideoCall (same file region/style — and/eq are already imported).
2. actions/video-calls.ts: add "export async function removeVideoCallParticipantAction(tabToken: string | null, input: { callId: string; userId: string }): Promise&lt;VideoCallActionState&gt;" implementing the exact permission/error shape in the behavior block, importing removeCallParticipant from @/lib/video-calls. Do NOT add a self-removal guard beyond what's specified — removing yourself is out of scope, not a case to defend against.
3. Extend tests/lib/video-calls.test.ts: add a db.delete branch to the existing hand-rolled @/db mock (delete: () => ({ where: deleteWhereMock }), with a new hoisted deleteWhereMock), then a describe('removeCallParticipant', ...) block asserting the delete-where call shape and updateCallMembersMock called with { remove_members: ['&lt;userId&gt;'] }.
4. Extend tests/actions/video-calls.test.ts: add removeCallParticipantMock to the hoisted block and the @/lib/video-calls mock factory, then a describe('removeVideoCallParticipantAction', ...) block covering: call not found, call ended, non-creator/non-admin rejected, creator-cannot-be-removed rejected, creator succeeds, admin succeeds removing a non-creator.
5. UI wiring for BOTH participant removal and the admin end-call-for-all fix:
   - app/(app)/calls/[id]/page.tsx: import isAdminRole alongside verifySession from @/lib/dal; compute const isAdmin = isAdminRole(role); pass isAdmin={isAdmin} and creatorId={call.createdBy} as new props to VideoCallRoom.
   - app/_components/video-call-room.tsx: accept new props isAdmin: boolean and creatorId: string; change the "End for everyone" button's guard from isCreator to (isCreator || isAdmin); pass canManage={isCreator || isAdmin} and creatorId={creatorId} down to AddCallParticipants.
   - app/_components/add-call-participants.tsx: accept new props canManage: boolean and creatorId: string; for each pill in existing, when canManage && p.userId !== creatorId, render a small "x" icon button (icon-only, matching this file's existing icon-button conventions) that calls removeVideoCallParticipantAction(getTabToken(), { callId, userId: p.userId }) inside a useTransition, then router.refresh() on success and surfaces res.message on error using the file's existing message/ok state pattern.
  </action>
  <verify>
    <automated>npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts</automated>
  </verify>
  <done>Both extended test files pass (new + pre-existing cases green); the creator's own pill never shows a remove control; a non-creator/non-admin caller cannot remove anyone via the action; a super_admin/operations user sees "End for everyone" on any active call regardless of who created it; npm run lint and npx tsc --noEmit pass for all touched files.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Confirm GetStream Chat product is enabled</name>
  <files>N/A — dashboard-only check, no repo files touched</files>
  <what-built>N/A — pre-flight check before Task 4 writes lib/video-chat.ts against the existing GETSTREAM_APIKEY/GETSTREAM_SECRET pair.</what-built>
  <action>
Video is already active/billed on this GetStream account, but Chat is a separate GetStream product that may not be provisioned on the same app/API key (RESEARCH.md Open Question 1). Log into the GetStream dashboard (dashboard.getstream.io), select the app matching this project's GETSTREAM_APP_ID, and confirm the Chat product is enabled/provisioned for that app. If it is not enabled, enable it now (no code changes needed on this project's side either way — it's a dashboard toggle).
  </action>
  <how-to-verify>
Log into the GetStream dashboard (dashboard.getstream.io), select the app matching this project's GETSTREAM_APP_ID, and confirm the Chat product is enabled/provisioned for that app. If it is not enabled, enable it now.
  </how-to-verify>
  <verify>
    <automated>MISSING — manual GetStream dashboard check, not automatable</automated>
  </verify>
  <done>GetStream Chat product confirmed enabled (or newly enabled) for the app matching GETSTREAM_APP_ID.</done>
  <resume-signal>Type "chat enabled" once confirmed (or already was) — Task 4 proceeds either way, but if channel creation fails with a product-not-enabled-style error, this is the first thing to re-check.</resume-signal>
</task>

<task type="auto" tdd="true">
  <name>Task 4: GetStream Chat backend — channel/token minting wired into call lifecycle</name>
  <files>package.json, package-lock.json, lib/video-calls.ts, lib/video-chat.ts, tests/lib/video-chat.test.ts, app/(app)/calls/[id]/page.tsx</files>
  <behavior>
    - chatServerClient(): lazy cached singleton, StreamChat.getInstance(apiKey, secret, { disableCache: true }), reusing requiredEnv exported from lib/video-calls.ts.
    - mintChatToken(userId): returns chatServerClient().createToken(userId, exp) where exp = Math.floor(Date.now()/1000) + TOKEN_TTL_SECONDS (mirror the 1-hour TTL already used for video, re-minted fresh per page load).
    - getOrCreateChatChannel(callId, memberIds): chatServerClient().channel('messaging', callId, { members: memberIds, created_by_id: memberIds[0] }).create() — idempotent, safe to call every time a call is created.
    - addChatChannelMembers(callId, newUserIds): chatServerClient().channel('messaging', callId).addMembers(newUserIds) — no-op-safe for already-present members.
  </behavior>
  <action>
Per the GetStream-Chat-SDK decision (id-mapped to call id, reusing existing credential pattern).

1. Run "npm install stream-chat stream-chat-react" (both already legitimacy-vetted in RESEARCH.md — proceed without an additional checkpoint).
2. lib/video-calls.ts: change the private requiredEnv to "export function requiredEnv" (no other change to it) so lib/video-chat.ts can reuse it without duplicating credential handling.
3. Create lib/video-chat.ts (new file, mirrors lib/video-calls.ts's structure — import 'server-only', lazy singleton, no module-load throw) implementing the four functions in the behavior block above. Import requiredEnv from ./video-calls and StreamChat from stream-chat.
4. Wire chat-channel lifecycle into the SAME call sites lib/video-calls.ts already mutates GetStream video membership at (per RESEARCH.md's data-flow diagram — mirrors call.getOrCreate()/call.updateCallMembers() symmetry):
   - In createVideoCall, inside the existing try block, immediately after "await call.getOrCreate(...)" succeeds: "await getOrCreateChatChannel(row.id, memberIds)". A failure here rolls back identically to a video-call-creation failure (existing catch already deletes the row and rethrows).
   - In addVideoCallParticipants, immediately after "await call.updateCallMembers(...)": "await addChatChannelMembers(opts.callId, newIds)".
   - In ensureCallParticipant, immediately after "await call.updateCallMembers(...)": "await addChatChannelMembers(callId, [userId])" (covers users who join via a shared link rather than an explicit invite).
   - Reuse the already-called upsertVideoCallUsers(...) at each of these sites as satisfying GetStream Chat's "user must exist" requirement too (RESEARCH.md Assumption A1 — same app-wide user registry). If any of the three call sites above throws an "unknown user" style error from the Chat SDK specifically (not the video SDK), that assumption was wrong — add a chatServerClient().upsertUsers(...) call alongside the existing video-side upsert at that site as the fix, and note it in the summary.
5. app/(app)/calls/[id]/page.tsx: after "const { apiKey, token } = mintVideoToken(userId, id)", add "const chatToken = mintChatToken(userId)" (import from @/lib/video-chat) and pass chatToken={chatToken} as a new prop to VideoCallRoom (reuse the existing apiKey prop for chat too — same GetStream account, no separate chatApiKey needed).
6. Create tests/lib/video-chat.test.ts mirroring tests/lib/video-calls.test.ts's mocking conventions (vi.hoisted, a FakeStreamChat factory function mocking getInstance/channel/createToken, process.env.GETSTREAM_APIKEY/GETSTREAM_SECRET set before import) covering: getOrCreateChatChannel calls channel('messaging', callId, {...}).create() with the right member list, addChatChannelMembers calls .addMembers(newUserIds), mintChatToken calls .createToken(userId, expect.any(Number)).
  </action>
  <verify>
    <automated>npx vitest run tests/lib/video-chat.test.ts tests/lib/video-calls.test.ts && npx tsc --noEmit 2>&1 | grep -iE "video-chat|video-calls\.ts" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo CHATBACKEND_OK</automated>
  </verify>
  <done>package.json/package-lock.json show stream-chat and stream-chat-react as dependencies; lib/video-chat.ts exports mintChatToken/getOrCreateChatChannel/addChatChannelMembers; createVideoCall/addVideoCallParticipants/ensureCallParticipant each call the matching chat function alongside their existing GetStream video membership mutation; tests/lib/video-chat.test.ts passes; tsc --noEmit reports no errors in the touched files.</done>
</task>

<task type="auto">
  <name>Task 5: In-call chat panel (client UI, docked beside the video grid)</name>
  <files>app/_components/call-chat-panel.tsx, app/_components/video-call-room.tsx</files>
  <action>
Per the GetStream-Chat-SDK client-side decision (toggleable side panel, docked Zoom/Meet-style, reachable only from within the call room).

1. Create app/_components/call-chat-panel.tsx as a 'use client' component. Import Chat, Channel, Window, MessageList, MessageInput, useCreateChatClient from 'stream-chat-react', and the CSS via "import 'stream-chat-react/css/index.css'" (NOT the legacy v2 path). Props: { apiKey: string; userId: string; userName: string; token: string; callId: string }. Use useCreateChatClient({ apiKey, tokenOrProvider: token, userData: { id: userId, name: userName } }); while the returned client is null, render a small "Setting up chat…" placeholder. Once connected, split into an inner component (mirrors this codebase's own CallRoomInner split pattern in video-call-room.tsx) that does "const channel = useMemo(() => client.channel('messaging', callId), [client, callId])" and renders exactly Channel > Window > MessageList + MessageInput — no ChannelList, no Thread.
2. app/_components/video-call-room.tsx: accept a new prop chatToken: string. Add local state "const [chatOpen, setChatOpen] = useState(false)". Add a toggle button in the existing header button row (material-symbols "chat" icon, matching the styling of the neighboring Fullscreen/Copy-link buttons) that flips chatOpen. Change the video-grid wrapper (the div currently holding CallRoomInner) to sit inside a flex row: the video grid stays on the left (flex-1 or similar) and, when chatOpen is true, a fixed-width panel (e.g. w-80 shrink-0) renders "&lt;CallChatPanel apiKey={apiKey} userId={userId} userName={userName} token={chatToken} callId={callId} /&gt;" docked to the right — beside the video grid, not replacing it, matching the Zoom/Meet-style layout from CONTEXT.md.
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "call-chat-panel|video-call-room" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && npm run lint 2>&1 | grep -iE "call-chat-panel|video-call-room" | grep -viE "warning" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo CHATUI_OK</automated>
  </verify>
  <done>A chat toggle button in the call room header opens/closes a docked panel beside the video grid (not covering it); the panel renders a working GetStream Chat message list + input scoped to the call's channel; no ChannelList/Thread present; ending the call does not delete the channel (no delete/remove-channel call was added anywhere); tsc and lint pass for both files.</done>
</task>

<task type="auto">
  <name>Task 6: Call usage analytics page (admin-only)</name>
  <files>app/(app)/admin/call-analytics/page.tsx, app/_components/sidebar-nav.tsx</files>
  <action>
Per the analytics-page-location decision (new dedicated page at /admin/call-analytics, metrics from existing video_calls columns only, StatCard styled like app/(app)/admin/analytics/page.tsx).

1. Create app/(app)/admin/call-analytics/page.tsx as an async Server Component: "export const dynamic = 'force-dynamic'"; gate with "await requireAdmin()" from @/lib/dal. Query all rows via "db.select().from(videoCalls)" (import videoCalls from @/db/schema). For each row compute a duration in milliseconds: ended calls use "row.endedAt.getTime() - row.createdAt.getTime()", still-active calls use "Date.now() - row.createdAt.getTime()". Derive: totalCalls = rows.length; totalHours = sum(durationMs) / 3_600_000; avgDurationMinutes = totalCalls ? (totalHours * 60) / totalCalls : 0; activeCount = rows.filter(r => r.status === 'active').length. Render a local (not exported) StatCard({ label, value, hint }) component styled identically to admin/analytics/page.tsx's own StatCard (rounded-xl border bg-white p-5 shadow-sm), in a grid section with 4 cards: "Total calls", "Total hours used" (e.g. "12.3h"), "Avg call duration" (e.g. "8.4 min"), "Active now" (activeCount). Include a back link to /admin/dashboard and a page heading, matching admin/analytics/page.tsx's layout conventions (max-w wrapper, heading + subtitle).
2. app/_components/sidebar-nav.tsx: add one entry to NAV.super_admin's existing Insights group items array: { href: '/admin/call-analytics', icon: 'videocam', label: 'Call Analytics' } (this single entry covers both super_admin and operations since operations falls back to NAV.super_admin).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | grep -iE "call-analytics|sidebar-nav" | grep -v '^#' | wc -l | tr -d ' ' | grep -qx 0 && echo ANALYTICS_OK</automated>
  </verify>
  <done>/admin/call-analytics renders 4 stat cards (total calls, total hours used, average call duration, currently-active count) computed only from video_calls columns, gated by requireAdmin(); a "Call Analytics" link appears under the Insights group for both super_admin and operations; tsc reports no errors in the touched files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| Browser (video-call-room/add-call-participants/call-chat-panel) -> Server Actions | Untrusted client input: callId, target userId for removal, chat token requests |
| Server (lib/video-calls.ts, lib/video-chat.ts) -> GetStream API | Trusted server-to-server calls using GETSTREAM_SECRET, never exposed to the client |
| Browser (call-chat-panel.tsx) -> GetStream Chat WebSocket | Client connects with a short-lived, user-scoped token only — no admin/secret capability |
| Any authenticated user -> /admin/call-analytics | Must be gated to super_admin/operations only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|------------------|
| T-fgt-01 | Elevation of Privilege | removeVideoCallParticipantAction | mitigate | Server-side check: actor must be call.createdBy OR isAdminRole(role); implemented in Task 2, covered by new action tests |
| T-fgt-02 | Elevation of Privilege | removeVideoCallParticipantAction | mitigate | Explicit guard rejecting removal when target userId === call.createdBy, regardless of actor's own permissions |
| T-fgt-03 | Elevation of Privilege | endVideoCallAction (client exposure only) | accept | Server-side authorization was already correct pre-existing; Task 2 only fixes the client UI gating, no new server risk introduced |
| T-fgt-04 | Information Disclosure | mintChatToken / lib/video-chat.ts | mitigate | GETSTREAM_SECRET stays server-only (import 'server-only'); only the signed, user-scoped, time-limited token crosses to the client, mirroring the existing mintVideoToken pattern |
| T-fgt-05 | Tampering | GetStream Chat channel membership | mitigate | Channel membership is only ever mutated server-side (getOrCreateChatChannel/addChatChannelMembers); the browser client only connects with a scoped user token and cannot add/remove members |
| T-fgt-06 | Information Disclosure | /admin/call-analytics | mitigate | Page gated by await requireAdmin() (super_admin/operations only), same as the existing /admin/analytics page |
| T-fgt-SC | Tampering | npm install stream-chat / stream-chat-react | accept | RESEARCH.md's Package Legitimacy Audit already ran slopcheck against both packages with an OK/Approved verdict for each — no [ASSUMED]/[SUS] items requiring an additional blocking checkpoint |
</threat_model>

<verification>
- npx tsc --noEmit passes project-wide (or at minimum shows zero errors in every file listed in files_modified).
- npm run lint passes for every touched file.
- npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts tests/lib/video-chat.test.ts passes (existing + new cases).
- Manual smoke (dev server, two browser sessions per MEMORY.md's concurrent-session caution — use a fresh/isolated test call, do not disrupt the other live session): start a call, confirm a participant pill's remove control works and the creator's own pill never shows one; confirm a super_admin who didn't create the call sees "End for everyone"; confirm names render Title Case in the calls list, pickers, and video tiles; open the chat panel, send a message, confirm it's visible in the other session; confirm ending the call does not error out chat; visit /admin/call-analytics as an admin and confirm the 4 stat cards render sane values.
</verification>

<success_criteria>
- All 6 auto/tdd tasks' <done> criteria met, plus the Task 3 checkpoint resumed.
- Every must_haves truth is observable in the running app.
- The existing Slack-like conversations/messages chat feature is untouched (no diff in chat-drawer.tsx or its API routes).
- No stored users.name value changes (title-casing is display-only).
- New dependencies limited to stream-chat and stream-chat-react.
</success_criteria>

<output>
Create `.planning/quick/260723-fgt-video-call-improvements-bundle-participa/260723-fgt-SUMMARY.md` when done.
</output>
