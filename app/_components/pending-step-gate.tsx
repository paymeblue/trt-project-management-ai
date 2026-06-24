'use client'

import { useActionState, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { stepByN, stepHref, workflowRoleLabel } from '@/lib/workflow'
import { completeAckStepAction, type AckStepState } from '@/actions/workflow'

export type PendingItem = {
  projectId: string
  name: string
  stepN: number
  deadline: string | null // ISO
}

const INITIAL_ACK: AckStepState = { ok: false }

// Routes where the user is actively completing a step — the gate must NOT block
// these, or they could never finish the work that clears it.
function isStepRoute(pathname: string) {
  return pathname.startsWith('/checklists/') || pathname.startsWith('/factory-pm/readiness')
}

export default function PendingStepGate({ pending }: { pending: PendingItem[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ackState, dispatchAck, ackPending] = useActionState(completeAckStepAction, INITIAL_ACK)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (ackState.ok) router.refresh()
  }, [ackState.ok, router])

  // Most urgent pending item only — once handled, the next one surfaces.
  const item = pending[0]
  if (!item || isStepRoute(pathname)) return null

  const step = stepByN(item.stepN)
  if (!step) return null

  const href = stepHref(step, item.projectId)
  const deadlineText = item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'

  return (
    // Unclosable: no backdrop click, no Escape, no close button. It clears only
    // when the step is confirmed/completed (which removes it from `pending`).
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined animate-pulse text-2xl text-primary">
            notifications_active
          </span>
          <h2 className="text-lg font-bold text-gray-900">Action required</h2>
        </div>

        <p className="text-sm text-gray-600">
          A step is on your desk and must be completed before you continue.
        </p>

        <div className="my-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-gray-900">{item.name}</p>
          <p className="mt-1 text-sm text-primary">
            Step {step.n}: {step.label}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Your role: {workflowRoleLabel(step.role)} · Deadline: {deadlineText}
          </p>
          {pending.length > 1 && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {pending.length - 1} more {pending.length - 1 === 1 ? 'project' : 'projects'} waiting
              after this one.
            </p>
          )}
        </div>

        {step.kind === 'ack' ? (
          <div className="space-y-2">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={ackPending}
              onClick={() => dispatchAck({ projectId: item.projectId, expectedStepN: item.stepN, notes })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {ackPending ? 'Confirming…' : 'Confirm this step'}
            </button>
            {!ackState.ok && ackState.message && (
              <p className="text-xs text-error">{ackState.message}</p>
            )}
          </div>
        ) : href ? (
          <a
            href={href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Open &amp; complete this step
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </a>
        ) : null}
      </div>
    </div>
  )
}
