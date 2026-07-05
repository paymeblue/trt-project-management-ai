'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateChecklistItemText,
  updateChecklistItemFields,
  deleteChecklistItem,
  moveChecklistItem,
  addChecklistItem,
  updateChecklistDefinition,
  setChecklistDefinitionActive,
  type EditChecklistState,
} from '@/actions/checklists'

type ItemType = 'radio' | 'text' | 'file'
type ResponseOptions = 'yes_no' | 'yes_no_na'
type TargetRole = 'factory_pm' | 'site_pm' | 'both'

export type EditableItem = {
  id: string
  label: string
  helpText: string | null
  itemType: ItemType
  responseOptions: ResponseOptions
  isPhotoRequired: boolean
}

export type EditableDefinition = {
  id: string
  name: string
  slug: string
  targetRole: TargetRole
  isActive: boolean
}

const TARGET_ROLE_OPTIONS: { value: TargetRole; label: string }[] = [
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'site_pm', label: 'Site PM' },
  { value: 'both', label: 'Both PMs' },
]

export default function ChecklistEditor({
  definition,
  items,
}: {
  definition: EditableDefinition
  items: EditableItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const refresh = () => router.refresh()

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-6"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="material-symbols-outlined text-base text-primary">edit_note</span>
          Edit checklist questions
        </span>
        <span className="material-symbols-outlined text-gray-400">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-5 sm:px-6">
          <DefinitionSettings definition={definition} onChanged={refresh} />

          <p className="mb-4 text-xs text-gray-500">
            Update, reorder, or remove any question, or add a new one. Changes apply to every
            future submission of this checklist.
          </p>
          <div className="space-y-3">
            {items.map((item, i) => (
              <ItemRow
                key={item.id}
                item={item}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                onSaved={refresh}
              />
            ))}
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                No questions yet. Add the first one below.
              </p>
            )}
          </div>
          <AddRow definitionId={definition.id} onAdded={refresh} />
        </div>
      )}
    </div>
  )
}

function StatusNote({ state }: { state: EditChecklistState }) {
  if (state.status === 'idle') return null
  return (
    <p
      className={`mt-1 text-xs ${
        state.status === 'success' ? 'text-green-600' : 'text-error'
      }`}
    >
      {state.message}
    </p>
  )
}

function DefinitionSettings({
  definition,
  onChanged,
}: {
  definition: EditableDefinition
  onChanged: () => void
}) {
  const [name, setName] = useState(definition.name)
  const [targetRole, setTargetRole] = useState<TargetRole>(definition.targetRole)
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  const dirty = name.trim() !== definition.name || targetRole !== definition.targetRole

  function save() {
    if (!name.trim()) {
      setState({ status: 'error', message: 'Name cannot be empty.' })
      return
    }
    startTransition(async () => {
      const res = await updateChecklistDefinition({
        definitionId: definition.id,
        name,
        targetRole,
      })
      setState(res)
      if (res.status === 'success') onChanged()
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await setChecklistDefinitionActive({
        definitionId: definition.id,
        isActive: !definition.isActive,
      })
      setState(res)
      if (res.status === 'success') onChanged()
    })
  }

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Checklist settings
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="sm:w-40">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            For
          </label>
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as TargetRole)}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {TARGET_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
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
          Save settings
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
            definition.isActive
              ? 'border-error/40 text-error hover:bg-error hover:text-white'
              : 'border-green-500/40 text-green-600 hover:bg-green-500 hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {definition.isActive ? 'delete' : 'restore'}
          </span>
          {definition.isActive ? 'Deactivate checklist' : 'Restore checklist'}
        </button>
      </div>
      <StatusNote state={state} />
    </div>
  )
}

function ItemRow({
  item,
  isFirst,
  isLast,
  onSaved,
}: {
  item: EditableItem
  isFirst: boolean
  isLast: boolean
  onSaved: () => void
}) {
  const [label, setLabel] = useState(item.label)
  const [helpText, setHelpText] = useState(item.helpText ?? '')
  const [itemType, setItemType] = useState<ItemType>(item.itemType)
  const [responseOptions, setResponseOptions] = useState<ResponseOptions>(item.responseOptions)
  const [isPhotoRequired, setIsPhotoRequired] = useState(item.isPhotoRequired)
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const textDirty =
    label.trim() !== item.label || (helpText.trim() || '') !== (item.helpText ?? '')
  const fieldsDirty =
    itemType !== item.itemType ||
    responseOptions !== item.responseOptions ||
    isPhotoRequired !== item.isPhotoRequired
  const dirty = textDirty || fieldsDirty

  function save() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Question text cannot be empty.' })
      return
    }
    startTransition(async () => {
      if (textDirty) {
        const res = await updateChecklistItemText({ itemId: item.id, label, helpText })
        if (res.status !== 'success') {
          setState(res)
          return
        }
      }
      if (fieldsDirty) {
        const res = await updateChecklistItemFields({
          itemId: item.id,
          itemType,
          responseOptions,
          isPhotoRequired,
        })
        if (res.status !== 'success') {
          setState(res)
          return
        }
      }
      setState({ status: 'success', message: 'Saved.' })
      onSaved()
    })
  }

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      const res = await moveChecklistItem({ itemId: item.id, direction })
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteChecklistItem({ itemId: item.id })
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
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Question
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Question text"
          />
          <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Help text (optional)
          </label>
          <input
            value={helpText}
            onChange={(e) => setHelpText(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
            placeholder="Extra guidance shown under the question"
          />

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Type
              </span>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as ItemType)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none"
              >
                <option value="radio">Yes / No</option>
                <option value="text">Free text</option>
              </select>
            </label>
            <label
              className={`flex items-center gap-1.5 text-xs text-gray-600 ${
                itemType === 'radio' ? '' : 'opacity-40'
              }`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Options
              </span>
              <select
                value={responseOptions}
                onChange={(e) => setResponseOptions(e.target.value as ResponseOptions)}
                disabled={itemType !== 'radio'}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-primary focus:outline-none disabled:cursor-not-allowed"
              >
                <option value="yes_no">Yes / No</option>
                <option value="yes_no_na">Yes / No / N/A</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={isPhotoRequired}
                onChange={(e) => setIsPhotoRequired(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              Photo required
            </label>
          </div>

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
                <span className="text-gray-500">Remove this question?</span>
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

function AddRow({ definitionId, onAdded }: { definitionId: string; onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [helpText, setHelpText] = useState('')
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  function add() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Question text cannot be empty.' })
      return
    }
    startTransition(async () => {
      const res = await addChecklistItem({ definitionId, label, helpText })
      setState(res)
      if (res.status === 'success') {
        setLabel('')
        setHelpText('')
        onAdded()
      }
    })
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
        <span className="material-symbols-outlined text-base">add</span>
        Add a new question
      </p>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        placeholder="New question text"
      />
      <input
        value={helpText}
        onChange={(e) => setHelpText(e.target.value)}
        className="mt-2 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
        placeholder="Help text (optional)"
      />
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
          Add question
        </button>
        <StatusNote state={state} />
      </div>
    </div>
  )
}
