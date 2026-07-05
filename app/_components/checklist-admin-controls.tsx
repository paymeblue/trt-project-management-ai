'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createChecklistDefinition,
  setChecklistDefinitionActive,
  type EditChecklistState,
} from '@/actions/checklists'

type TargetRole = 'factory_pm' | 'site_pm' | 'both'

const TARGET_ROLE_OPTIONS: { value: TargetRole; label: string }[] = [
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'site_pm', label: 'Site PM' },
  { value: 'both', label: 'Both PMs' },
]

export function CreateChecklistForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [targetRole, setTargetRole] = useState<TargetRole>('factory_pm')
  const [state, setState] = useState<EditChecklistState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  function create() {
    if (!name.trim() || !slug.trim()) {
      setState({ status: 'error', message: 'Name and slug are required.' })
      return
    }
    startTransition(async () => {
      const res = await createChecklistDefinition({ name, slug, targetRole })
      setState(res)
      if (res.status === 'success' && res.slug) {
        setName('')
        setSlug('')
        router.push(`/admin/checklists?def=${res.slug}`)
        router.refresh()
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
      >
        <span className="material-symbols-outlined text-base">add</span>
        New checklist
      </button>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-base">add</span>
        Create a checklist
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="e.g. Sorting Checklist"
          />
        </div>
        <div className="flex-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Slug
          </label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
            placeholder="e.g. sorting"
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
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {pending && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setState({ status: 'idle' })
          }}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
        {state.status !== 'idle' && (
          <span
            className={`text-xs ${state.status === 'success' ? 'text-green-600' : 'text-error'}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </div>
  )
}

export function RestoreChecklistButton({ definitionId }: { definitionId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function restore() {
    startTransition(async () => {
      const res = await setChecklistDefinitionActive({ definitionId, isActive: true })
      if (res.status === 'success') router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={restore}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-green-500/40 px-2 py-1 text-xs font-semibold text-green-600 hover:bg-green-500 hover:text-white disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-sm">restore</span>
      Restore
    </button>
  )
}
