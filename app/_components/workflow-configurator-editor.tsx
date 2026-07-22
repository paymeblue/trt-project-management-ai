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
import { getTabToken } from '@/lib/use-tab-token'

export default function ConfiguratorEditor({
  graph,
  steps,
  edges,
  currentHint,
  positions,
  checklists,
}: {
  graph: string
  steps: GraphStep[]
  edges: { fromStepId: string; toStepId: string }[]
  currentHint: string
  positions: { slug: string; label: string }[]
  checklists: { slug: string; name: string }[]
}) {
  const router = useRouter()
  const refresh = () => router.refresh()
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [pending, startTransition] = useTransition()
  const [moveState, setMoveState] = useState<ConfigActionState>({ status: 'idle' })

  function moveToIndex(stepId: string, targetIndex: number) {
    const clamped = Math.max(0, Math.min(targetIndex, steps.length - 1))
    const currentIndex = steps.findIndex((s) => s.id === stepId)
    if (currentIndex === -1 || currentIndex === clamped) return
    startTransition(async () => {
      const res = await moveConfigStepToIndexAction(getTabToken(), graph, stepId, clamped)
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
        <ConfiguratorGraph
          graph={graph}
          steps={steps}
          edges={edges}
          onChanged={refresh}
          positions={positions}
          checklists={checklists}
        />
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <span className="material-symbols-outlined mt-0.5 text-base text-primary">swap_vert</span>
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-800">Use the ↑ / ↓ buttons or the position box to reorder any step.</span>{' '}
              Steps involved in any branch/join only move display position — their connections
              are left untouched to avoid breaking the branch or join. Switch to Graph view to see
              and edit branches/joins directly.
            </p>
          </div>
          <StatusNote state={moveState} />

          <div className="space-y-3">
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                stepNumber={i + 1}
                stepIndex={i}
                totalSteps={steps.length}
                disabled={pending}
                onMoveToIndex={(target) => moveToIndex(step.id, target)}
                onSaved={refresh}
                positions={positions}
                checklists={checklists}
              />
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
      const res = await changeConfigPinAction(getTabToken(), newPin, hint)
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
  stepIndex,
  totalSteps,
  disabled,
  onMoveToIndex,
  onSaved,
  positions,
  checklists,
}: {
  step: GraphStep
  stepNumber: number
  stepIndex: number
  totalSteps: number
  disabled: boolean
  onMoveToIndex: (targetIndex: number) => void
  onSaved: () => void
  positions: { slug: string; label: string }[]
  checklists: { slug: string; name: string }[]
}) {
  const [positionInput, setPositionInput] = useState(String(stepNumber))

  function goToPosition() {
    const parsed = parseInt(positionInput, 10)
    if (!Number.isNaN(parsed)) {
      onMoveToIndex(parsed - 1)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        {/* Up/down controls + big, clearly-spelled step number */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMoveToIndex(stepIndex - 1)}
              disabled={disabled || stepIndex === 0}
              title="Move up"
              className="text-gray-400 hover:text-primary disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-lg">keyboard_arrow_up</span>
            </button>
            <button
              type="button"
              onClick={() => onMoveToIndex(stepIndex + 1)}
              disabled={disabled || stepIndex === totalSteps - 1}
              title="Move down"
              className="text-gray-400 hover:text-primary disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-lg">keyboard_arrow_down</span>
            </button>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
            {stepNumber}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Step {stepNumber}
          </span>
          <div className="mt-1 flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalSteps}
              value={positionInput}
              onChange={(e) => setPositionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goToPosition()
              }}
              disabled={disabled}
              className="w-14 rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={goToPosition}
              disabled={disabled}
              title="Move to position"
              className="rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-30"
            >
              Go
            </button>
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{step.key}</div>
          <StepFieldsPanel step={step} onSaved={onSaved} positions={positions} checklists={checklists} />
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
      const res = await addConfigStepAction(getTabToken(), { graph, stepKey, label, role, fulfillmentKind: kind })
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
        Add a new step (added at the end — move it into place afterward)
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
