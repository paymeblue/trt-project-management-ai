import { describe, it, expect } from 'vitest';
import {
  evaluateCallForSweep,
  EMPTY_GRACE_MINUTES,
  NEVER_JOINED_MINUTES,
  MAX_AGE_HOURS,
  type SweepCandidate,
} from '@/lib/call-sweep';

// Fixed `now` so every test is clock-independent — every candidate date
// below is built relative to this constant, never to the real wall clock.
const NOW = new Date('2026-07-28T12:00:00.000Z');

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60 * 1000);
}
function minutesFromNow(n: number): Date {
  return new Date(NOW.getTime() + n * 60 * 1000);
}
function hoursAgo(n: number): Date {
  return minutesAgo(n * 60);
}
function daysAgo(n: number): Date {
  return hoursAgo(n * 24);
}

function candidate(overrides: Partial<SweepCandidate>): SweepCandidate {
  return {
    callId: 'call-1',
    createdAt: daysAgo(5),
    scheduledFor: null,
    presentCount: 0,
    everJoined: false,
    lastLeftAt: null,
    ...overrides,
  };
}

describe('evaluateCallForSweep', () => {
  it('future scheduledFor + created 5 days ago + nobody joined -> false/scheduled-in-future (rule 1 beats rules 4 and 5)', () => {
    const c = candidate({
      createdAt: daysAgo(5),
      scheduledFor: minutesFromNow(30),
      everJoined: false,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: false,
      reason: 'scheduled-in-future',
    });
  });

  it('future scheduledFor + 30 days old -> false (absolute ceiling must NOT override rule 1)', () => {
    const c = candidate({
      createdAt: daysAgo(30),
      scheduledFor: minutesFromNow(30),
      everJoined: false,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: false,
      reason: 'scheduled-in-future',
    });
  });

  it('presentCount 3 + created 5 days ago -> false/participants-present', () => {
    const c = candidate({ createdAt: daysAgo(5), presentCount: 3, everJoined: true });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: false,
      reason: 'participants-present',
    });
  });

  it('presentCount 1 + 30 days old -> false (absolute ceiling must NOT override rule 2)', () => {
    const c = candidate({ createdAt: daysAgo(30), presentCount: 1, everJoined: true });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: false,
      reason: 'participants-present',
    });
  });

  it('everJoined, presentCount 0, lastLeftAt 14 min ago -> false/within-grace', () => {
    const c = candidate({
      createdAt: hoursAgo(1),
      everJoined: true,
      presentCount: 0,
      lastLeftAt: minutesAgo(14),
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: false, reason: 'within-grace' });
  });

  it('everJoined, presentCount 0, lastLeftAt exactly EMPTY_GRACE_MINUTES ago -> true/empty-since-last-leave (boundary inclusive)', () => {
    const c = candidate({
      createdAt: hoursAgo(1),
      everJoined: true,
      presentCount: 0,
      lastLeftAt: minutesAgo(EMPTY_GRACE_MINUTES),
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: true,
      reason: 'empty-since-last-leave',
    });
  });

  it('everJoined, presentCount 0, lastLeftAt 2h ago -> true/empty-since-last-leave', () => {
    const c = candidate({
      createdAt: hoursAgo(5),
      everJoined: true,
      presentCount: 0,
      lastLeftAt: hoursAgo(2),
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: true,
      reason: 'empty-since-last-leave',
    });
  });

  it('never joined, created 59 min ago -> false/within-grace', () => {
    const c = candidate({ createdAt: minutesAgo(59), everJoined: false });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: false, reason: 'within-grace' });
  });

  it('never joined, created exactly NEVER_JOINED_MINUTES ago -> true/never-joined', () => {
    const c = candidate({ createdAt: minutesAgo(NEVER_JOINED_MINUTES), everJoined: false });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: true, reason: 'never-joined' });
  });

  it('never joined, scheduledFor 10 min in the past, created 5 days ago -> false/within-grace (effectiveStart is scheduledFor, not createdAt)', () => {
    const c = candidate({
      createdAt: daysAgo(5),
      scheduledFor: minutesAgo(10),
      everJoined: false,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: false, reason: 'within-grace' });
  });

  it('never joined, scheduledFor 3h in the past -> true/never-joined', () => {
    const c = candidate({
      createdAt: daysAgo(5),
      scheduledFor: hoursAgo(3),
      everJoined: false,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: true, reason: 'never-joined' });
  });

  it('everJoined, presentCount 0, lastLeftAt null (impossible-by-construction defensive case), created 13h ago -> true/absolute-age-ceiling', () => {
    const c = candidate({
      createdAt: hoursAgo(13),
      everJoined: true,
      presentCount: 0,
      lastLeftAt: null,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({
      sweep: true,
      reason: 'absolute-age-ceiling',
    });
  });

  it('everJoined, presentCount 0, lastLeftAt null, created 1h ago -> false/within-grace (defensive case must NOT sweep early)', () => {
    const c = candidate({
      createdAt: hoursAgo(1),
      everJoined: true,
      presentCount: 0,
      lastLeftAt: null,
    });
    expect(evaluateCallForSweep(c, NOW)).toEqual({ sweep: false, reason: 'within-grace' });
  });

  it('MAX_AGE_HOURS is exported as 12', () => {
    expect(MAX_AGE_HOURS).toBe(12);
  });
});
