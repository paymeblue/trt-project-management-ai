// Quick task 260728-vce: the single pure predicate that decides whether a
// video call is "stale" enough to auto-end. Deliberately dependency-free —
// no `server-only`, no db import, no env access, and no `new Date()` inside
// it. `now` is always supplied by the caller so it can be Postgres' own
// clock (this repo has a documented incident, quick task 260706-bpg, where a
// JS-side `new Date()` compared against a naive — no-timezone —
// `timestamp` column landed skewed by the app server's own UTC offset and
// silently broke a freshness window). Being pure and dependency-free is also
// what lets both the CRON_SECRET-protected sweep route (lib/video-calls.ts's
// sweepStaleCalls) and the one-off tsx cleanup script
// (scripts/end-stale-calls.ts) import the IDENTICAL predicate, so the two
// can never drift on what "stale" means.

// 15 minutes after the last person leaves is far longer than any
// reconnect/refresh gap: the room page re-stamps `joinedAt` on every render
// (ensureCallParticipant), so a refresh or a brief network drop restores
// presence long before this window elapses.
export const EMPTY_GRACE_MINUTES = 15;

// 60 minutes covers "someone created a call and nobody ever opened the
// room" — long enough that it can't be a person who is simply running late
// to a call that started immediately, short enough that a genuinely
// abandoned call doesn't sit ACTIVE all day.
export const NEVER_JOINED_MINUTES = 60;

// 12 hours exists ONLY to guarantee no row can be immortal if presence
// tracking itself has a bug (e.g. a client that never fires its leave
// beacon and the scheduled sweep's presence query itself is somehow wrong).
// It is a backstop ceiling, not a normal path — rules 1 and 2 below always
// win over it.
export const MAX_AGE_HOURS = 12;

export type SweepCandidate = {
  callId: string;
  createdAt: Date;
  scheduledFor: Date | null;
  presentCount: number;
  everJoined: boolean;
  lastLeftAt: Date | null;
};

export type SweepReason =
  | 'scheduled-in-future'
  | 'participants-present'
  | 'within-grace'
  | 'empty-since-last-leave'
  | 'never-joined'
  | 'absolute-age-ceiling';

export type SweepDecision = { sweep: boolean; reason: SweepReason };

function minutesBetween(now: Date, then: Date): number {
  return (now.getTime() - then.getTime()) / (60 * 1000);
}

function hoursBetween(now: Date, then: Date): number {
  return (now.getTime() - then.getTime()) / (60 * 60 * 1000);
}

/**
 * Rules are evaluated IN THIS ORDER — the two refusals (1: still-scheduled,
 * 2: someone present) come first specifically so they can NEVER be
 * overridden by an age rule, no matter how old the call is.
 */
export function evaluateCallForSweep(
  c: SweepCandidate,
  now: Date,
): SweepDecision {
  // Rule 1: a call scheduled to start in the future is never swept, however
  // old its `createdAt` row is.
  if (c.scheduledFor && c.scheduledFor.getTime() > now.getTime()) {
    return { sweep: false, reason: 'scheduled-in-future' };
  }

  // Rule 2: anyone currently present means this call is genuinely in use —
  // never sweep it, however old it is.
  if (c.presentCount > 0) {
    return { sweep: false, reason: 'participants-present' };
  }

  // A scheduled call is measured from when it was supposed to START, not
  // from when it was created (possibly days earlier).
  const effectiveStart = c.scheduledFor ?? c.createdAt;

  // Rule 3: everyone who ever joined has since left, and it's been at least
  // EMPTY_GRACE_MINUTES since the last one left.
  if (
    c.everJoined &&
    c.lastLeftAt &&
    minutesBetween(now, c.lastLeftAt) >= EMPTY_GRACE_MINUTES
  ) {
    return { sweep: true, reason: 'empty-since-last-leave' };
  }

  // Rule 4: nobody ever joined and it's been at least NEVER_JOINED_MINUTES
  // since the call was supposed to start (or was created, if unscheduled).
  if (!c.everJoined && minutesBetween(now, effectiveStart) >= NEVER_JOINED_MINUTES) {
    return { sweep: true, reason: 'never-joined' };
  }

  // Rule 5: absolute ceiling — a defensive-only backstop for the case where
  // presence tracking has a bug (e.g. everJoined true but lastLeftAt somehow
  // never got stamped).
  if (hoursBetween(now, effectiveStart) >= MAX_AGE_HOURS) {
    return { sweep: true, reason: 'absolute-age-ceiling' };
  }

  return { sweep: false, reason: 'within-grace' };
}
