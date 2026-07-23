# Quick Task 260723-fgt: Video call improvements bundle - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Task Boundary

Bundle of fixes/features on the existing GetStream-backed video-call feature (`lib/video-calls.ts`, `actions/video-calls.ts`, `app/_components/{video-call-room,add-call-participants,new-call-form}.tsx`, `app/(app)/calls/**`):

1. Participant removal ("no way to deselect") — no remove control/action exists today.
2. Superadmin end-call-for-all — server already permits it, client UI doesn't expose it to admins.
3. Display-layer name title-casing across the video-call UI.
4. In-call chat panel, Zoom/Meet-style.
5. A video-call usage analytics page (hours used, call counts, etc.).

</domain>

<decisions>
## Implementation Decisions

### In-call chat vendor/approach
- User chose: **GetStream Chat SDK** (`stream-chat` + `stream-chat-react`), added as a new dependency, same vendor as the existing `@stream-io/node-sdk` / `@stream-io/video-react-sdk`.
- Explicitly NOT the app's existing `conversations`/`messages` tables (that's a separate Slack-like app-chat feature — do not touch it).
- One chat channel per video call, id-mapped to the call id (mirrors how the call id already doubles as the GetStream video-call id).
- Server-side channel/token minting should reuse the existing `streamClient()`/`requiredEnv()` credential pattern in `lib/video-calls.ts` — no separate credential handling.
- Client-side: toggleable side panel in `video-call-room.tsx`, docked beside the video grid (like Zoom/Meet), reachable only from within that call's room.
- Scoped to the call — ending the call does not require deleting the channel/messages.
- **Research required before implementing**: current `stream-chat` / `stream-chat-react` API surface (server-side channel creation/token, client-side message list/input components) must be verified against current docs, not assumed from training data.

### Video call analytics page location
- User chose: **new dedicated page** at `/admin/call-analytics` (not appended to the existing `/admin/analytics` Delivery Analytics page).
- Metrics derived from existing `video_calls`/`video_call_participants` columns only — no new DB columns. Minimum: total calls, total hours used (ended calls: `endedAt - createdAt`; still-active calls: `now() - createdAt`), average call duration, count of currently-active calls.
- Duration is intentionally an approximation from our own timestamps, not GetStream's own call-duration API (matches how `video_calls` is already treated as this app's own source of truth).
- Link to the new page from the admin dashboard and/or `/calls` page, admin-only.

### "Head of Operations" missing from call picker
- Confirmed NOT a code bug: the `positions` table has a `head_of_operations` slug/label defined, but no user row currently has that position — the "Operations" user's position is `operations_manager_admin` instead. The call picker query has no role/position filter and already lists every other user.
- User decision: **leave it** — no code change. Not in scope for this quick task.

### Participant removal permissions
- Same permission model as `endVideoCallAction`: call creator OR `isAdminRole` (from `lib/workflow.ts`, covers `super_admin` + `operations`).
- Never allow removing the call creator via this control.
- Removing yourself is out of scope here — leaving a call already has its own in-room control.

### Superadmin end-call-for-all
- Server-side already permits it (`endVideoCallAction`'s existing `isAdminRole` check) — this is a client-only fix: show the "End for everyone" button when `isCreator || isAdmin`, with `isAdmin` computed server-side in `app/(app)/calls/[id]/page.tsx` via `isAdminRole(role)` and passed down as a prop.

### Name title-casing
- Display-layer only — do not modify DB values.
- Add one shared title-case helper (follow existing `lib/` conventions) and apply it everywhere a user name is rendered or sent to GetStream within the video-call feature: `/calls` list, `new-call-form`/`add-call-participants` pickers, call-room header/participant list, and the `name` field passed to GetStream's `upsertUsers` in `lib/video-calls.ts` (so GetStream's own video-tile labels are correct too).

### Claude's Discretion
- Exact file/module split for the new chat logic (e.g. a new `lib/video-chat.ts` vs. extending `lib/video-calls.ts`) — planner's call, guided by keeping `lib/video-calls.ts` from growing unbounded.
- Exact analytics page layout/stat-card set beyond the stated minimum.
- Whether the remove-participant pill's ✕ affordance is icon-only or icon+tooltip — follow this codebase's existing pill/button conventions.

</decisions>

<specifics>
## Specific Ideas

No specific mockups beyond "docked chat panel like Zoom/Meet's" and "stat cards like the existing `/admin/analytics` `StatCard` pattern" (see `app/(app)/admin/analytics/page.tsx` for the existing `StatCard` component to mirror stylistically).

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above. `lib/video-calls.ts` and `actions/video-calls.ts` are the canonical existing implementation to extend, not replace.

</canonical_refs>
