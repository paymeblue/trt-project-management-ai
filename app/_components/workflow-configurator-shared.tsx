'use client'

import { useState, useTransition } from 'react'
import { updateConfigStepAction, deleteConfigStepAction, type ConfigActionState } from '@/actions/workflow-config'
import type { WorkflowRole, StepKind, GraphStep } from '@/lib/workflow'

// Shared between the list view (workflow-configurator-editor.tsx) and the
// graph view's side panel (workflow-configurator-graph.tsx) — one form,
// two chrome wrappers, so a field change never needs to be made twice.

export const ROLE_OPTIONS: { value: WorkflowRole; label: string }[] = [
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
export const KIND_OPTIONS: { value: StepKind; label: string; hint: string }[] = [
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
export const KNOWN_POSITIONS = [
  { value: 'head_designer', label: 'Head Designer' },
  { value: 'head_of_operations', label: 'Head of Operations' },
  { value: 'chief_production_officer', label: 'Chief Production Officer' },
]

// Role accent colors — shared with trt-flow-diagram.tsx's palette for
// consistency between the About page's read-only diagram and the
// Configurator's editable graph view.
export const ROLE_COLOR: Record<WorkflowRole, string> = {
  operations: '#6366f1',
  site_pm: '#0ea5e9',
  factory_pm: '#f97316',
  super_admin: '#059669',
  customer_care: '#d946ef',
  design: '#e11d48',
  architect: '#a855f7',
  factory_operations: '#ca8a04', // amber
  factory_manager: '#0d9488', // teal
}

export function StatusNote({ state }: { state: ConfigActionState }) {
  if (state.status === 'idle') return null
  return (
    <p className={`mt-1 text-xs ${state.status === 'success' ? 'text-green-600' : 'text-error'}`}>
      {state.message}
    </p>
  )
}

/**
 * The full editable field set for one step — label, role, fulfillment kind
 * (+ its kind-specific sub-fields), optional flag, required position, and
 * save/remove. Used standalone inside the list view's card chrome, and
 * inside the graph view's side panel — same fields, same behavior, either
 * place you edit from.
 */
export function StepFieldsPanel({ step, onSaved }: { step: GraphStep; onSaved: () => void }) {
  const [label, setLabel] = useState(step.label)
  const [role, setRole] = useState<WorkflowRole>(step.role)
  const [kind, setKind] = useState<StepKind>(step.kind)
  const [additionalKinds, setAdditionalKinds] = useState<StepKind[]>(step.additionalKinds ?? [])
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

  const kindMeta = KIND_OPTIONS.find((k) => k.value === kind)
  const usesTargetRoles = kind === 'assignment' || additionalKinds.includes('assignment')

  const sameArr = <T,>(a: T[], b: T[] | null | undefined) => {
    const bb = b ?? []
    return a.length === bb.length && a.every((r) => bb.includes(r))
  }

  const dirty =
    label.trim() !== step.label ||
    role !== step.role ||
    kind !== step.kind ||
    !sameArr(additionalKinds, step.additionalKinds) ||
    checklistSlug !== (step.slug ?? '') ||
    !sameArr(targetRoles, step.targetRoles) ||
    requiredPosition !== (step.requiredPosition ?? '') ||
    isOptional !== step.isOptional

  function toggleTargetRole(r: WorkflowRole) {
    setTargetRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
  }

  function toggleAdditionalKind(k: StepKind) {
    setAdditionalKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
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
        additionalKinds,
        checklistSlug: kind === 'checklist' || additionalKinds.includes('checklist') ? checklistSlug || null : null,
        targetRoles: usesTargetRoles ? targetRoles : null,
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
    <div>
      <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Label</label>
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

      <div className="mt-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2.5">
        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Also require… (optional — stack more than one fulfillment type on this step; ALL checked
          must be done before it can be completed)
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {KIND_OPTIONS.filter((o) => o.value !== kind && o.value !== 'creation' && o.value !== 'payment_confirmation').map(
            (o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  additionalKinds.includes(o.value)
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={additionalKinds.includes(o.value)}
                  onChange={() => toggleAdditionalKind(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ),
          )}
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

      {(kind === 'checklist' || additionalKinds.includes('checklist')) && (
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

      {usesTargetRoles && (
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
          {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
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
  )
}
