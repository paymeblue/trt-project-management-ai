'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Roles,
  canActOnGraphStep,
  workflowRoleLabel,
  stepHref,
  findStep,
  lastStepN,
  projectComplete,
  type UserRole,
} from '@/lib/workflow'
import { useWorkflowSteps } from '@/app/_components/workflow-steps-provider'
import { completeAckStepAction, type AckStepState } from '@/actions/workflow'
import { pauseProjectAction, resumeProjectAction, type FlagState } from '@/actions/projects'
import { requestStepBypassAction, type BypassState } from '@/actions/bypass'
import { getTabToken } from '@/lib/use-tab-token'

export type BoardProject = {
  id: string
  name: string
  location: string | null
  deliveryDate: string | null // ISO — project-wide fallback deadline
  currentStep: number
  status: 'delivered' | 'not_delivered' | 'paused'
  stepDeadlines?: Record<string, string> // stepN → ISO (REQ-G05)
}

// The deadline that applies to a given step: its own per-step deadline, else the
// project-wide delivery date.
function deadlineForStep(p: BoardProject, stepN: number): string | null {
  return p.stepDeadlines?.[String(stepN)] ?? p.deliveryDate
}

const INITIAL_ACK: AckStepState = { ok: false }

// ── Blinking deadline countdown ────────────────────────────────────────────
function Countdown({
  deadline,
  complete = false,
  paused = false,
}: {
  deadline: string | null
  complete?: boolean
  paused?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (complete || paused) return
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [complete, paused])

  // Paused projects hold their clock until a super admin resumes them.
  if (paused) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
        Paused
      </span>
    )
  }

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
  const [state, dispatch, pending] = useActionState(completeAckStepAction.bind(null, getTabToken()), INITIAL_ACK)
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

const INITIAL_BYPASS: BypassState = { ok: false }

// Actor asks a super admin for approval to skip the current step's checklist
// (REQ-G09). Rendered under the current step's action when it's your turn.
function BypassRequest({ projectId, stepN }: { projectId: string; stepN: number }) {
  const router = useRouter()
  const [state, dispatch, pending] = useActionState(requestStepBypassAction.bind(null, getTabToken()), INITIAL_BYPASS)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  if (state.ok) return <p className="mt-2 text-xs font-medium text-green-600">{state.message}</p>

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
        >
          Can&apos;t complete it? Request approval to skip
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-dashed border-gray-300 p-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why should a super admin let this step be skipped?"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => dispatch({ projectId, stepN, reason })}
              className="rounded-md border border-primary px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
            >
              {pending ? 'Requesting…' : 'Request approval'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {!state.ok && state.message && <p className="text-xs text-error">{state.message}</p>}
        </div>
      )}
    </div>
  )
}

const INITIAL_FLAG: FlagState = { ok: false }

