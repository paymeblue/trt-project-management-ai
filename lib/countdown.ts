// Pure countdown formatter — no React, no 'server-only', no side effects.
// Deliberately importable by both a client component (deadline-countdown.tsx)
// and vitest (node environment) without pulling in any framework.

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const MIN_MS = 60_000
const SEC_MS = 1_000

export type CountdownTier = 'normal' | 'warn' | 'urgent'

export type CountdownDisplay = {
  hasDeadline: boolean
  overdue: boolean
  text: string
  tier: CountdownTier
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// `now` is passed in (not read internally) so the caller controls ticking —
// keeps this function pure and trivially testable with a fixed clock.
export function formatCountdown(deadline: string | null, now: number): CountdownDisplay {
  if (deadline === null) {
    return { hasDeadline: false, overdue: false, text: '', tier: 'normal' }
  }

  const ms = new Date(deadline).getTime() - now
  const overdue = ms < 0
  const abs = Math.abs(ms)

  const d = Math.floor(abs / DAY_MS)
  const h = Math.floor((abs % DAY_MS) / HOUR_MS)
  const m = Math.floor((abs % HOUR_MS) / MIN_MS)
  const s = Math.floor((abs % MIN_MS) / SEC_MS)

  const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`
  const base = d > 0 ? `${d}d ${clock}` : clock
  const text = overdue ? `Overdue ${base}` : base

  // Tier is driven by remaining time, not by the absolute deadline value.
  const tier: CountdownTier = overdue ? 'urgent' : abs < 6 * HOUR_MS ? 'urgent' : abs < 24 * HOUR_MS ? 'warn' : 'normal'

  return { hasDeadline: true, overdue, text, tier }
}
