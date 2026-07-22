'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitAdditionalRequirementAction } from '@/actions/workflow-graph'
import { getTabToken } from '@/lib/use-tab-token'

// Renders a plain one-click confirmation for an 'ack' or 'readiness'
// requirement stacked as an ADDITIONAL kind on a step (e.g.
// confirmation_correction's yes_no_upload + ack + readiness) — the fallback
// used for 'readiness' when the step has no linked checklist slug attached
// via the Workflow Configurator (see workflow/step/page.tsx's renderKind).
const LABELS: Record<'ack' | 'readiness', { verb: string; done: string }> = {
  ack: { verb: 'Acknowledge', done: 'Acknowledged.' },
  readiness: { verb: 'Confirm readiness', done: 'Readiness confirmed.' },
}

export default function InlineRequirementStep({
  projectId,
  stepDefId,
  kind,
  alreadyDone,
}: {
  projectId: string
  stepDefId: string
  kind: 'ack' | 'readiness'
  alreadyDone: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const labels = LABELS[kind]

  if (alreadyDone) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
        <span className="material-symbols-outlined text-lg">check_circle</span>
        {labels.done}
      </div>
    )
  }

  function submit() {
    setMessage(null)
    startTransition(async () => {
      const res = await submitAdditionalRequirementAction(getTabToken(), { projectId, stepDefId, kind })
      setOk(res.ok)
      setMessage(res.message ?? null)
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Working…' : labels.verb}
      </button>
      {message && <p className={`text-sm ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
    </div>
  )
}
