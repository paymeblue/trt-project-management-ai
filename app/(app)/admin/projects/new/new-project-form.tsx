'use client'

import { useActionState } from 'react'
import { createProjectAction, type CreateProjectState } from '@/actions/projects'
import { WORKFLOW_STEPS, FIRST_ACTION_STEP, LAST_STEP, workflowRoleLabel } from '@/lib/workflow'

const INITIAL: CreateProjectState = { status: 'idle' }

// Steps Operations can set a deadline for (step 1 auto-completes at creation).
const ACTIONABLE_STEPS = WORKFLOW_STEPS.filter((s) => s.n >= FIRST_ACTION_STEP)

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
        <label className={labelCls}>Final delivery deadline</label>
        <input name="deliveryDate" type="date" required className={inputCls} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">Per-step deadlines</p>
        <p className="mb-3 text-[11px] text-gray-500">
          Optional — set a target date for each step so each role is accountable to its own
          deadline (steps {FIRST_ACTION_STEP}–{LAST_STEP}).
        </p>
        <div className="space-y-2">
          {ACTIONABLE_STEPS.map((s) => (
            <div key={s.n} className="flex items-center gap-3">
              <label htmlFor={`deadline_${s.n}`} className="min-w-0 flex-1 text-xs text-gray-600">
                <span className="font-medium text-gray-800">
                  {s.n}. {s.label}
                </span>
                <span className="text-gray-400"> · {workflowRoleLabel(s.role)}</span>
              </label>
              <input
                id={`deadline_${s.n}`}
                name={`deadline_${s.n}`}
                type="date"
                className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
              />
            </div>
          ))}
        </div>
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
