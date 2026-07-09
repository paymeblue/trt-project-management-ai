'use client'

import { useState, useTransition } from 'react'
import { assignUserAction, completeStepAction } from '@/actions/workflow-graph'
import type { WorkflowRole } from '@/lib/workflow'

// Minimal renderer for the `assignment` fulfillment kind (WF-03): a picker
// of users filtered (server-side, in the page) to the step's targetRoles
// pool (v2.0 Phase 19: widened from a single role to a list — e.g. Head
// Designer picks from either `design` or `architect`). Correctness over
// polish — proves the kind renders and submits through the action (which
// re-checks the role-pool match server-side).
export default function AssignmentStep({
  projectId,
  stepDefId,
  targetRoles,
  candidates,
}: {
  projectId: string
  stepDefId: string
  targetRoles: WorkflowRole[] | null | undefined
  candidates: { id: string; name: string; role: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>(candidates[0]?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)

  function assign() {
    if (!selected) {
      setMessage('Choose a user first.')
      return
    }
    setMessage(null)
    startTransition(async () => {
      const res = await assignUserAction({ projectId, stepDefId, assignedUserId: selected })
      setMessage(res.message ?? (res.ok ? 'Assigned.' : 'Could not assign.'))
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
      <div>
        <p className="mb-1 text-xs font-medium text-gray-600">
          Assign a user{targetRoles?.length ? ` (${targetRoles.join(' or ')})` : ''}
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-500">No users with the required role were found.</p>
        ) : (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || candidates.length === 0}
          onClick={assign}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Assign'}
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
