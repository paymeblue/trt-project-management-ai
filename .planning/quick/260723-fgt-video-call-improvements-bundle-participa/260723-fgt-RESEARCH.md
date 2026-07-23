# Quick Task 260723-fgt: In-call Chat (GetStream Chat SDK) - Research

**Researched:** 2026-07-23
**Domain:** GetStream Chat SDK (`stream-chat` + `stream-chat-react`) integration alongside existing GetStream Video SDK
**Confidence:** HIGH (package versions/APIs verified via Context7 + npm registry + tarball inspection; React 19/Next 16 compatibility verified via peerDependencies + prior art in this repo)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Chat vendor: **GetStream Chat SDK** (`stream-chat` + `stream-chat-react`), same vendor as existing `@stream-io/node-sdk` / `@stream-io/video-react-sdk`.
- Explicitly NOT the app's existing `conversations`/`messages` tables (separate feature — do not touch).
- One chat channel per video call, id-mapped to the call id (mirrors `video_calls.id` already doubling as the GetStream video call id).
- Server-side channel/token minting reuses the existing `streamClient()`/`requiredEnv()` credential pattern in `lib/video-calls.ts` — no separate credential handling.
- Client-side: toggleable side panel in `video-call-room.tsx`, docked beside the video grid (Zoom/Meet-style), reachable only from within that call's room.
- Scoped to the call — ending the call does NOT require deleting the channel/messages.
- Research required before implementing current API surface (this document).

### Claude's Discretion
- Exact file/module split for new chat logic (e.g. `lib/video-chat.ts` vs. extending `lib/video-calls.ts`).

