'use client'

import { useState, useTransition } from 'react'
import { sendApprovalAction, receiveApprovalAction, completeStepAction } from '@/actions/workflow-graph'

// Minimal renderer for the `approval` fulfillment kind (WF-03): a two-party
// send/receive control. Correctness over polish — proves the kind renders
// and gates through the plan 03 actions (self-approval rejection, etc.).
export default function ApprovalStep({
  projectId,
  stepDefId,
}: {
  projectId: string
  stepDefId: string
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function send() {
    setMessage(null)
    startTransition(async () => {
      const res = await sendApprovalAction({ projectId, stepDefId })
      setMessage(res.message ?? (res.ok ? 'Sent for approval.' : 'Could not send.'))
    })
  }

  function receive() {
    setMessage(null)
    startTransition(async () => {
      const res = await receiveApprovalAction({ projectId, stepDefId })
      setMessage(res.message ?? (res.ok ? 'Approval received.' : 'Could not receive.'))
    })
  }

  function complete() {
    setMessage(null)
    startTransition(async () => {
      const res = await completeStepAction({ projectId, stepDefId })
      setMessage(res.message ?? (res.ok ? 'Step completed.' : 'Could not complete step.'))
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

      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  )
}
