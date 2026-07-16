'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  findStep,
  stepHref,
  workflowRoleLabel,
  canActOnGraphStep,
  lastStepN,
  type UserRole,
} from '@/lib/workflow'
import { useMyWork } from '@/app/_components/my-work-provider'
import { useWorkflowSteps } from '@/app/_components/workflow-steps-provider'
import type { LiveWorkflowStep } from '@/lib/workflow-graph'
import DeadlineCountdown from '@/app/_components/deadline-countdown'

// Quick task 260714-b4t (bug fix): mirrors getMyWork's pending-filter
// expression — a UI/visibility gate only, NOT the authorization boundary
// (authorizeStep in actions/workflow-graph.ts remains the real, server-
// enforced gate). Approval-kind steps carry requiredPosition (sender) AND
// receiverRequiredPosition (receiver); only exclude when the viewer matches
// neither, so the receiver's turn to act isn't hidden.
function matchesPosition(step: LiveWorkflowStep, viewerPosition: string | null): boolean {
  if (!step.requiredPosition) return true
  if (viewerPosition === step.requiredPosition) return true
  return step.receiverRequiredPosition != null && viewerPosition === step.receiverRequiredPosition
}

function waitingOn(step: LiveWorkflowStep): string {
  if (step.requiredPosition) {
    return `Waiting on ${step.requiredPosition
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')}`
  }
  return `Waiting on ${workflowRoleLabel(step.role)}`
}

// Dismissable navbar indicator: shows the "current" in-progress project + the
// step it's on, with a dropdown to switch between projects (a PM may juggle
// several at once). Data is live (polled by MyWorkProvider).
export default function HeaderProjectSwitcher({
  viewerRole,
  viewerUserId,
  viewerPosition,
}: {
  viewerRole: UserRole
  viewerUserId: string
  viewerPosition: string | null
}) {
  const { activeProjects: projects } = useMyWork()
  const steps = useWorkflowSteps()
  // State is held in-memory; because this component lives in the app layout it
  // survives client-side navigations (it only resets on a full page reload).
  const [dismissed, setDismissed] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (projects.length === 0) return null

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        title="Show current project"
        className="ml-2 hidden items-center gap-1 rounded-full border border-outline-variant px-2 py-1 text-label-sm text-on-surface-variant hover:bg-surface-container-high sm:inline-flex"
      >
        <span className="material-symbols-outlined text-base">folder_open</span>
      </button>
    )
  }

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]
  const lastN = lastStepN(steps)
  const step = findStep(steps, selected.stepN)
  // Quick task 260713-ekr (security fix): a gated step is only "mine" when
  // the viewer IS the assignee recorded at the governing assignment step.
  const mine = step
    ? canActOnGraphStep(step, viewerRole) &&
      (selected.gatedToUserId === null || selected.gatedToUserId === viewerUserId) &&
      matchesPosition(step, viewerPosition)
    : false
  const href = step && mine ? stepHref(step, selected.id, viewerRole) : null

  function choose(id: string) {
    setSelectedId(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative ml-2 hidden sm:block">
      <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low pl-3 pr-1 py-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex max-w-[260px] items-center gap-2 text-left"
          title="Switch project"
        >
          <span className="material-symbols-outlined text-base text-primary">folder_open</span>
          <span className="min-w-0">
            <span className="block truncate text-label-md font-label-md leading-tight text-on-surface">
              {selected.name}
            </span>
            <span className="block truncate text-label-sm leading-tight text-on-surface-variant">
              {step ? `Step ${step.n}/${lastN}: ${step.label}` : 'In progress'}
              {step ? (mine ? ' · your turn' : ` · ${waitingOn(step)}`) : ''}
              {' · '}
              <DeadlineCountdown deadline={selected.deadline} compact />
            </span>
          </span>
          <span className="material-symbols-outlined text-base text-on-surface-variant">
            expand_more
          </span>
        </button>
        {href && (
          <Link
            href={href}
            title="Open this step"
            className="rounded-full bg-primary px-2 py-1 text-label-sm font-semibold text-white hover:bg-primary/90"
          >
            Act
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          title="Dismiss"
          className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-80 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low p-1 shadow-lg">
          {projects.map((p) => {
            const s = findStep(steps, p.stepN)
            const youract = s
              ? canActOnGraphStep(s, viewerRole) &&
                (p.gatedToUserId === null || p.gatedToUserId === viewerUserId) &&
                matchesPosition(s, viewerPosition)
              : false
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p.id)}
                className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-surface-container-high ${
                  p.id === selected.id ? 'bg-surface-container-high' : ''
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-label-md font-label-md text-on-surface">
                    {p.name}
                  </span>
                  {youract && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Your turn
                    </span>
                  )}
                </span>
                <span className="truncate text-label-sm text-on-surface-variant">
                  {s
                    ? `Step ${s.n}/${lastN}: ${s.label}${youract ? ' · Your turn' : ` · ${waitingOn(s)}`}`
                    : 'In progress'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