### Deferred Ideas (OUT OF SCOPE)
- N/A for chat (see full CONTEXT.md for other bundle items — analytics page, participant removal, etc. — not part of this research file's focus).

## Summary

GetStream ships chat as a **separate product** from video — `@stream-io/node-sdk` (used today for video) does **not** expose chat/channel methods. A second server-side client, `StreamChat` from the `stream-chat` package, must be instantiated with the **same API key/secret** already read via `requiredEnv('GETSTREAM_APIKEY')` / `requiredEnv('GETSTREAM_SECRET')`. Video and Chat are different GetStream products under one account, so the same API key/secret pair works for both, but they require independent client instances and independent user-token calls (the JWTs are structurally interchangeable — both are just `{user_id}` signed with the shared app secret — but must be minted through each SDK's own `createToken`/`generateUserToken` method, not shared as objects, since each client validates it against its own product scope internally).

Client-side, `stream-chat-react` v14 provides everything needed for a compact docked panel via `Chat` + `Channel` + `Window` + `MessageList` + `MessageInput`, deliberately omitting `ChannelList` and `Thread` (those pull in the full "chat app shell" this task explicitly doesn't want). The `useCreateChatClient` hook is the modern idiomatic way to construct/tear down the client (replaces manual `useMemo(() => new StreamChat(...))` + manual `disconnectUser()` cleanup) and returns `null` until connected, giving a natural loading state.

**Critical gotcha found:** the CSS import path documented in most current AI-generated examples (`stream-chat-react/dist/css/v2/index.css`) is a **legacy path removed** in the installed 14.x line — confirmed by inspecting the actual npm tarball, which contains `dist/css/index.css` with no `v2/` subdirectory. Use `stream-chat-react/css/index.css` (or `stream-chat-react/dist/css/index.css`) instead.

**Primary recommendation:** Add a new `lib/video-chat.ts` (mirrors `lib/video-calls.ts` structure/patterns, keeps that file from growing) with a `chatServerClient()` singleton wrapping `StreamChat.getInstance(apiKey, secret, { disableCache: true })`, a `mintChatToken(userId)` using `chatServerClient().createToken(userId)`, and a `getOrCreateChatChannel(callId, memberIds)` using `channel('messaging', callId, { members, created_by_id })` + `.create()`. Client-side, add a `CallChatPanel` client component instantiated inside `VideoCallRoom` via `useCreateChatClient`, toggled by existing header button row.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat channel creation/membership | API/Backend (Server Action / lib) | — | Must use API secret (never exposed to client); mirrors `createVideoCall`'s server-side `call.getOrCreate()` pattern |
| Chat user token minting | API/Backend | — | Requires `GETSTREAM_SECRET`; same trust boundary as `mintVideoToken` |
| Chat UI rendering (message list/input) | Browser/Client | — | `stream-chat-react` components are React-DOM-bound, must be `'use client'` |
| Chat client connection lifecycle | Browser/Client | — | WebSocket connection managed by `StreamChat` instance in the browser via `useCreateChatClient` |
| Channel-per-call id mapping | API/Backend | Database (video_calls.id) | callId is already the source-of-truth id; no new DB column needed — mirrors video call id reuse |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stream-chat` | `^9.50.2` | Server + client-core chat SDK — `StreamChat` class, channel/member/token APIs | Official low-level SDK; peer dependency of `stream-chat-react` (pinned exactly at `^9.50.2` in its own peerDependencies) `[VERIFIED: npm registry]` |
| `stream-chat-react` | `^14.10.0` | React UI components (`Chat`, `Channel`, `MessageList`, `MessageInput`, `useCreateChatClient`) | Official React SDK, actively maintained (published 2026-07-22, one day before this research) `[VERIFIED: npm registry]` |

**React 19 / Next 16 compatibility:** `stream-chat-react@14.10.0`'s `peerDependencies` explicitly list `"react": "^19.0.0 || ^18.0.0 || ^17.0.0"` and `"react-dom"` the same — confirmed via `npm view stream-chat-react peerDependencies` `[VERIFIED: npm registry]`. No incompatibility with React 19.2.4 or Next 16.2.9. Same as `@stream-io/video-react-sdk` already in use, all `stream-chat-react` components are client-rendered (hooks, WebSocket, DOM refs) and MUST be wrapped in a `'use client'` module boundary — exactly the pattern `video-call-room.tsx` already follows.

**Installation:**
```bash
npm install stream-chat stream-chat-react
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@stream-io/node-sdk` for chat (same class as video) | N/A — confirmed not possible | `StreamClient` (video/node-sdk) has no `.chat` or `.channel()` methods; verified by architecture (chat and video are documented as separate GetStream products with separate SDKs) — a second client is mandatory, not a choice |
| `stream-chat-react`'s built-in `Chat`+`ChannelList`+`Channel`+`Thread` full shell | Minimal `Chat`+`Channel`+`Window`+`MessageList`+`MessageInput` (no `ChannelList`, no `Thread`) | Full shell assumes a multi-channel inbox UI; this task needs exactly one fixed channel per call, so `ChannelList` (which needs `filters`/`sort`/`options` and lets the user switch channels) is unnecessary UI surface and extra bundle weight |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `stream-chat` | npm | Mature (GetStream's core SDK, long-established) | High (dependency of many production chat integrations) | github.com/GetStream/stream-chat-js | [OK] | Approved |
| `stream-chat-react` | npm | Mature (14.x major line) | High | github.com/GetStream/stream-chat-react | [OK] | Approved |

Both packages were verified live: `slopcheck install stream-chat stream-chat-react` ran an actual `npm install` in the project sandbox, both resolved and installed cleanly with 2/2 OK verdicts, then the resulting `package.json`/`package-lock.json`/`node_modules` changes were reverted (this is a research task, not an install task — the actual `npm install` belongs to the execution phase). Package names also independently confirmed via Context7 (official GetStream-authored docs at `github.com/getstream/stream-chat-react/blob/master/AI.md` and `github.com/getstream/stream-chat-js`), so these are `[VERIFIED: npm registry]` per the provenance rule (authoritative source + registry pass), not merely `[ASSUMED]`.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser (VideoCallRoom, 'use client')
  │
  ├─ StreamVideoClient (existing) ──ws──> GetStream Video product
  │
  └─ CallChatPanel ('use client', new)
        │  useCreateChatClient({ apiKey, tokenOrProvider: chatToken, userData })
        ▼
     StreamChat client instance ──ws──> GetStream Chat product
        │
        └─ <Chat client><Channel channel={channel}><Window><MessageList/><MessageInput/></Window></Channel></Chat>

Server (lib/video-chat.ts, new — mirrors lib/video-calls.ts)
  │
  ├─ chatServerClient() = StreamChat.getInstance(apiKey, secret, { disableCache: true })  [singleton, lazy like streamClient()]
  ├─ getOrCreateChatChannel(callId, memberIds) → channel('messaging', callId, { members, created_by_id }).create()
  ├─ addChatChannelMembers(callId, newUserIds) → channel.addMembers(newUserIds)
  └─ mintChatToken(userId) → chatServerClient().createToken(userId)

Data flow for "open call room":
  page.tsx (Server Component)
    → getCall(callId), getCallParticipants(callId)   [existing]
    → mintVideoToken(userId, callId)                 [existing]
    → getOrCreateChatChannel(callId, memberIds)       [new — idempotent, same call site as createVideoCall's call.getOrCreate()]
    → mintChatToken(userId)                           [new]
    → passes { chatApiKey, chatToken, callId } as props into <VideoCallRoom>
```

### Recommended Project Structure
```
lib/
├── video-calls.ts     # existing — video call CRUD, streamClient(), mintVideoToken
├── video-chat.ts      # new — chat channel CRUD, chatServerClient(), mintChatToken (mirrors video-calls.ts structure)
app/_components/
├── video-call-room.tsx    # existing — add toggle state + render <CallChatPanel> conditionally
└── call-chat-panel.tsx    # new — 'use client', hosts useCreateChatClient + Chat/Channel/Window/MessageList/MessageInput
```

### Pattern 1: Server-side chat client (mirrors `streamClient()`)
**What:** A lazily-constructed singleton `StreamChat` instance, separate from the video `StreamClient`, reusing the same env vars.
**When to use:** Any server-side chat operation (channel creation, membership, token minting).
**Example:**
```typescript
// Source: Context7 /getstream/stream-chat-js — "Initialize StreamChat Client and Basic Operations"
// https://github.com/getstream/stream-chat-js/blob/master/README.md
import 'server-only';
import { StreamChat } from 'stream-chat';

let cachedChatClient: StreamChat | null = null;
function chatServerClient(): StreamChat {
  if (!cachedChatClient) {
    const apiKey = requiredEnv('GETSTREAM_APIKEY'); // reuse existing helper — same GetStream account
    const secret = requiredEnv('GETSTREAM_SECRET');
    cachedChatClient = StreamChat.getInstance(apiKey, secret, {
      disableCache: true, // recommended for server-side use — avoids stale in-memory state across requests
    });
  }
  return cachedChatClient;
}
```
`StreamChat.getInstance(...)` and `new StreamChat(...)` are equivalent for a fresh client — `getInstance` additionally memoizes internally, but this project already owns its own module-level cache (matching the existing `cachedClient` pattern in `lib/video-calls.ts`), so either constructor works; `getInstance` is used above for parity with GetStream's own server-side examples.

### Pattern 2: Get-or-create a channel scoped to the call id
**What:** One `messaging`-type channel per call, using `callId` as the channel id (same id-reuse pattern as `streamClient().video.call(CALL_TYPE, row.id)`).
**When to use:** Called once when a call is created (mirror `createVideoCall`'s `call.getOrCreate()` call site) and again idempotently whenever a participant opens the room (mirror `ensureCallParticipant`).
**Example:**
```typescript
// Source: Context7 /getstream/stream-chat-js — channel creation + addMembers
export async function getOrCreateChatChannel(
  callId: string,
  memberIds: string[],
): Promise<void> {
  const channel = chatServerClient().channel('messaging', callId, {
    members: memberIds,
    created_by_id: memberIds[0],
  });
  await channel.create(); // idempotent — safe to call again with same id; GetStream returns existing channel
}

export async function addChatChannelMembers(
  callId: string,
  newUserIds: string[],
): Promise<void> {
  const channel = chatServerClient().channel('messaging', callId);
  await channel.addMembers(newUserIds); // mirrors call.updateCallMembers() in video-calls.ts
}
```
**Note on the users-must-exist-first constraint:** GetStream Chat, like Video, requires referenced users to exist server-side. Reuse (or extend) `upsertVideoCallUsers` — it currently only calls `streamClient().upsertUsers(...)` (video product). Verify whether the Video and Chat products share one underlying "app user" registry (both are under the same GetStream app/API key) or need a separate `chatServerClient().upsertUsers(...)` call. Training-data confidence is MEDIUM here — GetStream's dashboard treats users as app-wide (shared across Video/Chat/Feeds products within one API key), so a single `upsertUsers` call is *likely* sufficient for both, but this specific cross-product behavior was not directly confirmed by Context7 docs in this session. `[ASSUMED]` — flagged in Assumptions Log below; cheap to verify empirically (create a Chat channel referencing a user only upserted via the Video-product call and see if it errors the same way `video.call().getOrCreate()` does for unknown users).

### Pattern 3: Token minting (separate token, same secret)
**What:** A chat-specific user JWT via `stream-chat`'s own `createToken`, not reused from `mintVideoToken`.
**Example:**
```typescript
// Source: Context7 /getstream/stream-chat-js — "createToken - Generate JWT user token server-side"
export function mintChatToken(userId: string): string {
  return chatServerClient().createToken(userId);
}
```
`createToken` has no `validity_in_seconds` shorthand like `StreamClient.generateUserToken` — pass `exp` (unix timestamp) as the second arg if a TTL is wanted; omitting it mints a non-expiring token. Given the existing video token already re-mints fresh per page load (force-dynamic), apply the same pattern here rather than introducing a different TTL policy for chat: `chatServerClient().createToken(userId, Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)`.

### Pattern 4: Minimal docked chat panel (client-side)
**What:** `Chat` + `Channel` + `Window` + `MessageList` + `MessageInput`, no `ChannelList`, no `Thread`.
**Example:**
```tsx
// Source: Context7 /getstream/stream-chat-react — AI.md "Initialize Minimal Chat Client" + "Implement Full Chat UI" (trimmed to single-channel subset)
'use client'
import { useMemo } from 'react'
import {
  Chat,
  Channel,
  Window,
  MessageList,
  MessageInput,
  useCreateChatClient,
} from 'stream-chat-react'
import 'stream-chat-react/css/index.css' // NOT '.../dist/css/v2/index.css' — see pitfall below

export default function CallChatPanel({
  apiKey,
  userId,
  userName,
  token,
  callId,
}: {
  apiKey: string
  userId: string
  userName: string
  token: string
  callId: string
}) {
  const client = useCreateChatClient({
    apiKey,
    tokenOrProvider: token,
    userData: { id: userId, name: userName },
  })

  if (!client) return <div className="p-3 text-xs text-gray-400">Setting up chat…</div>

  return (
    <Chat client={client}>
      <ChannelChat client={client} callId={callId} />
    </Chat>
  )
}

// Split out so channel lookup runs after the client is ready, mirroring how
// video-call-room.tsx splits CallRoomInner out from the StreamCall provider.
function ChannelChat({ client, callId }: { client: import('stream-chat').StreamChat; callId: string }) {
  const channel = useMemo(() => client.channel('messaging', callId), [client, callId])
  return (
    <Channel channel={channel}>
      <Window>
        <MessageList />
        <MessageInput />
      </Window>
    </Channel>
  )
}
```
Note: `Channel` must be given an already-`watch()`-ed or at least server-created channel object; `useMemo(() => client.channel(...))` alone constructs the local reference — `Channel` internally calls `.watch()` on mount if not already watching, so no manual `.watch()` call is required (this matches `stream-chat-react`'s documented behavior of `Channel` auto-watching its channel prop). `[CITED: stream-chat-react AI.md example pattern — same shape used in "Implement Full Chat UI" where Channel receives no explicit channel prop and instead reads the active one from context; when passed explicitly as here, Channel still performs the watch]`.

### Anti-Patterns to Avoid
- **Rendering `ChannelList` for a single fixed channel:** pulls in filters/sort/pagination machinery for a feature that has exactly one channel per call — unnecessary complexity and bundle size for this task's scope.
- **Sharing one `StreamChat`/`StreamClient` instance across chat and video:** they are different classes from different packages; do not attempt to construct chat channels off the existing `streamClient()` (the video `StreamClient` instance) — it has no `.channel()` method.
- **Reusing `mintVideoToken`'s JWT for chat:** even though both are simple `{user_id}` JWTs signed with the same shared secret and would likely validate as a raw JWT, do not hand-roll this reuse — mint via `stream-chat`'s own `createToken` so token shape/claims stay whatever GetStream's Chat SDK internally expects going forward (avoids depending on undocumented cross-product token compatibility).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message list virtualization/pagination, typing indicators, read receipts | Custom message list component | `stream-chat-react`'s `MessageList` | Handles infinite scroll, message grouping, and WebSocket event wiring already |
| Chat client connect/disconnect lifecycle management | Manual `useEffect` + `useMemo(() => new StreamChat(...))` + manual `disconnectUser()` on unmount | `useCreateChatClient` hook | Purpose-built to replace exactly this boilerplate — handles connect, returns `null` while connecting, and disconnects on unmount automatically |

**Key insight:** This is the same "don't hand-roll" lesson the existing video integration already encodes (`useMemo(() => new StreamVideoClient(...))` + manual `call.join()`/`call.leave()` in `useEffect` cleanup) — chat has an equivalent but slightly higher-level idiom (`useCreateChatClient`) that already bakes in the cleanup, so prefer it over replicating the video pattern's manual `useEffect` teardown.

## Common Pitfalls

### Pitfall 1: Legacy CSS import path (`/v2/`) no longer resolves
**What goes wrong:** Copying the CSS import from many still-circulating examples (`import 'stream-chat-react/dist/css/v2/index.css'`) — this path does not exist in the installed 14.x tarball.
**Why it happens:** GetStream restructured CSS distribution and removed the `v2` subdirectory; older docs/blog posts/AI-generated snippets still reference it.
**How to avoid:** Use `import 'stream-chat-react/css/index.css'` (verified present at `dist/css/index.css` in the actual 14.10.0 npm tarball via direct inspection).
**Warning signs:** Build/runtime error resolving the module, or (if somehow silently swallowed by bundler config) completely unstyled message list/input.

### Pitfall 2: `StreamChat` (chat) vs `StreamClient` (video) are not interchangeable
**What goes wrong:** Assuming the existing `streamClient()` singleton in `lib/video-calls.ts` can be extended with `.channel()` — it can't; `@stream-io/node-sdk`'s `StreamClient` is video-product-only.
**Why it happens:** Same vendor, same API key/secret, easy to assume one client does both.
**How to avoid:** Instantiate a second client from `stream-chat`'s `StreamChat` class, using the same env vars but a distinct cached singleton (`lib/video-chat.ts`).
**Warning signs:** TypeScript error — no `.channel`/`.chat` property on `StreamClient`.

### Pitfall 3: Users must exist in GetStream before being referenced as channel members
**What goes wrong:** Calling `channel('messaging', callId, { members: [...] }).create()` for a user id GetStream hasn't seen yet fails, exactly like the documented video-side failure (`GetOrCreateCall failed: ... users ... don't exist`).
**Why it happens:** Same GetStream platform constraint already handled for video via `upsertVideoCallUsers`.
**How to avoid:** Call `upsertUsers` (verify: confirm whether one call covers both products, or whether Chat needs its own `chatServerClient().upsertUsers(...)` — see Assumptions Log A1) before every `getOrCreateChatChannel`/`addChatChannelMembers` call, mirroring the existing call site pattern in `createVideoCall`/`addVideoCallParticipants`.
**Warning signs:** Error message referencing unknown/nonexistent users when creating a channel or adding members.

### Pitfall 4: Race condition on simultaneous first-join
**What goes wrong:** If `getOrCreateChatChannel` is called from every participant's page load (mirroring `ensureCallParticipant`'s idempotent-on-every-visit pattern) and two participants load the room at the same instant, both may call `channel.create()` concurrently.
**Why it happens:** No client-side locking; two concurrent requests both see "channel doesn't exist yet."
**How to avoid:** `channel.create()` is documented as idempotent/safe to call multiple times for the same channel id-plus-type pair (GetStream treats it as get-or-create, same semantics as the video side's `call.getOrCreate()` which this codebase already relies on for the identical race in `ensureCallParticipant`) — no additional locking needed, just call it every time a participant enters, same as today's video flow.
**Warning signs:** Would only surface as an error if this idempotency assumption is wrong — validate manually during implementation by having two test users load a fresh call room simultaneously via the note in `MEMORY.md` re: concurrent-session QA caution (avoid disrupting the other live session — use a fresh/isolated test call id).

### Pitfall 5: Client-side cleanup on unmount
**What goes wrong:** Leaving the chat WebSocket connected after the user navigates away from the call room (leaked connection, GetStream may eventually count it against concurrent-connection limits).
**Why it happens:** Manually-constructed `StreamChat` clients require an explicit `disconnectUser()` call on unmount — easy to forget, unlike video's `call.leave()` which this codebase already remembers to call in its `useEffect` cleanup.
**How to avoid:** Use `useCreateChatClient` (not manual `useMemo(() => new StreamChat(...))`) — it registers its own unmount cleanup internally. If a manual approach is used instead, mirror the existing `video-call-room.tsx` cleanup discipline: `useEffect(() => { ... return () => { client.disconnectUser().catch(() => {}) } }, [client])`.

## Code Examples

Verified patterns from official sources — see Pattern 1-4 above under Architecture Patterns (all sourced from Context7 `/getstream/stream-chat-js` and `/getstream/stream-chat-react`, cross-checked against the actual installed-version npm tarball for CSS paths and peerDependencies).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual `new StreamChat(...)` + manual connect/disconnect in `useEffect` | `useCreateChatClient` hook | Introduced in stream-chat-react's more recent major versions (documented as the current recommended pattern in the library's own `AI.md`) | Less boilerplate, automatic cleanup on unmount, natural `null`-while-connecting loading state |
| `stream-chat-react/dist/css/v2/index.css` | `stream-chat-react/css/index.css` (or `stream-chat-react/dist/css/index.css`) | Some point in the 14.x line per the package's own `ai-docs/breaking-changes.md` | Old import path 404s / fails to resolve; must update before this ships |
| `Channel` accepting direct UI-override props (`Input`, `Message`, `MessageOptions`, `Modal`) | `WithComponents` wrapper with an `overrides` object | Noted in `ai-docs/ai-migration.md`, same 14.x line | Not needed for this task's minimal panel (no custom message rendering planned), but relevant if custom message bubbles are added later |

**Deprecated/outdated:** `initialNavOpen` prop on `Chat` component — removed; not relevant here since this task manages panel open/closed state itself (outside the `Chat` component), not via `Chat`'s own nav state.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A single `upsertUsers` call against the Video product's `StreamClient` also satisfies the Chat product's "user must exist" requirement (shared app-wide user registry within one GetStream API key), so no separate `chatServerClient().upsertUsers(...)` call is needed | Pattern 2 / Pitfall 3 | If wrong: channel creation/member-add calls will fail with an "unknown user" error identical in shape to the existing video-side error, until a Chat-specific `upsertUsers` call is added — low blast radius (caught immediately at first manual test, one-line fix: add the extra call) |
| A2 | `channel.create()` is safe to call repeatedly/concurrently for the same channel type+id (get-or-create semantics), by analogy with the video side's `call.getOrCreate()` which this codebase already depends on for the same simultaneous-first-join scenario | Pitfall 4 | If wrong: a genuine race could produce a duplicate-channel error under concurrent first joins — should be verified with a manual two-tab test during implementation before relying on it in production |

## Open Questions

1. **Does this GetStream account/API key have the Chat product enabled?**
   - What we know: Video is already active and billed (`@stream-io/node-sdk` in production use).
   - What's unclear: Whether Chat is provisioned on the same GetStream app, or needs enabling in the GetStream dashboard first.
   - Recommendation: First implementation task should be a `checkpoint:human-verify` — confirm in the GetStream dashboard that Chat is enabled for the existing `GETSTREAM_APIKEY` project before writing `lib/video-chat.ts`, since a disabled product would surface as an opaque auth/permission error rather than a clear "not enabled" message.

## Environment Availability

Skipped — this task is a code/config change against an already-configured GetStream account (`GETSTREAM_APIKEY`/`GETSTREAM_SECRET` already present and working for video); no new external service account is being introduced, only a new SDK against the existing account. See Open Question 1 for the one dashboard-level check still needed.

## Sources

### Primary (HIGH confidence)
- Context7 `/getstream/stream-chat-js` — server-side `StreamChat` initialization, `channel.create()`, `addMembers`, `createToken` (README.md, client.ts, channel.ts source excerpts)
- Context7 `/getstream/stream-chat-react` — `AI.md` minimal/full chat UI examples, `useCreateChatClient`, `ai-docs/breaking-changes.md` (CSS path removal, `ChatProps` changes), `ai-docs/ai-migration.md` (`WithComponents` migration)
- `npm view stream-chat-react peerDependencies` — confirmed React 17/18/19 support and `stream-chat@^9.50.2` peer pin
- Direct tarball inspection (`npm pack stream-chat-react@14.10.0` + `tar -tzf`) — confirmed actual CSS file layout (`dist/css/index.css`, no `v2/` subfolder) and `exports` map in `package.json`

### Secondary (MEDIUM confidence)
- Cross-product user registry assumption (A1) — reasoned from GetStream's app-wide API key model, not directly confirmed in Context7 docs this session

### Tertiary (LOW confidence)
- None — no unverified WebSearch-only claims used in this document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and peer-dependency compatibility verified directly against the npm registry and package tarball, not just training data
- Architecture: HIGH — patterns sourced directly from GetStream's own current docs via Context7, cross-referenced against this repo's existing video integration for consistency
- Pitfalls: HIGH for CSS path (directly verified via tarball inspection) / MEDIUM for cross-product user registry and channel-create race safety (reasoned by analogy, flagged in Assumptions Log)

**Research date:** 2026-07-23
**Valid until:** ~30 days (stable SDK, but GetStream ships frequent minor/patch releases — re-check `npm view stream-chat-react version` before implementation if this research is more than a few weeks old)
