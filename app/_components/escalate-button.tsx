'use client'

import { useState } from 'react'
import { useActionState } from 'react'
import { escalateChecklistAction, type EscalateResult } from '@/actions/escalation'
import { escalationTargetPosition } from '@/lib/escalation'
import type { UserRole } from '@/lib/workflow'

const INITIAL: EscalateResult = { ok: false, message: '' }

// Per-checklist escalation flag (items #9, #14): every checklist gets a flag
// button that notifies the escalating user's fixed superior position — a
// SIBLING to (not a replacement for) the existing pause/flag-all-super-admins
// mechanism (REQ-G08, project-steps-board.tsx's FlagControls). This never
// pauses the project; it's a lightweight single-recipient nudge.
export default function EscalateButton({
  projectId,
  checklistLabel,
  viewerRole,
}: {
  projectId: string
  checklistLabel: string
  viewerRole: UserRole
}) {
  const [state, dispatch, pending] = useActionState(
    async (_prev: EscalateResult, formData: FormData) =>
      escalateChecklistAction({
        projectId,
        checklistLabel,
        reason: String(formData.get('reason') ?? ''),
      }),
    INITIAL,
  )
  const [open, setOpen] = useState(false)

  if (!escalationTargetPosition(viewerRole)) return null

  return (
    <div className="mt-4 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:underline"
        >
          <span className="material-symbols-outlined text-sm">flag</span>
          Escalate to superior
        </button>
      ) : (
        <form action={dispatch} className="space-y-2">
          <p className="text-xs font-semibold text-amber-800">Escalate this checklist</p>
          <textarea
            name="reason"
            rows={2}
            placeholder="What needs attention? (optional)"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">flag</span>
              {pending ? 'Sending…' : 'Send escalation'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
          {state.message && (
            <p className={`text-xs ${state.ok ? 'text-green-700' : 'text-error'}`}>{state.message}</p>
          )}
        </form>
      )}
    </div>
  )
}
