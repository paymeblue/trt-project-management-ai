'use client'

import { useActionState } from 'react'
import { createProjectAction, type CreateProjectState } from '@/actions/projects'

const INITIAL: CreateProjectState = { status: 'idle' }

export default function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, INITIAL)

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <form action={action} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div>
        <label className={labelCls}>Project name</label>
        <input name="name" required minLength={2} placeholder="e.g. Victoria Island Residence" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Location</label>
        <input name="location" placeholder="e.g. Lagos" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Delivery deadline</label>
        <input name="deliveryDate" type="date" required className={inputCls} />
      </div>

      {state.status === 'error' && <p className="text-sm text-error">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  )
}
