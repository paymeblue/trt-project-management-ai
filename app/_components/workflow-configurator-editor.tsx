'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addConfigStepAction,
  updateConfigStepAction,
  deleteConfigStepAction,
  moveConfigStepAction,
  changeConfigPinAction,
  type ConfigActionState,
} from '@/actions/workflow-config'
import type { WorkflowRole, StepKind, GraphStep } from '@/lib/workflow'

const ROLE_OPTIONS: { value: WorkflowRole; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'site_pm', label: 'Site PM' },
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'super_admin', label: 'Super Admin' },
]

const KIND_OPTIONS: { value: StepKind; label: string }[] = [
  { value: 'creation', label: 'Creation' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'readiness', label: 'Readiness form' },
  { value: 'ack', label: 'Acknowledge' },
  { value: 'yes_no_upload', label: 'Yes/No + optional upload' },
  { value: 'approval', label: 'Approval (send/receive)' },
  { value: 'assignment', label: 'Assignment' },
]

function StatusNote({ state }: { state: ConfigActionState }) {
  if (state.status === 'idle') return null
  return (
    <p className={`mt-1 text-xs ${state.status === 'success' ? 'text-green-600' : 'text-error'}`}>
      {state.message}
    </p>
  )
}

export default function ConfiguratorEditor({
  graph,
  steps,
  currentHint,
}: {
  graph: string
  steps: GraphStep[]
  currentHint: string
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  return (
    <div>
      <PinSettings currentHint={currentHint} onChanged={refresh} />

      <p className="mb-4 text-xs text-gray-500">
        Reorder, edit, or remove any step. Steps involved in the delivery branch/join are only
        reordered by display position — their connections are left untouched to avoid breaking the
        join.
      </p>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <StepRow
            key={step.id}
            graph={graph}
            step={step}
            isFirst={i === 0}
            isLast={i === steps.length - 1}
            onSaved={refresh}
          />
        ))}
        {steps.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
            No steps yet in this graph.
          </p>
        )}
      </div>

      <AddStepRow graph={graph} onAdded={refresh} />
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
  graph,
  step,
  isFirst,
  isLast,
  onSaved,
}: {
  graph: string
  step: GraphStep
  isFirst: boolean
  isLast: boolean
  onSaved: () => void
}) {
  const [label, setLabel] = useState(step.label)
  const [role, setRole] = useState<WorkflowRole>(step.role)
  const [kind, setKind] = useState<StepKind>(step.kind)
  const [checklistSlug, setChecklistSlug] = useState(step.slug ?? '')
  const [targetRole, setTargetRole] = useState<WorkflowRole | ''>(step.targetRole ?? '')
  const [isOptional, setIsOptional] = useState(step.isOptional)
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty =
    label.trim() !== step.label ||
    role !== step.role ||
    kind !== step.kind ||
    checklistSlug !== (step.slug ?? '') ||
    targetRole !== (step.targetRole ?? '') ||
    isOptional !== step.isOptional

  function save() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Label cannot be empty.' })
      return
    }
    startTransition(async () => {
      const res = await updateConfigStepAction({
        stepId: step.id,
        label,
        role,
        fulfillmentKind: kind,
        checklistSlug: kind === 'checklist' ? checklistSlug || null : null,
        targetRole: kind === 'assignment' ? (targetRole || null) : null,
        isOptional,
      })
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      const res = await moveConfigStepAction(graph, step.id, direction)
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteConfigStepAction(step.id)
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col pt-5">
          <button
            type="button"
            onClick={() => move('up')}
            disabled={pending || isFirst}
            title="Move up"
            className="text-gray-400 hover:text-primary disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-lg">keyboard_arrow_up</span>
          </button>
          <button
            type="button"
            onClick={() => move('down')}
            disabled={pending || isLast}
            title="Move down"
            className="text-gray-400 hover:text-primary disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-lg">keyboard_arrow_down</span>
          </button>
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            <span>Step {step.orderIndex}</span>
            <span className="text-gray-300">·</span>
            <span>{step.key}</span>
          </div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Label
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Role
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as WorkflowRole)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Kind
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as StepKind)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
              >
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={isOptional}
                onChange={(e) => setIsOptional(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Optional (skippable)
            </label>
          </div>

          {kind === 'checklist' && (
            <div className="mt-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Checklist slug
              </label>
              <input
                value={checklistSlug}
                onChange={(e) => setChecklistSlug(e.target.value)}
                placeholder="e.g. delivery_project"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          )}
          {kind === 'assignment' && (
            <div className="mt-2">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Assignee role
              </label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as WorkflowRole)}
                className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              >
                <option value="">Select a role…</option>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pending && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              Save
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Remove this step?</span>
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="rounded-md bg-error px-2 py-1 font-semibold text-white hover:bg-error/90 disabled:opacity-50"
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                  className="text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-error disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                Remove
              </button>
            )}
            <StatusNote state={state} />
          </div>
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
    <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <span className="material-symbols-outlined text-base">add</span>
        Add a new step (added at the end of the graph)
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
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WorkflowRole)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Kind
          </span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as StepKind)}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
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
