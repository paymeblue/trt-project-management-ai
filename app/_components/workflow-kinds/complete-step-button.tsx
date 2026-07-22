'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeStepAction } from '@/actions/workflow-graph'
import { getTabToken } from '@/lib/use-tab-token'

const REDIRECT_DELAY_MS = 1400

// Single page-level "Complete step" control for a multi-kind step (WF-03 /
// workflow/step/page.tsx) — each sub-form above records its OWN requirement
// only (yes_no_upload sub-form gets completeOnSubmit={false} whenever the
// step is multi-kind); this is the one button that actually attempts
// completeGraphStep, which the server rejects until every required kind
// (including 'ack'/'readiness'/'checklist' — see STATE_GATED_KINDS in
// lib/workflow-graph.ts) has its own fulfilledKinds entry.
export default function CompleteStepButton({
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

  function complete() {
    setMessage(null)
    startTransition(async () => {
      const res = await completeStepAction(getTabToken(), { projectId, stepDefId })
      setOk(res.ok)
      if (res.ok) {
        setMessage(`✓ Step completed.${redirectTo ? ' Redirecting…' : ''}`)
        if (redirectTo) setTimeout(() => router.push(redirectTo), REDIRECT_DELAY_MS)
        else router.refresh()
      } else {
        setMessage(res.message ?? 'Could not complete step.')
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={complete}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Working…' : 'Complete step'}
      </button>
      {message && <p className={`text-sm ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
    </div>
  )
}
