import { describe, it, expect } from 'vitest'
import {
  formatCallDuration,
  describeCallingState,
  deriveCallPresence,
  describeCallEnd,
  type CallStateKind,
} from '@/lib/call-status'

describe('formatCallDuration', () => {
  it('null startedAt -> null', () => {
    expect(formatCallDuration(null, 1000)).toBeNull()
  })

  it('undefined startedAt -> null', () => {
    expect(formatCallDuration(undefined, 1000)).toBeNull()
  })

  it('NaN startedAt -> null', () => {
    expect(formatCallDuration(NaN, 1000)).toBeNull()
  })

  it('nowMs === startedAtMs -> 00:00', () => {
    expect(formatCallDuration(1000, 1000)).toBe('00:00')
  })

  it('nowMs < startedAtMs (clock skew) -> 00:00, never negative or NaN', () => {
    expect(formatCallDuration(10_000, 5_000)).toBe('00:00')
  })

  it('42s elapsed -> 00:42', () => {
    expect(formatCallDuration(0, 42_000)).toBe('00:42')
  })

  it('65s elapsed -> 01:05', () => {
    expect(formatCallDuration(0, 65_000)).toBe('01:05')
  })

  it('599s elapsed -> 09:59', () => {
    expect(formatCallDuration(0, 599_000)).toBe('09:59')
  })

  it('3599s elapsed -> 59:59', () => {
    expect(formatCallDuration(0, 3_599_000)).toBe('59:59')
  })

  it('3600s elapsed -> 1:00:00 (hours unpadded, minutes/seconds padded)', () => {
    expect(formatCallDuration(0, 3_600_000)).toBe('1:00:00')
  })

  it('3661s elapsed -> 1:01:01', () => {
    expect(formatCallDuration(0, 3_661_000)).toBe('1:01:01')
  })

  it('36000s elapsed -> 10:00:00', () => {
    expect(formatCallDuration(0, 36_000_000)).toBe('10:00:00')
  })
})

describe('describeCallingState', () => {
  const cases: [string, CallStateKind, boolean][] = [
    ['joined', 'live', true],
    ['reconnecting', 'reconnecting', true],
    ['migrating', 'reconnecting', true],
    ['offline', 'reconnecting', true],
    ['reconnecting-failed', 'failed', false],
    ['left', 'left', false],
    ['joining', 'joining', false],
    ['idle', 'joining', false],
    ['ringing', 'joining', false],
    ['unknown', 'joining', false],
  ]

  it.each(cases)('%s -> kind=%s keepStageMounted=%s', (state, kind, keepStageMounted) => {
    const descriptor = describeCallingState(state)
    expect(descriptor.kind).toBe(kind)
    expect(descriptor.keepStageMounted).toBe(keepStageMounted)
  })

  it('reconnecting overlay mentions "Reconnecting"', () => {
    expect(describeCallingState('reconnecting').overlay).toContain('Reconnecting')
  })

  it('migrating overlay mentions "Reconnecting"', () => {
    expect(describeCallingState('migrating').overlay).toContain('Reconnecting')
  })

  it('offline overlay mentions offline', () => {
    expect(describeCallingState('offline').overlay?.toLowerCase()).toContain('offline')
  })

  it('reconnecting-failed overlay is non-null', () => {
    expect(describeCallingState('reconnecting-failed').overlay).not.toBeNull()
  })

  it('left overlay is non-null', () => {
    expect(describeCallingState('left').overlay).not.toBeNull()
  })

  it('joining overlay mentions "Joining"', () => {
    expect(describeCallingState('joining').overlay).toContain('Joining')
  })

  it('joined overlay is null (the only steady state)', () => {
    expect(describeCallingState('joined').overlay).toBeNull()
  })

  it('an unrecognised future SDK state string fails soft to the joining descriptor', () => {
    const descriptor = describeCallingState('some-future-state')
    expect(descriptor).toEqual(describeCallingState('joining'))
  })

  it('exactly joined + reconnecting + migrating + offline have keepStageMounted true — no other state does', () => {
    const allStates = [
      'unknown',
      'idle',
      'ringing',
      'joining',
      'joined',
      'left',
      'reconnecting',
      'migrating',
      'reconnecting-failed',
      'offline',
    ]
    const keptMounted = allStates.filter((s) => describeCallingState(s).keepStageMounted)
    expect(keptMounted.sort()).toEqual(['joined', 'migrating', 'offline', 'reconnecting'].sort())
  })
})

