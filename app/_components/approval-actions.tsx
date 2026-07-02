'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decideStepBypassAction } from '@/actions/bypass'

// Approve / Deny buttons for a pending step-bypass request (super admin).
export default function ApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function decide(approve: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await decideStepBypassAction({ requestId, approve })
      if (res.ok) router.refresh()
      else setError(res.message ?? 'Could not complete that action.')
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Deny
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Approve & advance'}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
