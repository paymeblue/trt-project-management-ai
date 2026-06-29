'use client'

import { useActionState, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { stepByN, stepHref, workflowRoleLabel } from '@/lib/workflow'
import { completeAckStepAction, type AckStepState } from '@/actions/workflow'
import { useMyWork } from '@/app/_components/my-work-provider'

const INITIAL_ACK: AckStepState = { ok: false }

// Routes where the user is actively completing a step — the gate must NOT block
// these, or they could never finish the work that clears it.
function isStepRoute(pathname: string) {
  return pathname.startsWith('/checklists/') || pathname.startsWith('/factory-pm/readiness')
}

export default function PendingStepGate() {
  const { pending, refresh } = useMyWork()
  const pathname = usePathname()
  const [ackState, dispatchAck, ackPending] = useActionState(completeAckStepAction, INITIAL_ACK)
  const [notes, setNotes] = useState('')
  // Per-session dismissals (reset on full reload) so the modal can be closed
  // without nagging on every poll — keyed by project + step so a different
  // pending item still surfaces.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (ackState.ok) refresh()
  }, [ackState.ok, refresh])

  // Most urgent pending item the user hasn't dismissed this session.
  const keyOf = (projectId: string, stepN: number) => `${projectId}:${stepN}`
  const item =
    isStepRoute(pathname)
      ? undefined
      : pending.find((p) => !dismissed.has(keyOf(p.projectId, p.stepN)))

  function close() {
    if (item) setDismissed((prev) => new Set(prev).add(keyOf(item.projectId, item.stepN)))
  }

  useEffect(() => {
    if (!item) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  if (!item) return null

  const step = stepByN(item.stepN)
  if (!step) return null

  const others = pending.filter(
    (p) => p !== item && !dismissed.has(keyOf(p.projectId, p.stepN)),
  ).length

  const href = stepHref(step, item.projectId)
  const deadlineText = item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'

  return (
    // Dismissable: backdrop click, Escape, or the close button hide it for this
    // session. It also clears automatically once the step is confirmed/completed
    // (which removes it from `pending`).
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined animate-pulse text-2xl text-primary">
            notifications_active
          </span>
          <h2 className="text-lg font-bold text-gray-900">Action required</h2>
        </div>

        <p className="text-sm text-gray-600">
          A step is on your desk. Complete it to advance the project — or close this to continue.
        </p>

        <div className="my-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-gray-900">{item.name}</p>
          <p className="mt-1 text-sm text-primary">
            Step {step.n}: {step.label}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Your role: {workflowRoleLabel(step.role)} · Deadline: {deadlineText}
          </p>
          {others > 0 && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {others} more {others === 1 ? 'project' : 'projects'} waiting after this one.
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
