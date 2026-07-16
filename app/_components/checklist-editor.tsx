'use client'

import { useId, useState, useTransition } from 'react'
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
  const refresh = () => router.refresh()

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm" aria-label="Checklist editor">
      <header className="border-b border-primary/15 bg-primary/5 px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined mt-0.5 text-xl text-primary" aria-hidden="true">
            edit_note
          </span>
          <div>
            <h2 className="text-base font-bold text-gray-900">Edit checklist questions</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Changes made here update the questions people complete on this checklist.
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 sm:px-6">
        <DefinitionSettings definition={definition} onChanged={refresh} />

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Questions</h3>
            <p className="mt-0.5 text-xs text-gray-500">Edit a question, then save it right beside the field.</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
            {items.length} {items.length === 1 ? 'question' : 'questions'}
          </span>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onSaved={refresh}
            />
          ))}
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
              No questions yet. Add the first one below.
            </p>
          )}
        </div>
        <AddRow definitionId={definition.id} onAdded={refresh} />
      </div>
    </section>
  )
}

function StatusNote({ state, className = '' }: { state: EditChecklistState; className?: string }) {
  if (state.status === 'idle') return null
  return (
    <p
      aria-live="polite"
      className={`text-xs ${state.status === 'success' ? 'text-green-600' : 'text-error'} ${className}`}
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
  const [savedName, setSavedName] = useState(definition.name)
  const [savedTargetRole, setSavedTargetRole] = useState<TargetRole>(definition.targetRole)
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const ids = useId()

  const dirty = name.trim() !== savedName || targetRole !== savedTargetRole

  function save() {
    if (!name.trim()) {
      setState({ status: 'error', message: 'Name cannot be empty.' })
      return
    }
    startTransition(async () => {
      const result = await updateChecklistDefinition({ definitionId: definition.id, name, targetRole })
      setState(result)
      if (result.status === 'success') {
        setSavedName(name.trim())
        setSavedTargetRole(targetRole)
        onChanged()
      }
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setChecklistDefinitionActive({
        definitionId: definition.id,
        isActive: !definition.isActive,
      })
      setState(result)
      if (result.status === 'success') onChanged()
    })
  }

  return (
    <details className="mb-5 rounded-lg border border-gray-200 bg-gray-50" open={false}>
      <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-gray-600 marker:text-primary">
        Checklist settings <span className="font-normal text-gray-400">(name, audience and status)</span>
      </summary>
      <div className="border-t border-gray-200 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={`${ids}-name`} className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Checklist name
            </label>
            <input
              id={`${ids}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="sm:w-44">
            <label htmlFor={`${ids}-role`} className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Completed by
            </label>
            <select
              id={`${ids}-role`}
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value as TargetRole)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              {TARGET_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending || !dirty} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50">
            {pending && <Spinner />}
            Save settings
          </button>
          <button type="button" onClick={toggleActive} disabled={pending} className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${definition.isActive ? 'border-error/40 text-error hover:bg-error hover:text-white focus:ring-error/20' : 'border-green-500/40 text-green-600 hover:bg-green-500 hover:text-white focus:ring-green-500/20'}`}>
            <span className="material-symbols-outlined text-sm" aria-hidden="true">{definition.isActive ? 'delete' : 'restore'}</span>
            {definition.isActive ? 'Deactivate checklist' : 'Restore checklist'}
          </button>
          <StatusNote state={state} />
        </div>
      </div>
    </details>
  )
}

function ItemRow({
  item,
  index,
  isFirst,
  isLast,
  onSaved,
}: {
  item: EditableItem
  index: number
  isFirst: boolean
  isLast: boolean
  onSaved: () => void
}) {
  const [label, setLabel] = useState(item.label)
  const [helpText, setHelpText] = useState(item.helpText ?? '')
  const [itemType, setItemType] = useState<ItemType>(item.itemType)
  const [responseOptions, setResponseOptions] = useState<ResponseOptions>(item.responseOptions)
  const [isPhotoRequired, setIsPhotoRequired] = useState(item.isPhotoRequired)
  const [saved, setSaved] = useState({
    label: item.label,
    helpText: item.helpText ?? '',
    itemType: item.itemType,
    responseOptions: item.responseOptions,
    isPhotoRequired: item.isPhotoRequired,
  })
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ids = useId()

  const textDirty = label.trim() !== saved.label || (helpText.trim() || '') !== saved.helpText
  const fieldsDirty = itemType !== saved.itemType || responseOptions !== saved.responseOptions || isPhotoRequired !== saved.isPhotoRequired
  const dirty = textDirty || fieldsDirty

  function save() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Question text cannot be empty.' })
      return
    }
    startTransition(async () => {
      if (textDirty) {
        const result = await updateChecklistItemText({ itemId: item.id, label, helpText })
        if (result.status !== 'success') {
          setState(result)
          return
        }
      }
      if (fieldsDirty) {
        const result = await updateChecklistItemFields({ itemId: item.id, itemType, responseOptions, isPhotoRequired })
        if (result.status !== 'success') {
          setState(result)
          return
        }
      }
      setState({ status: 'success', message: 'Saved — this checklist now uses your updated question.' })
      setSaved({
        label: label.trim(),
        helpText: helpText.trim(),
        itemType,
        responseOptions,
        isPhotoRequired,
      })
      onSaved()
    })
  }

  function move(direction: 'up' | 'down') {
    startTransition(async () => {
      const result = await moveChecklistItem({ itemId: item.id, direction })
      setState(result)
      if (result.status === 'success') onSaved()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteChecklistItem({ itemId: item.id })
      setState(result)
      if (result.status === 'success') onSaved()
    })
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4" aria-label={`Question ${index + 1}`}>
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center gap-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
          <div className="flex flex-col">
            <button type="button" onClick={() => move('up')} disabled={pending || isFirst} title="Move question up" aria-label="Move question up" className="rounded p-0.5 text-gray-400 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-30">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">keyboard_arrow_up</span>
            </button>
            <button type="button" onClick={() => move('down')} disabled={pending || isLast} title="Move question down" aria-label="Move question down" className="rounded p-0.5 text-gray-400 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-30">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">keyboard_arrow_down</span>
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <label htmlFor={`${ids}-question`} className="text-xs font-semibold uppercase tracking-wide text-gray-600">Question {index + 1}</label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input id={`${ids}-question`} value={label} onChange={(event) => setLabel(event.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" placeholder="Write the question people will answer" />
            <button type="button" onClick={save} disabled={pending || !dirty} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? <><Spinner /> Saving…</> : state.status === 'success' && !dirty ? <><span className="material-symbols-outlined text-base" aria-hidden="true">check</span> Saved</> : 'Save question'}
            </button>
          </div>
          <StatusNote state={state} className="mt-2" />

          <details className="mt-3 border-t border-gray-100 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">Advanced settings <span className="text-gray-400">(help text, answer type, photo and remove)</span></summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={`${ids}-help`} className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Help text <span className="normal-case tracking-normal text-gray-400">(optional)</span></label>
                <input id={`${ids}-help`} value={helpText} onChange={(event) => setHelpText(event.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" placeholder="Extra guidance shown under this question" />
              </div>
              <div>
                <label htmlFor={`${ids}-type`} className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Answer type</label>
                <select id={`${ids}-type`} value={itemType} onChange={(event) => setItemType(event.target.value as ItemType)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15">
                  <option value="radio">Yes / No</option>
                  <option value="text">Free text</option>
                  <option value="file">File upload</option>
                </select>
              </div>
              <div>
                <label htmlFor={`${ids}-options`} className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Response choices</label>
                <select id={`${ids}-options`} value={responseOptions} onChange={(event) => setResponseOptions(event.target.value as ResponseOptions)} disabled={itemType !== 'radio'} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="yes_no">Yes / No</option>
                  <option value="yes_no_na">Yes / No / N/A</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
                <input type="checkbox" checked={isPhotoRequired} onChange={(event) => setIsPhotoRequired(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                Require a photo with this answer
              </label>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                {confirmDelete ? (
                  <>
                    <span className="text-xs text-gray-600">Remove this question?</span>
                    <button type="button" onClick={remove} disabled={pending} className="rounded-md bg-error px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-50">Yes, remove</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50">Cancel</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-error focus:outline-none focus:ring-2 focus:ring-error/20 disabled:opacity-50"><span className="material-symbols-outlined text-sm" aria-hidden="true">delete</span> Remove question</button>
                )}
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  )
}

function AddRow({ definitionId, onAdded }: { definitionId: string; onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [helpText, setHelpText] = useState('')
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()
  const ids = useId()

  function add() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Question text cannot be empty.' })
      return
    }
    startTransition(async () => {
      const result = await addChecklistItem({ definitionId, label, helpText })
      setState(result)
      if (result.status === 'success') {
        setLabel('')
        setHelpText('')
        onAdded()
      }
    })
  }

  return (
    <section className="mt-5 rounded-xl border border-dashed border-primary/45 bg-primary/5 p-4" aria-label="Add a question">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-primary"><span className="material-symbols-outlined" aria-hidden="true">add_circle</span> Add a question</div>
      <label htmlFor={`${ids}-new-question`} className="sr-only">New question</label>
      <input id={`${ids}-new-question`} value={label} onChange={(event) => setLabel(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" placeholder="Write a new question" />
      <label htmlFor={`${ids}-new-help`} className="sr-only">Optional help text</label>
      <input id={`${ids}-new-help`} value={helpText} onChange={(event) => setHelpText(event.target.value)} className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" placeholder="Add help text (optional)" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50">
          {pending && <Spinner />}
          {pending ? 'Adding…' : 'Add question'}
        </button>
        <StatusNote state={state} />
      </div>
    </section>
  )
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
}
