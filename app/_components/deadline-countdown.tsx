'use client'

import { useEffect, useState } from 'react'
import { formatCountdown, type CountdownTier } from '@/lib/countdown'

// Shared, ticking, pulsing deadline countdown — used on both pending-work
// surfaces (the forcing "Action required" modal and the header project
// pill). Mirrors project-steps-board.tsx's private `Countdown` component's
// hydration + ticking approach exactly: useState(() => Date.now()) + a 1s
// setInterval in useEffect (cleaned up on unmount) + suppressHydrationWarning
// on the rendered element, so the ticking value never produces a
// server/client mismatch warning.
const TIER_CLASSES: Record<CountdownTier, string> = {
  normal: 'text-gray-600',
  warn: 'text-amber-700 font-semibold',
  urgent: 'text-red-600 font-bold',
}

export default function DeadlineCountdown({
  deadline,
  compact = false,
  className = '',
}: {
  deadline: string | null
  compact?: boolean
  className?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const { hasDeadline, text, tier } = formatCountdown(deadline, now)

  if (!hasDeadline) {
    return (
      <span className={`text-gray-500 ${compact ? 'text-xs' : ''} ${className}`}>No deadline</span>
    )
  }

  return (
    <span
      suppressHydrationWarning
      className={`animate-pulse font-mono tabular-nums ${compact ? 'text-xs' : ''} ${TIER_CLASSES[tier]} ${className}`}
    >
      {text}
    </span>
  )
}
