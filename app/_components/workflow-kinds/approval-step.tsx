'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendApprovalAction, receiveApprovalAction, completeStepAction } from '@/actions/workflow-graph'

// Delay (ms) the success confirmation stays visible before redirecting, so
// the user has time to read it before the page navigates. Matches
// assignment-step.tsx's mechanism.
const REDIRECT_DELAY_MS = 1400

// Minimal renderer for the `approval` fulfillment kind (WF-03): a two-party
// send/receive control. Correctness over polish — proves the kind renders
// and gates through the plan 03 actions (self-approval rejection, etc.).
export default function ApprovalStep({
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

  function scheduleRedirect() {
    if (!redirectTo) return
    redirectTimer.current = setTimeout(() => {
      router.push(redirectTo)
    }, REDIRECT_DELAY_MS)
  }

  function send() {
    setMessage(null)
    startTransition(async () => {
      const res = await sendApprovalAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(res.message ?? '✓ Sent for approval.')
        setOk(true)
      } else {
        setMessage(res.message ?? 'Could not send.')
        setOk(false)
      }
    })
  }

  function receive() {
    setMessage(null)
    startTransition(async () => {
      const res = await receiveApprovalAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(res.message ?? '✓ Approval received.')
        setOk(true)
      } else {
        setMessage(res.message ?? 'Could not receive.')
        setOk(false)
      }
    })
  }

  function complete() {
    setMessage(null)
    startTransition(async () => {
      const res = await completeStepAction({ projectId, stepDefId })
      if (res.ok) {
        setMessage(`✓ Step completed.${redirectTo ? ' Redirecting…' : ''}`)
        setOk(true)
        scheduleRedirect()
      } else {
        setMessage(res.message ?? 'Could not complete step.')
        setOk(false)
      }
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={send}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Send for approval'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={receive}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Receive / approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={complete}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Complete step
        </button>
      </div>

      {message && <p className={`text-sm ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
    </div>
  )
}
