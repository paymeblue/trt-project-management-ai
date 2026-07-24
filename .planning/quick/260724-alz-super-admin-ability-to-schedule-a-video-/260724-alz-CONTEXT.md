# Quick Task 260724-alz: Super admin ability to schedule a video call - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Task Boundary

Add a "schedule for later" option to the existing video-call creation flow (`lib/video-calls.ts`, `actions/video-calls.ts`, `app/_components/new-call-form.tsx`, `app/(app)/calls/**`), restricted to admin-equivalent roles.

</domain>

<decisions>
## Implementation Decisions

### Who can schedule
- `isAdminRole(role)` — super_admin OR operations. Same permission model already used for `endVideoCallAction` and `removeVideoCallParticipantAction` elsewhere in this feature. Not "super_admin only" — user explicitly chose the broader admin-equivalent option.

### Early join / room creation timing
- The GetStream video call room AND chat channel are created immediately at schedule time, exactly like an instant call (`createVideoCall` → `call.getOrCreate()` → chat channel creation) — NOT deferred to the scheduled time.
- `scheduledFor` is purely informational/display. It never gates joinability. Anyone invited can join the room any time before or after the scheduled time — user explicitly chose "allow early join" over "block until start time."

### Scope boundaries
- Regular (non-admin) users keep the exact same "Start a call" flow they have today — no scheduling control visible to them, and the server action must reject a `scheduledFor` value from a non-admin caller even if someone tampers with the request.
- No recurring meetings — one-off scheduled time only, not in scope.
- No schema change to `notifications` — reuse the existing `type: 'video_call'` + `callId` routing, just vary the notification title text when `scheduledFor` is present.

### Claude's Discretion
- Exact UI treatment of the "Schedule for later" toggle in `new-call-form.tsx` (inline datetime-local input vs. a separate collapsible section) — follow existing form conventions in that file.
- Exact wording/formatting of the scheduled-time display and notification text.
- Whether "Scheduled" vs "Active" grouping on `/calls` is two separate `<h2>` sections or a single list with a badge — follow the existing Active/Past section pattern in `app/(app)/calls/page.tsx`.

</decisions>

<specifics>
## Specific Ideas

No mockups. Reuse existing `StatCard`-free, plain-list UI conventions already present in `app/(app)/calls/page.tsx` and `app/_components/new-call-form.tsx`.

</specifics>

<canonical_refs>
## Canonical References

No external specs. `lib/video-calls.ts`'s `createVideoCall` and `actions/video-calls.ts`'s `createVideoCallAction` are the canonical existing implementation to extend. No new third-party dependency is needed for this task (unlike the prior GetStream Chat quick task) — this is a schema + existing-pattern extension, so no dedicated research phase was run; the planner should treat `lib/video-calls.ts`/`actions/video-calls.ts` as ground truth for current shape.

</canonical_refs>
