'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addConfigStepAction,
  moveConfigStepToIndexAction,
  changeConfigPinAction,
  type ConfigActionState,
} from '@/actions/workflow-config'
import type { WorkflowRole, StepKind, GraphStep } from '@/lib/workflow'
import { ROLE_OPTIONS, KIND_OPTIONS, StatusNote, StepFieldsPanel } from '@/app/_components/workflow-configurator-shared'
import ConfiguratorGraph from '@/app/_components/workflow-configurator-graph'

export default function ConfiguratorEditor({
  graph,
  steps,
  edges,
  currentHint,
}: {
  graph: string
  steps: GraphStep[]
  edges: { fromStepId: string; toStepId: string }[]
  currentHint: string
}) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [moveState, setMoveState] = useState<ConfigActionState>({ status: 'idle' })
  const [pendingMove, setPendingMove] = useState<{ fromIndex: number; toIndex: number; label: string } | null>(null)

  function onDrop(targetIndex: number) {
    setOverIndex(null)
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    setPendingMove({ fromIndex: dragIndex, toIndex: targetIndex, label: steps[dragIndex].label })
    setDragIndex(null)
  }

  function confirmMove() {
    if (!pendingMove) return
    const stepId = steps[pendingMove.fromIndex].id
    const targetIndex = pendingMove.toIndex
    setPendingMove(null)
    startTransition(async () => {
      const res = await moveConfigStepToIndexAction(graph, stepId, targetIndex)
      setMoveState(res)
      if (res.status === 'success') refresh()
    })
  }

  return (
    <div>
      <PinSettings currentHint={currentHint} onChanged={refresh} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setView('graph')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === 'graph' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">hub</span>
            Graph view
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              view === 'list' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">reorder</span>
            List view
          </button>
        </div>
      </div>

      {view === 'graph' ? (
        <ConfiguratorGraph graph={graph} steps={steps} edges={edges} onChanged={refresh} />
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <span className="material-symbols-outlined mt-0.5 text-base text-primary">drag_indicator</span>
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-800">Drag any step by its handle to reorder it.</span>{' '}
              Steps involved in any branch/join only move display position — their connections
              are left untouched to avoid breaking the branch or join. Switch to Graph view to see
              and edit branches/joins directly.
            </p>
          </div>
          <StatusNote state={moveState} />

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div
                key={step.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (overIndex !== i) setOverIndex(i)
                }}
                onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault()
                  onDrop(i)
                }}
                className={
                  overIndex === i && dragIndex !== null && dragIndex !== i
                    ? 'rounded-xl ring-2 ring-primary ring-offset-2'
                    : ''
                }
              >
                <StepRow
                  step={step}
                  stepNumber={i + 1}
                  dragging={dragIndex === i}
                  disabled={pending}
                  onDragStartHandle={() => setDragIndex(i)}
                  onDragEndHandle={() => {
                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                  onSaved={refresh}
                />
              </div>
            ))}
            {steps.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                No steps yet in this graph.
              </p>
            )}
          </div>

          <AddStepRow graph={graph} onAdded={refresh} />
        </>
      )}

      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-gray-900">
              Move &ldquo;{pendingMove.label}&rdquo; to step {pendingMove.toIndex + 1}?
            </p>
            <p className="mt-1 text-xs text-gray-500">
              This changes the actual order projects move through — not just display order.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingMove(null)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmMove}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
              >
                Yes, move it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PinSettings({
  currentHint,
  onChanged,
}: {
  currentHint: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [hint, setHint] = useState(currentHint)
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const res = await changeConfigPinAction(newPin, hint)
      setState(res)
      if (res.status === 'success') {
        setNewPin('')
        onChanged()
      }
    })
  }

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Configuration PIN
        </span>
        <span className="material-symbols-outlined text-gray-400">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              New PIN (4-8 digits)
            </label>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Hint (shown on the PIN screen)
            </label>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending || !newPin.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Save PIN
          </button>
        </div>
      )}
      <StatusNote state={state} />
    </div>
  )
}

function StepRow({
  step,
  stepNumber,
  dragging,
  disabled,
  onDragStartHandle,
  onDragEndHandle,
  onSaved,
}: {
  step: GraphStep
  stepNumber: number
  dragging: boolean
  disabled: boolean
  onDragStartHandle: () => void
  onDragEndHandle: () => void
  onSaved: () => void
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm transition-shadow ${
        dragging ? 'border-primary opacity-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle + big, clearly-spelled step number */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <span
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              onDragStartHandle()
            }}
            onDragEnd={onDragEndHandle}
            title="Drag to reorder"
            className={`material-symbols-outlined cursor-grab select-none text-2xl text-gray-300 hover:text-primary active:cursor-grabbing ${
              disabled ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            drag_indicator
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
            {stepNumber}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Step {stepNumber}
          </span>
        </div>

        <div className="flex-1">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{step.key}</div>
          <StepFieldsPanel step={step} onSaved={onSaved} />
        </div>
      </div>
    </div>
  )
}

function AddStepRow({ graph, onAdded }: { graph: string; onAdded: () => void }) {
  const [stepKey, setStepKey] = useState('')
  const [label, setLabel] = useState('')
  const [role, setRole] = useState<WorkflowRole>('operations')
  const [kind, setKind] = useState<StepKind>('yes_no_upload')
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  function add() {
    if (!stepKey.trim() || !label.trim()) {
      setState({ status: 'error', message: 'Step key and label are required.' })
      return
    }
    startTransition(async () => {
      const res = await addConfigStepAction({ graph, stepKey, label, role, fulfillmentKind: kind })
      setState(res)
      if (res.status === 'success') {
        setStepKey('')
        setLabel('')
        onAdded()
      }
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-base">add_circle</span>
        Add a new step (added at the end — drag it into place afterward)
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={stepKey}
          onChange={(e) => setStepKey(e.target.value)}
          placeholder="step_key (unique, e.g. project_intent)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Display label"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Who does this step? (Role)
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WorkflowRole)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            What happens? (Fulfillment kind)
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as StepKind)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white disabled:opacity-50"
        >
          {pending && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/40 border-t-primary" />
          )}
          Add step
        </button>
        <StatusNote state={state} />
      </div>
    </div>
  )
}
