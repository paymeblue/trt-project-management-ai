'use client'

import { useMemo, useState, useTransition } from 'react'
import { updateConfigStepAction, deleteConfigStepAction, type ConfigActionState } from '@/actions/workflow-config'
import { createChecklistDefinition } from '@/actions/checklists'
import type { WorkflowRole, StepKind, GraphStep, ChecklistTargetRole } from '@/lib/workflow'
import { getTabToken } from '@/lib/use-tab-token'

const TARGET_ROLE_OPTIONS: { value: ChecklistTargetRole; label: string }[] = [
  { value: 'site_pm', label: 'Site PM' },
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'both', label: 'Both PMs' },
]

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
  { value: 'factory_operations', label: 'Factory Operations' },
  { value: 'factory_manager', label: 'Factory Manager' },
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
export function StepFieldsPanel({
  step,
  onSaved,
  positions,
  checklists,
}: {
  step: GraphStep
  onSaved: () => void
  positions: { slug: string; label: string }[]
  checklists: { slug: string; name: string }[]
}) {
  const [label, setLabel] = useState(step.label)
  const [role, setRole] = useState<WorkflowRole>(step.role)
  const [kind, setKind] = useState<StepKind>(step.kind)
  const [additionalKinds, setAdditionalKinds] = useState<StepKind[]>(step.additionalKinds ?? [])
  const [checklistSlug, setChecklistSlug] = useState(step.slug ?? '')
  const [targetRoles, setTargetRoles] = useState<WorkflowRole[]>(step.targetRoles ?? [])
  const [positionChoice, setPositionChoice] = useState<string>(step.requiredPosition ?? '')
  const requiredPosition = positionChoice
  const [isOptional, setIsOptional] = useState(step.isOptional)
  // v2.0 Phase 22e: dualRoles (readiness/checklist kinds — ALL checked roles
  // must independently confirm) and receiverRole (approval kind only — who
  // receives, a different role than the sender).
  const [dualRoles, setDualRoles] = useState<WorkflowRole[]>(step.dualRoles ?? [])
  const [receiverRole, setReceiverRole] = useState<string>(step.receiverRole ?? '')
  const [state, setState] = useState<ConfigActionState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // quick task readiness-ack-sync: the "Which checklist?" picker used to be
  // a bare free-text slug input — confusing enough that someone typed a
  // literal checklist QUESTION into it instead of an identifier. Replaced
  // with a dropdown of real checklist names, an "Edit its questions" link
  // straight to /admin/checklists, and an inline "create new" shortcut so a
  // super admin never has to know what a slug is.
  const [creatingChecklist, setCreatingChecklist] = useState(false)
  const [newChecklistName, setNewChecklistName] = useState('')
  const [newChecklistTarget, setNewChecklistTarget] = useState<ChecklistTargetRole>('site_pm')
  const [createState, setCreateState] = useState<ConfigActionState>({ status: 'idle' })
  const [createPending, startCreateTransition] = useTransition()
  // Optimistic: shows the just-created checklist in the dropdown immediately,
  // before onSaved()'s router.refresh() brings the real `checklists` prop
  // up to date.
  const [justCreated, setJustCreated] = useState<{ slug: string; name: string } | null>(null)
  const displayChecklists = useMemo(() => {
    if (!justCreated || checklists.some((c) => c.slug === justCreated.slug)) return checklists
    return [...checklists, justCreated]
  }, [checklists, justCreated])

  function createChecklist() {
    const name = newChecklistName.trim()
    if (!name) return
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    startCreateTransition(async () => {
      const res = await createChecklistDefinition(getTabToken(), { name, slug, targetRole: newChecklistTarget })
      setCreateState(res)
      if (res.status === 'success' && res.slug) {
        setJustCreated({ slug: res.slug, name })
        setChecklistSlug(res.slug)
        setNewChecklistName('')
        setCreatingChecklist(false)
        onSaved()
      }
    })
  }

  const kindMeta = KIND_OPTIONS.find((k) => k.value === kind)
  const usesTargetRoles = kind === 'assignment' || additionalKinds.includes('assignment')
  // quick task readiness-ack-sync: a linked checklist can now ALSO back a
  // 'readiness'/'checklist' requirement stacked as an additional kind (not
  // just the primary), so the runtime combined view
  // (app/(app)/workflow/step/page.tsx) has real content to render instead of
  // falling back to a plain "Also require" checkbox with nothing behind it.
  const usesChecklistSlug =
    kind === 'checklist' || additionalKinds.includes('checklist') || additionalKinds.includes('readiness')

  const sameArr = <T,>(a: T[], b: T[] | null | undefined) => {
    const bb = b ?? []
    return a.length === bb.length && a.every((r) => bb.includes(r))
  }

  const usesDualRoles = kind === 'readiness' || kind === 'checklist'
  const usesReceiverRole = kind === 'approval'

  const dirty =
    label.trim() !== step.label ||
    role !== step.role ||
    kind !== step.kind ||
    !sameArr(additionalKinds, step.additionalKinds) ||
    checklistSlug !== (step.slug ?? '') ||
    !sameArr(targetRoles, step.targetRoles) ||
    requiredPosition !== (step.requiredPosition ?? '') ||
    isOptional !== step.isOptional ||
    !sameArr(dualRoles, step.dualRoles) ||
    receiverRole !== (step.receiverRole ?? '')

  function toggleTargetRole(r: WorkflowRole) {
    setTargetRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
  }

  function toggleDualRole(r: WorkflowRole) {
    setDualRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
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
      const res = await updateConfigStepAction(getTabToken(), {
        stepId: step.id,
        label,
        role,
        fulfillmentKind: kind,
        additionalKinds,
        checklistSlug: usesChecklistSlug ? checklistSlug || null : null,
        targetRoles: usesTargetRoles ? targetRoles : null,
        requiredPosition: positionChoice.trim() || null,
        isOptional,
        dualRoles: usesDualRoles ? dualRoles : null,
        receiverRole: usesReceiverRole && receiverRole ? (receiverRole as WorkflowRole) : null,
      })
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteConfigStepAction(getTabToken(), step.id)
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

      {usesChecklistSlug && (
        <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Which checklist?
          </label>
          <select
            value={checklistSlug}
            onChange={(e) => setChecklistSlug(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          >
            <option value="">— none selected —</option>
            {displayChecklists.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>

          {checklistSlug && (
            <a
              href={`/admin/checklists?def=${checklistSlug}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Edit its questions (opens Checklists in a new tab)
              <span className="material-symbols-outlined text-xs">open_in_new</span>
            </a>
          )}

          {!creatingChecklist ? (
            <button
              type="button"
              onClick={() => setCreatingChecklist(true)}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-xs">add</span>
              Create a new checklist
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-md border border-primary/20 bg-white p-2">
              <input
                value={newChecklistName}
                onChange={(e) => setNewChecklistName(e.target.value)}
                placeholder="Checklist name, e.g. Drawing Correction Sign-off"
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
              <select
                value={newChecklistTarget}
                onChange={(e) => setNewChecklistTarget(e.target.value as ChecklistTargetRole)}
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              >
                {TARGET_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={createChecklist}
                  disabled={createPending || !newChecklistName.trim()}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {createPending ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingChecklist(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
              <StatusNote state={createState} />
            </div>
          )}

          {additionalKinds.includes('readiness') && kind !== 'readiness' && kind !== 'checklist' && (
            <p className="mt-2 text-[11px] text-gray-400">
              Optional for &ldquo;Readiness form&rdquo; when stacked as an extra requirement — leave
              unselected for a plain one-click confirmation instead of a linked checklist.
            </p>
          )}
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

      {usesDualRoles && (
        <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Require BOTH roles to confirm (dual-confirmation)? (optional — check 2 or more; ALL
            checked roles must independently confirm before this step advances)
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  dualRoles.includes(o.value)
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={dualRoles.includes(o.value)}
                  onChange={() => toggleDualRole(o.value)}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {usesReceiverRole && (
        <div className="mt-3 rounded-lg bg-gray-50 p-2.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Who receives/approves? (a different role than the sender)
          </label>
          <select
            value={receiverRole}
            onChange={(e) => setReceiverRole(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
          >
            <option value="">— none —</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-3">
        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Restrict to a specific title? (optional)
        </label>
        <select
          value={positionChoice}
          onChange={(e) => setPositionChoice(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          <option value="">Anyone with this role</option>
          {positions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
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
