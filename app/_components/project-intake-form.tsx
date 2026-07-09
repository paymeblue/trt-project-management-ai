'use client'

import { useActionState } from 'react'
import { createProjectIntentAction, type CreateProjectIntentState } from '@/actions/projects'

const INITIAL: CreateProjectIntentState = { status: 'idle' }

export default function ProjectIntakeForm() {
  const [state, action, pending] = useActionState(createProjectIntentAction, INITIAL)

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <form action={action} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <label className={labelCls}>Project name</label>
        <input name="name" required minLength={2} placeholder="e.g. Usuma Renovation" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Customer name</label>
        <input name="customerName" required placeholder="e.g. John Doe" className={inputCls} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Customer email</label>
          <input name="customerEmail" type="email" placeholder="e.g. john@example.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Customer phone</label>
          <input name="customerPhone" type="tel" placeholder="e.g. +234 800 000 0000" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Location</label>
        <input name="location" placeholder="e.g. 6 Gold Street, Victoria Island, Lagos" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Scope</label>
        <textarea
          name="scope"
          rows={4}
          placeholder="What does the client want? Rooms, furniture types, any special requests…"
          className={inputCls}
        />
      </div>

      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
        This project starts as <span className="font-semibold text-gray-700">unpaid</span>. Head of
        Operations will confirm payment and set the timeline next.
      </p>

      {state.status === 'error' && <p className="text-sm text-error">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  )
}
