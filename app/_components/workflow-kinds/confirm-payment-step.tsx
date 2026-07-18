'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { confirmClientPaidAction } from '@/actions/projects'
import { getTabToken } from '@/lib/use-tab-token'

// Delay (ms) the success confirmation stays visible before redirecting —
// mirrors yes-no-upload-step.tsx's REDIRECT_DELAY_MS.
const REDIRECT_DELAY_MS = 1400

// Phase 2/2 of the "Invoicing" step's 2-part wizard (quick task 260714-qe4):
// a single-button confirmation that the client has paid — marks
// projects.paymentStatus='paid' and completes the step (server side, see
// confirmClientPaidAction). Deliberately minimal, no form fields, mirroring
// the correctness-over-polish precedent set by yes-no-upload-step.tsx.
export default function ConfirmPaymentStep({
  projectId,
  stepDefId,
  redirectTo,
}: {
  projectId: string
  stepDefId: string
  redirectTo?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [])

  function submit() {
    setMessage(null)
    startTransition(async () => {
      const res = await confirmClientPaidAction(getTabToken(), { projectId, stepDefId })
      if (res.ok) {
        setMessage(`✓ Payment confirmed. Project marked paid.${redirectTo ? ' Redirecting…' : ''}`)
        setOk(true)
        if (redirectTo) {
          redirectTimer.current = setTimeout(() => router.push(redirectTo), REDIRECT_DELAY_MS)
        } else {
          router.refresh()
        }
      } else {
        setMessage(res.message ?? 'Could not confirm payment.')
        setOk(false)
      }
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-600">Confirm the client has paid in full for this invoice.</p>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Working…' : 'The client has paid'}
      </button>
      {message && <p className={`text-sm ${ok ? 'text-green-600' : 'text-error'}`}>{message}</p>}
    </div>
  )
}
