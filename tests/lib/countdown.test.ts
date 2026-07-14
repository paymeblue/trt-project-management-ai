import { describe, it, expect } from 'vitest'
import { formatCountdown } from '@/lib/countdown'

// Fixed base `now` — deterministic, timezone-independent (deadlines are
// derived as now +/- an offset in ms, never a literal wall-clock date).
const NOW = Date.parse('2026-07-14T12:00:00.000Z')

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000
const SEC = 1_000

describe('formatCountdown', () => {
  it('null deadline: no deadline, not overdue, empty text, normal tier', () => {
    const result = formatCountdown(null, NOW)
    expect(result).toEqual({ hasDeadline: false, overdue: false, text: '', tier: 'normal' })
  })

  it('~3d 4h 12m 5s ahead: "3d 04:12:05", not overdue, normal tier', () => {
    const deadline = new Date(NOW + 3 * DAY + 4 * HOUR + 12 * MIN + 5 * SEC).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.hasDeadline).toBe(true)
    expect(result.overdue).toBe(false)
    expect(result.text).toBe('3d 04:12:05')
    expect(result.tier).toBe('normal')
  })

  it('~30h ahead: normal tier', () => {
    const deadline = new Date(NOW + 30 * HOUR).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.tier).toBe('normal')
  })

  it('~12h ahead: warn tier, no "d " prefix, HH:MM:SS format', () => {
    const deadline = new Date(NOW + 12 * HOUR).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.tier).toBe('warn')
    expect(result.text).not.toContain('d ')
    expect(result.text).toBe('12:00:00')
  })

  it('~4h 12m 5s ahead: "04:12:05", urgent tier', () => {
    const deadline = new Date(NOW + 4 * HOUR + 12 * MIN + 5 * SEC).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.text).toBe('04:12:05')
    expect(result.tier).toBe('urgent')
  })

  it('~1d 2h 31m 7s past due: "Overdue 1d 02:31:07", overdue true, urgent tier', () => {
    const deadline = new Date(NOW - (1 * DAY + 2 * HOUR + 31 * MIN + 7 * SEC)).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.overdue).toBe(true)
    expect(result.text).toBe('Overdue 1d 02:31:07')
    expect(result.tier).toBe('urgent')
  })

  it('single-digit parts pad: ~1h 2m 3s ahead -> "01:02:03"', () => {
    const deadline = new Date(NOW + 1 * HOUR + 2 * MIN + 3 * SEC).toISOString()
    const result = formatCountdown(deadline, NOW)
    expect(result.text).toBe('01:02:03')
  })
})
