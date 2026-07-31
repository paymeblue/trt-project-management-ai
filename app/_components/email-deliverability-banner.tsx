'use client'

import { useEffect, useState } from 'react'
import { shouldShowDeliverabilityBanner } from '@/lib/email-deliverability'

export const EMAIL_DELIVERABILITY_DISMISSED_KEY = 'trt.email.deliverabilityDismissed'

// PRECEDENCE (see lib/notification-autosurface.ts for the full registry):
// PendingCallGate (z-[70]) > PendingStepGate (z-[60]) > bell auto-surface >
// this banner. This component deliberately does not register itself as a
// forcing overlay via that registry's hook — it is an inline, in-flow,
// non-modal notice, not a demand for a decision, so it must not suppress the
// notifications bell's auto-surface the way the two gates do. It renders
// inside <main>, beneath the sticky header's z-30 and well beneath both
// gates, so a forcing modal always wins the screen without either component
// knowing about the other. It never auto-focuses anything.
export default function EmailDeliverabilityBanner({
  email,
  deliverable,
  reason,
}: {
  email: string
  deliverable: boolean | null
  reason: string | null
}) {
  // Dismissal must be hydrated inside an effect, never at module scope or
  // during render — sessionStorage does not exist during SSR, and touching
  // it outside an effect would desync hydration. Reuses the EXACT
  // sessionStorage pattern from notifications-bell.tsx: try/catch so private
  // mode degrades to in-memory-only rather than throwing.
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(EMAIL_DELIVERABILITY_DISMISSED_KEY) === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a value that only exists in browser storage (unavailable during SSR), not deriving new state from props/state
        setDismissed(true)
      }
    } catch {
      // sessionStorage unavailable (private mode, storage disabled, etc.) —
      // falls back to in-memory-only for this tab.
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      sessionStorage.setItem(EMAIL_DELIVERABILITY_DISMISSED_KEY, '1')
    } catch {
      // best-effort persistence only — see hydration comment above
    }
  }

  if (!shouldShowDeliverabilityBanner({ emailDeliverable: deliverable, dismissed })) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <div>
        <p className="font-semibold">Email notifications are not reaching you</p>
        <p className="mt-1">
          We could not deliver email to <span className="font-medium">{email}</span>
          {reason ? ` (${reason})` : ''}. Ask an administrator to correct your email address in
          User Management.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss email deliverability warning"
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
      >
        Dismiss
      </button>
    </div>
  )
}