describe('deriveCallPresence', () => {
  it('{ invited: 3, joined: 2 } -> joinedLabel "2 in call", invitedLabel "3 invited", isAlone false, waitingMessage null', () => {
    const presence = deriveCallPresence({ invitedCount: 3, joinedCount: 2 })
    expect(presence.joinedLabel).toBe('2 in call')
    expect(presence.invitedLabel).toBe('3 invited')
    expect(presence.isAlone).toBe(false)
    expect(presence.waitingMessage).toBeNull()
  })

  it('{ invited: 3, joined: 1 } -> isAlone true, waitingMessage mentions 2 others', () => {
    const presence = deriveCallPresence({ invitedCount: 3, joinedCount: 1 })
    expect(presence.isAlone).toBe(true)
    expect(presence.waitingMessage).toContain('2 others')
  })

  it('{ invited: 2, joined: 1 } -> isAlone true, waitingMessage mentions 1 other person (singular grammar)', () => {
    const presence = deriveCallPresence({ invitedCount: 2, joinedCount: 1 })
    expect(presence.isAlone).toBe(true)
    expect(presence.waitingMessage).toBe('Waiting for 1 other person to join…')
  })

  it('{ invited: 1, joined: 1 } -> isAlone true, waitingMessage is the generic "Waiting for others to join…"', () => {
    const presence = deriveCallPresence({ invitedCount: 1, joinedCount: 1 })
    expect(presence.isAlone).toBe(true)
    expect(presence.waitingMessage).toBe('Waiting for others to join…')
  })

  it('{ invited: 3, joined: 0 } -> isAlone true, joinedLabel "0 in call" (pre-join render must not crash)', () => {
    const presence = deriveCallPresence({ invitedCount: 3, joinedCount: 0 })
    expect(presence.isAlone).toBe(true)
    expect(presence.joinedLabel).toBe('0 in call')
    expect(presence.joinedLabel).not.toContain('-')
  })

  it('{ invited: 0, joined: 0 } -> no negative counts anywhere in any label', () => {
    const presence = deriveCallPresence({ invitedCount: 0, joinedCount: 0 })
    expect(presence.joinedLabel).not.toContain('-')
    expect(presence.invitedLabel).not.toContain('-')
    expect(presence.waitingMessage).not.toContain('-')
  })

  it('{ invited: -5, joined: -2 } -> clamped to 0, no negative numerals in output', () => {
    const presence = deriveCallPresence({ invitedCount: -5, joinedCount: -2 })
    expect(presence.joinedLabel).toBe('0 in call')
    expect(presence.invitedLabel).toBe('0 invited')
    expect(presence.joinedLabel).not.toMatch(/-\d/)
    expect(presence.invitedLabel).not.toMatch(/-\d/)
  })

  it('singular/plural: "1 in call" / "2 in call", "1 invited" / "2 invited"', () => {
    expect(deriveCallPresence({ invitedCount: 1, joinedCount: 1 }).joinedLabel).toBe('1 in call')
    expect(deriveCallPresence({ invitedCount: 2, joinedCount: 2 }).joinedLabel).toBe('2 in call')
    expect(deriveCallPresence({ invitedCount: 1, joinedCount: 1 }).invitedLabel).toBe('1 invited')
    expect(deriveCallPresence({ invitedCount: 2, joinedCount: 2 }).invitedLabel).toBe('2 invited')
  })
})

describe('describeCallEnd', () => {
  it('{ endedByYou: true, endedByName: "Amaka" } -> detail says YOU ended it (endedByYou wins over the name)', () => {
    const result = describeCallEnd({ endedByYou: true, endedByName: 'Amaka' })
    expect(result.detail.toLowerCase()).toContain('you ended')
    expect(result.detail).not.toContain('Amaka')
    expect(result.title.length).toBeGreaterThan(0)
  })

  it('{ endedByYou: false, endedByName: "Amaka Okoye" } -> detail contains the name and states the call was ended for everyone', () => {
    const result = describeCallEnd({ endedByYou: false, endedByName: 'Amaka Okoye' })
    expect(result.detail).toContain('Amaka Okoye')
    expect(result.detail.toLowerCase()).toContain('ended')
    expect(result.detail.toLowerCase()).toContain('everyone')
    expect(result.title.length).toBeGreaterThan(0)
  })

  it('{ endedByYou: false, endedByName: null } -> detail is a name-free "This call was ended for everyone."', () => {
    const result = describeCallEnd({ endedByYou: false, endedByName: null })
    expect(result.detail).toBe('This call was ended for everyone.')
    expect(result.title.length).toBeGreaterThan(0)
  })

  it('{ endedByYou: false, endedByName: "   " } -> whitespace-only name treated as null (no dangling " ended this call")', () => {
    const result = describeCallEnd({ endedByYou: false, endedByName: '   ' })
    expect(result.detail).toBe('This call was ended for everyone.')
    expect(result.detail).not.toMatch(/^\s+ended/)
  })
})