// Pause/flag a project when things aren't ready → notifies super admins (REQ-G08).
// A super admin sees a Resume control while the project is paused.
function FlagControls({ project, viewerRole }: { project: BoardProject; viewerRole: UserRole }) {
  const router = useRouter()
  const steps = useWorkflowSteps()
  const paused = project.status === 'paused'
  const [pauseState, pauseDispatch, pausePending] = useActionState(pauseProjectAction.bind(null, getTabToken()), INITIAL_FLAG)
  const [resumeState, resumeDispatch, resumePending] = useActionState(
    resumeProjectAction.bind(null, getTabToken()),
    INITIAL_FLAG,
  )
  const [showReason, setShowReason] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (pauseState.ok || resumeState.ok) router.refresh()
  }, [pauseState.ok, resumeState.ok, router])

  if (projectComplete(project.currentStep, lastStepN(steps))) return null

  if (paused) {
    if (viewerRole !== Roles.SuperAdmin) return null // banner already explains; only SA resumes
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <button
          type="button"
          disabled={resumePending}
          onClick={() => resumeDispatch({ projectId: project.id })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-sm">play_arrow</span>
          {resumePending ? 'Resuming…' : 'Resume project'}
        </button>
        {resumeState.message && (
          <p className={`mt-1 text-xs ${resumeState.ok ? 'text-green-600' : 'text-error'}`}>
            {resumeState.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-3">
      {!showReason ? (
        <button
          type="button"
          onClick={() => setShowReason(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:underline"
        >
          <span className="material-symbols-outlined text-sm">flag</span>
          Flag as not ready (pause project)
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-800">Flag this project as not ready</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="What isn't ready? (optional — super admins will see this)"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pausePending}
              onClick={() => pauseDispatch({ projectId: project.id, reason })}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {pausePending ? 'Flagging…' : 'Flag & pause'}
            </button>
            <button
              type="button"
              onClick={() => setShowReason(false)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          {!pauseState.ok && pauseState.message && (
            <p className="text-xs text-error">{pauseState.message}</p>
          )}
        </div>
      )}
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
  const steps = useWorkflowSteps()
  const lastN = lastStepN(steps)
  const complete = projectComplete(project.currentStep, lastN)
  const paused = project.status === 'paused'

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
          <span className="text-xs font-medium text-gray-600">Current step deadline</span>
          <Countdown
            deadline={deadlineForStep(project, project.currentStep)}
            complete={complete}
            paused={paused}
          />
        </div>

        {complete && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
            All steps complete — project delivered.
          </div>
        )}

        {paused && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            Paused — flagged as not ready. A super admin must resume it before work continues.
          </div>
        )}

        <ol className="space-y-2">
          {steps.map((step) => {
            const done = step.n < project.currentStep
            const current = step.n === project.currentStep
            const mine = !paused && canActOnGraphStep(step, viewerRole)
            const href = current && mine ? stepHref(step, project.id, viewerRole) : null

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
                    {/* Each step's own deadline, ticking, until it's completed. */}
                    {!done && !paused && project.stepDeadlines?.[String(step.n)] && (
                      <div className="mt-1">
                        <Countdown deadline={project.stepDeadlines[String(step.n)]} />
                      </div>
                    )}
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
                      <Link
                        href={href}
                        className="mt-1 inline-flex items-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
                      >
                        Open {step.label}
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </Link>
                    ) : null}
                    {mine && (step.kind === 'checklist' || step.kind === 'readiness') && (
                      <BypassRequest projectId={project.id} stepN={step.n} />
                    )}
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

        {/* Flag / pause (any actor) + resume (super admin) — REQ-G08 */}
        <FlagControls project={project} viewerRole={viewerRole} />

        <a
          href={`/disputes/${project.id}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-sm">forum</span>
          Open project discussion
        </a>
      </div>
    </div>
  )
}

// ── Board (dropdown + cards) ───────────────────────────────────────────────
const PROJECTS_POLL_MS = 4000

export default function ProjectStepsBoard({
  projects: initialProjects,
  viewerRole,
}: {
  projects: BoardProject[]
  viewerRole: UserRole
}) {
  // Seed from the server-rendered snapshot, then poll /api/projects so newly
  // created projects and step advances appear without a manual refresh. The
  // poll keeps state current, so there's no need to sync the prop back in.
  const [projects, setProjects] = useState<BoardProject[]>(initialProjects)
  const steps = useWorkflowSteps()
  const lastN = lastStepN(steps)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch('/api/projects', { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as BoardProject[]
        if (!cancelled) setProjects(json)
      } catch {
        // transient network error — keep last known state
      }
    }
    const id = setInterval(refresh, PROJECTS_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = projects.find((p) => p.id === selectedId) ?? null

  function currentStepLabel(p: BoardProject) {
    if (p.status === 'paused') return 'Paused'
    if (projectComplete(p.currentStep, lastN)) return 'Delivered'
    const step = findStep(steps, p.currentStep)
    return step ? `${step.label} (${p.currentStep}/${lastN})` : `Step ${p.currentStep}`
  }

  function needsViewer(p: BoardProject) {
    if (p.status === 'paused' || projectComplete(p.currentStep, lastN)) return false
    const step = findStep(steps, p.currentStep)
    return step ? canActOnGraphStep(step, viewerRole) : false
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
                {p.status === 'paused' ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    Paused
                  </span>
                ) : (
                  mine && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Needs you
                    </span>
                  )
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">{currentStepLabel(p)}</p>
              <div className="mt-3">
                <Countdown
                  deadline={deadlineForStep(p, p.currentStep)}
                  complete={projectComplete(p.currentStep, lastN)}
                  paused={p.status === 'paused'}
                />
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
