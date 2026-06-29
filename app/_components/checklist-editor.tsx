'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateChecklistItemText,
  addChecklistItem,
  type EditChecklistState,
} from '@/actions/checklists'

export type EditableItem = {
  id: string
  label: string
  helpText: string | null
}

export default function ChecklistEditor({
  definitionId,
  items,
}: {
  definitionId: string
  items: EditableItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

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
          <p className="mb-4 text-xs text-gray-500">
            Update the wording of any question, or add a new one. Changes apply to every
            future submission of this checklist.
          </p>
          <div className="space-y-3">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onSaved={() => router.refresh()} />
            ))}
          </div>
          <AddRow definitionId={definitionId} onAdded={() => router.refresh()} />
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

function ItemRow({ item, onSaved }: { item: EditableItem; onSaved: () => void }) {
  const [label, setLabel] = useState(item.label)
  const [helpText, setHelpText] = useState(item.helpText ?? '')
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  const dirty = label.trim() !== item.label || (helpText.trim() || '') !== (item.helpText ?? '')

  function save() {
    if (!label.trim()) {
      setState({ status: 'error', message: 'Question text cannot be empty.' })
      return
    }
    startTransition(async () => {
      const res = await updateChecklistItemText({ itemId: item.id, label, helpText })
      setState(res)
      if (res.status === 'success') onSaved()
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3">
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
        <StatusNote state={state} />
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
