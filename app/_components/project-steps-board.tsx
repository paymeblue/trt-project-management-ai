'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  WORKFLOW_STEPS,
  LAST_STEP,
  Roles,
  canRoleActOnStep,
  workflowRoleLabel,
  stepHref,
  isProjectComplete,
  type UserRole,
} from '@/lib/workflow'
import { completeAckStepAction, type AckStepState } from '@/actions/workflow'

export type BoardProject = {
  id: string
  name: string
  location: string | null
  deliveryDate: string | null // ISO
  currentStep: number
  status: 'delivered' | 'not_delivered'
}

const INITIAL_ACK: AckStepState = { ok: false }

// ── Blinking deadline countdown ────────────────────────────────────────────
function Countdown({ deadline, complete = false }: { deadline: string | null; complete?: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (complete) return
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [complete])

  // Once delivered, the deadline no longer counts down — show a static status.
  if (complete) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
        Delivered
      </span>
    )
  }

  if (!deadline) {
    return (
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
        No deadline set
      </span>
    )
  }

  const ms = new Date(deadline).getTime() - now
  const overdue = ms < 0
  const a = Math.abs(ms)
  const d = Math.floor(a / 86_400_000)
  const h = Math.floor((a % 86_400_000) / 3_600_000)
  const m = Math.floor((a % 3_600_000) / 60_000)
  const s = Math.floor((a % 60_000) / 1000)
  const text = `${d}d ${h}h ${m}m ${s}s`

  return (
    <span
      suppressHydrationWarning
      className={`animate-pulse rounded-full px-3 py-1 text-xs font-bold ${
        overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
      }`}
      title={new Date(deadline).toLocaleString()}
    >
      {overdue ? `Overdue by ${text}` : `${text} left`}
    </span>
  )
}

// ── Inline "ack" step completion (e.g. Factory Floor Projects) ─────────────
function AckComplete({ projectId, stepN }: { projectId: string; stepN: number }) {
  const router = useRouter()
  const [state, dispatch, pending] = useActionState(completeAckStepAction, INITIAL_ACK)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <div className="mt-2 space-y-2">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => dispatch({ projectId, expectedStepN: stepN, notes })}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Mark step complete'}
      </button>
      {!state.ok && state.message && <p className="text-xs text-error">{state.message}</p>}
    </div>
  )
}

// ── Steps modal ────────────────────────────────────────────────────────────
function StepsModal({
  project,
  viewerRole,
  onClose,
}: {
  project: BoardProject
  viewerRole: UserRole
  onClose: () => void
}) {
  const complete = isProjectComplete(project.currentStep)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{project.name}</h2>
            <p className="text-xs text-gray-500">{project.location || 'No location'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="text-xs font-medium text-gray-600">Deadline</span>
          <Countdown deadline={project.deliveryDate} complete={complete} />
        </div>

        {complete && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
            All steps complete — project delivered.
          </div>
        )}

        <ol className="space-y-2">
          {WORKFLOW_STEPS.map((step) => {
            const done = step.n < project.currentStep
            const current = step.n === project.currentStep
            const mine = canRoleActOnStep(step.role, viewerRole)
            const href = current && mine ? stepHref(step, project.id) : null

            const tip = done
              ? 'Completed — this step is locked.'
              : current
                ? mine
                  ? 'This is your current step. Complete it to advance the project.'
                  : `Waiting on ${workflowRoleLabel(step.role)} to complete this step.`
                : `Locked — earlier steps must be completed first (needs ${workflowRoleLabel(step.role)}).`

            return (
              <li
                key={step.key}
                title={tip}
                className={`rounded-lg border p-3 ${
                  current
                    ? 'border-primary bg-primary/5'
                    : done
                      ? 'border-green-200 bg-green-50/50'
                      : 'cursor-not-allowed border-gray-200 bg-white opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-xl ${
                      done ? 'text-green-600' : current ? 'text-primary' : 'text-gray-300'
                    }`}
                  >
                    {done ? 'check_circle' : current ? 'radio_button_checked' : 'lock'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        done ? 'text-gray-500 line-through' : 'text-gray-900'
                      }`}
                    >
                      {step.n}. {step.label}
                    </p>
                    <p className="text-xs text-gray-400">{workflowRoleLabel(step.role)}</p>
                  </div>
                  {done && <span className="text-xs font-medium text-green-600">Done</span>}
                </div>

                {current && (
                  <div className="mt-1 pl-9">
                    {!mine ? (
                      <p className="text-xs font-medium text-amber-700">
                        Waiting on {workflowRoleLabel(step.role)}…
                      </p>
                    ) : step.kind === 'ack' ? (
                      <AckComplete projectId={project.id} stepN={step.n} />
                    ) : href ? (
                      <a
                        href={href}
                        className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                      >
                        Open {step.label}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </a>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ol>

        {/* Optional, non-blocking action for Site PM — available any time the
            project is in progress; does not advance the workflow. */}
        {viewerRole === Roles.SitePm && !complete && (
          <div
            className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3"
            title="Optional — raise a change request at any time. This does not affect the step order."
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  Optional · Change Request Checklist
                </p>
                <p className="text-xs text-gray-400">
                  Raise a change request any time — does not advance the workflow.
                </p>
              </div>
              <a
                href={`/checklists/change_request?projectId=${project.id}`}
                className="shrink-0 rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                Open
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Board (dropdown + cards) ───────────────────────────────────────────────
export default function ProjectStepsBoard({
  projects,
  viewerRole,
}: {
  projects: BoardProject[]
  viewerRole: UserRole
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = projects.find((p) => p.id === selectedId) ?? null

  function currentStepLabel(p: BoardProject) {
    if (isProjectComplete(p.currentStep)) return 'Delivered'
    const step = WORKFLOW_STEPS.find((s) => s.n === p.currentStep)
    return step ? `${step.label} (${p.currentStep}/${LAST_STEP})` : `Step ${p.currentStep}`
  }

  function needsViewer(p: BoardProject) {
    if (isProjectComplete(p.currentStep)) return false
    const step = WORKFLOW_STEPS.find((s) => s.n === p.currentStep)
    return step ? canRoleActOnStep(step.role, viewerRole) : false
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
        No projects yet. Projects are created by Operations.
      </p>
    )
  }

  return (
    <div>
      {/* Dropdown selector */}
      <label className="mb-1 block text-xs font-medium text-gray-600">Select a project</label>
      <select
        value={selectedId ?? ''}
        onChange={(e) => setSelectedId(e.target.value || null)}
        className="mb-6 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
      >
        <option value="">— Choose a project to view its steps —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {currentStepLabel(p)}
            {needsViewer(p) ? ' • NEEDS YOU' : ''}
          </option>
        ))}
      </select>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {projects.map((p) => {
          const mine = needsViewer(p)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`flex flex-col items-start rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
                mine ? 'border-primary ring-1 ring-primary/30' : 'border-gray-200'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">{p.name}</p>
                {mine && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Needs you
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">{currentStepLabel(p)}</p>
              <div className="mt-3">
                <Countdown deadline={p.deliveryDate} complete={isProjectComplete(p.currentStep)} />
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <StepsModal project={selected} viewerRole={viewerRole} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
