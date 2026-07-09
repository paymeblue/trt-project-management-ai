'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  addConfigStepAction,
  updateConfigStepAction,
  deleteConfigStepAction,
  moveConfigStepToIndexAction,
  changeConfigPinAction,
  type ConfigActionState,
} from '@/actions/workflow-config'
import type { WorkflowRole, StepKind, GraphStep } from '@/lib/workflow'

const ROLE_OPTIONS: { value: WorkflowRole; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'site_pm', label: 'Site PM' },
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'customer_care', label: 'Customer Care' },
  { value: 'design', label: 'Design' },
  { value: 'architect', label: 'Architect' },
]

// Friendlier, plain-language framing for what each fulfillment kind means —
// shown as the helper line under the Kind select so choosing one doesn't
// require already knowing the engine's internal vocabulary.
const KIND_OPTIONS: { value: StepKind; label: string; hint: string }[] = [
  { value: 'creation', label: 'Creation', hint: 'Starts the project — fills in the initial details.' },
  { value: 'checklist', label: 'Checklist', hint: 'A multi-item checklist form must be filled and submitted.' },
  { value: 'readiness', label: 'Readiness form', hint: 'A readiness/sign-off form must be completed.' },
  { value: 'ack', label: 'Acknowledge', hint: 'A single one-click acknowledgement, no form.' },
  { value: 'payment_confirmation', label: 'Payment confirmation & timeline', hint: 'Toggle paid status and set deadlines for every remaining step.' },
  { value: 'yes_no_upload', label: 'Yes/No + optional upload', hint: 'A simple yes/no answer, with an optional file attached.' },
  { value: 'approval', label: 'Approval (send/receive)', hint: 'One person sends it, a different person must receive/approve it.' },
  { value: 'assignment', label: 'Assignment', hint: 'The actor picks a specific person (from one or more roles) to hand this off to.' },
]

// Known `users.position` values that already gate a step somewhere in the
// app — offered as one-click choices so configuring "required position"
// never requires typing an exact snake_case string from memory.
const KNOWN_POSITIONS = [
  { value: 'head_designer', label: 'Head Designer' },
  { value: 'head_of_operations', label: 'Head of Operations' },
  { value: 'chief_production_officer', label: 'Chief Production Officer' },
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [moveState, setMoveState] = useState<ConfigActionState>({ status: 'idle' })

  function onDrop(targetIndex: number) {
    setOverIndex(null)
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    const stepId = steps[dragIndex].id
    startTransition(async () => {
      const res = await moveConfigStepToIndexAction(graph, stepId, targetIndex)
      setMoveState(res)
      if (res.status === 'success') refresh()
    })
    setDragIndex(null)
  }

  return (
    <div>
      <PinSettings currentHint={currentHint} onChanged={refresh} />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <span className="material-symbols-outlined mt-0.5 text-base text-primary">drag_indicator</span>
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-800">Drag any step by its handle to reorder it.</span>{' '}
          Steps involved in the delivery branch/join only move display position — their connections
          are left untouched to avoid breaking the join.
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
  const [label, setLabel] = useState(step.label)
  const [role, setRole] = useState<WorkflowRole>(step.role)
  const [kind, setKind] = useState<StepKind>(step.kind)
  const [checklistSlug, setChecklistSlug] = useState(step.slug ?? '')
  const [targetRoles, setTargetRoles] = useState<WorkflowRole[]>(step.targetRoles ?? [])
  const isKnownPosition = KNOWN_POSITIONS.some((p) => p.value === step.requiredPosition)
  const [positionChoice, setPositionChoice] = useState<string>(
    !step.requiredPosition ? '' : isKnownPosition ? step.requiredPosition : '__custom__',
  )
  const [customPosition, setCustomPosition] = useState(!step.requiredPosition || isKnownPosition ? '' : step.requiredPosition!)
  const requiredPosition = positionChoice === '__custom__' ? customPosition : positionChoice
  const [isOptional, setIsOptional] = useState(step.isOptional)
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dragHandleRef = useRef<HTMLSpanElement>(null)

  const kindMeta = KIND_OPTIONS.find((k) => k.value === kind)

  const sameRoles = (a: WorkflowRole[], b: WorkflowRole[] | null | undefined) => {
    const bb = b ?? []
    return a.length === bb.length && a.every((r) => bb.includes(r))
  }

  const dirty =
    label.trim() !== step.label ||
    role !== step.role ||
    kind !== step.kind ||
    checklistSlug !== (step.slug ?? '') ||
    !sameRoles(targetRoles, step.targetRoles) ||
    requiredPosition !== (step.requiredPosition ?? '') ||
    isOptional !== step.isOptional

  function toggleTargetRole(r: WorkflowRole) {
    setTargetRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
  }

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
        targetRoles: kind === 'assignment' ? targetRoles : null,
        requiredPosition: requiredPosition.trim() || null,
        isOptional,
      })
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
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm transition-shadow ${
        dragging ? 'border-primary opacity-50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle + big, clearly-spelled step number */}
        <div className="flex flex-col items-center gap-1 pt-1">
          <span
            ref={dragHandleRef}
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
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            {step.key}
          </div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Label
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base font-semibold focus:border-primary focus:outline-none"
          />

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              {kindMeta && <p className="mt-1 text-[11px] text-gray-400">{kindMeta.hint}</p>}
            </div>
          </div>

          <label className="mt-3 flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={isOptional}
              onChange={(e) => setIsOptional(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            Optional — can be skipped without blocking the project
          </label>

          {kind === 'checklist' && (
            <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Which checklist? (slug)
              </label>
              <input
                value={checklistSlug}
                onChange={(e) => setChecklistSlug(e.target.value)}
                placeholder="e.g. delivery_project"
                className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          )}

          {kind === 'assignment' && (
            <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Who can be picked? (check one or more — the actor may choose a user from any checked role)
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      targetRoles.includes(o.value)
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={targetRoles.includes(o.value)}
                      onChange={() => toggleTargetRole(o.value)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Restrict to a specific title? (optional)
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {[{ value: '', label: 'Anyone with this role' }, ...KNOWN_POSITIONS, { value: '__custom__', label: 'Other title…' }].map(
                (o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPositionChoice(o.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      positionChoice === o.value
                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {o.label}
                  </button>
                ),
              )}
            </div>
            {positionChoice === '__custom__' && (
              <input
                value={customPosition}
                onChange={(e) => setCustomPosition(e.target.value)}
                placeholder="e.g. senior_architect"
                className="mt-2 w-full max-w-xs rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            )}
            <p className="mt-1 text-[11px] text-gray-400">
              When set, only a user with BOTH the role above AND this exact title may act on this step.
            </p>
          </div>

          <div className="mt-3 flex items-center gap-3">
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
