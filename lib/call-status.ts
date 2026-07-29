// Quick task 260729-cr1 — pure call-status derivation.
//
// Every string the new call-room UI renders (duration, presence chips,
// reconnect overlays, remote-end notice) is derived HERE rather than inline
// in JSX. Per this repo's convention, `video-call-room.tsx` stays untested
// (it renders inside <StreamCall>, needs a live SDK/WebRTC context), while
// every user-visible string it shows is fully covered by
// tests/lib/call-status.test.ts. Keep this module pure and dependency-free,
// in the same spirit as lib/call-sweep.ts: no `server-only`, no db, no env,
// no `@stream-io/*` import, and no `Date.now()` inside any function — the
// caller always supplies `nowMs` so a ticking component owns the clock and
// the tests own time completely.

export type CallStateKind = 'joining' | 'live' | 'reconnecting' | 'failed' | 'left'

export type CallStateDescriptor = {
  kind: CallStateKind
  /** true => keep <SpeakerLayout>/<CallControls> mounted and show `overlay` on top.
      false => replace the stage with a terminal panel showing `overlay`. */
  keepStageMounted: boolean
  /** Null only for the steady 'live' state. */
  overlay: string | null
}

// Typed as a plain `string`, NOT the SDK's `CallingState` enum. This keeps
// the module SDK-free and testable without a browser/WebRTC environment —
// the enum's runtime values ARE these strings (see CallingState.d.ts), so
// passing `CallingState.JOINED` type-checks and behaves identically to
// passing the literal 'joined'.
//
// Implemented as a lookup object with an explicit fallback for unmapped
// strings, rather than a switch with a throwing default: an unrecognised
// future SDK state must degrade to the 'joining' treatment (stage not yet
// shown, generic "Joining…" style overlay), never blank the room.
const JOINING_DESCRIPTOR: CallStateDescriptor = {
  kind: 'joining',
  keepStageMounted: false,
  overlay: 'Joining call…',
}

const CALLING_STATE_DESCRIPTORS: Record<string, CallStateDescriptor> = {
  unknown: JOINING_DESCRIPTOR,
  idle: JOINING_DESCRIPTOR,
  ringing: JOINING_DESCRIPTOR,
  joining: JOINING_DESCRIPTOR,
  joined: { kind: 'live', keepStageMounted: true, overlay: null },
  // The three transient states below are the ONLY states besides 'joined'
  // with keepStageMounted true. A regression that flips any of these to
  // false would unmount live video on a mere network blip, turning a
  // 2-second reconnect into a full rejoin — see video-call-room.tsx's
  // "EXIT PATH AUDIT" comment and the objective's SpeakerLayout root-cause
  // note for why that unmount is expensive.
  reconnecting: { kind: 'reconnecting', keepStageMounted: true, overlay: 'Reconnecting…' },
  migrating: { kind: 'reconnecting', keepStageMounted: true, overlay: 'Reconnecting…' },
  offline: { kind: 'reconnecting', keepStageMounted: true, overlay: 'You appear to be offline. Reconnecting…' },
  'reconnecting-failed': {
    kind: 'failed',
    keepStageMounted: false,
    overlay: 'Could not reconnect to this call. Check your connection and rejoin.',
  },
  left: { kind: 'left', keepStageMounted: false, overlay: 'You have left this call.' },
}

export function describeCallingState(state: string): CallStateDescriptor {
  return CALLING_STATE_DESCRIPTORS[state] ?? JOINING_DESCRIPTOR
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

// Clamp negative/non-finite elapsed values at the boundary rather than
// trusting callers. `startedAtMs` comes from the Stream server's session
// record (useCallStartedAt()) while `nowMs` comes from the browser's own
// clock — a browser clock a few seconds behind the server WILL produce a
// negative elapsed value in the real world (this is not a
// defensive-for-nothing branch), and must render as '00:00', never a
// negative or 'NaN' string.
export function formatCallDuration(startedAtMs: number | null | undefined, nowMs: number): string | null {
  if (startedAtMs === null || startedAtMs === undefined || !Number.isFinite(startedAtMs)) return null
  if (!Number.isFinite(nowMs)) return null

  const elapsedMs = nowMs - startedAtMs
  const elapsedSeconds = elapsedMs <= 0 ? 0 : Math.floor(elapsedMs / 1000)

  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) {
    // Hours are unpadded, minutes/seconds padded — matches every common
    // call-timer convention (e.g. '1:00:00', not '01:00:00').
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  }
  return `${pad2(minutes)}:${pad2(seconds)}`
}

export type CallPresence = {
  joinedLabel: string
  invitedLabel: string
  isAlone: boolean
  /** Null once at least one other person is in the call. */
  waitingMessage: string | null
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.trunc(n))
}

// invitedCount is the invite list length INCLUDING self; joinedCount is the
// number of participants actually in the call INCLUDING self.
export function deriveCallPresence(input: { invitedCount: number; joinedCount: number }): CallPresence {
  const invitedCount = clampCount(input.invitedCount)
  const joinedCount = clampCount(input.joinedCount)

  const joinedLabel = `${joinedCount} in call`
  const invitedLabel = `${invitedCount} ${invitedCount === 1 ? 'invited' : 'invited'}`
  // Both singular and plural read as "N invited" — only the "other person(s)"
  // waiting message needs true singular/plural grammar (see below).

  const isAlone = joinedCount <= 1

  let waitingMessage: string | null = null
  if (isAlone) {
    // invitedCount includes self, so the number of OTHER invited people is
    // invitedCount - 1 (clamped at 0 — never a negative "-1 others").
    const othersInvited = Math.max(0, invitedCount - 1)
    if (othersInvited === 0) {
      // Nobody else was invited, but a link-share join is still possible.
      waitingMessage = 'Waiting for others to join…'
    } else if (othersInvited === 1) {
      waitingMessage = 'Waiting for 1 other person to join…'
    } else {
      waitingMessage = `Waiting for ${othersInvited} others to join…`
    }
  }

  return { joinedLabel, invitedLabel, isAlone, waitingMessage }
}

export function describeCallEnd(input: { endedByName: string | null; endedByYou: boolean }): {
  title: string
  detail: string
} {
  const title = 'Call ended'

  if (input.endedByYou) {
    // endedByYou wins over any name — even if endedByName happens to be
    // populated, the local user already knows they were the one who ended it.
    return { title, detail: 'You ended this call for everyone.' }
  }

  // Whitespace-only name treated as null (no dangling ' ended this call').
  const name = input.endedByName?.trim() ? input.endedByName.trim() : null

  if (!name) {
    return { title, detail: 'This call was ended for everyone.' }
  }

  return { title, detail: `${name} ended this call for everyone.` }
}
