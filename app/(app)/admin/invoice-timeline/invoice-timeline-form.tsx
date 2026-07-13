'use client'

import { useActionState, useEffect, useState } from 'react'
import { setInvoiceTimelineAction, type SetInvoiceTimelineState } from '@/actions/projects'
import { lastStepN, workflowRoleLabel } from '@/lib/workflow'
import { useWorkflowSteps } from '@/app/_components/workflow-steps-provider'

const INITIAL: SetInvoiceTimelineState = { status: 'idle' }

export default function InvoiceTimelineForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(setInvoiceTimelineAction, INITIAL)
  const steps = useWorkflowSteps()
  // v2.0 quick task 260713-rb2: re-keyed from the deleted 'invoice_timeline'
  // to the merged 'invoice_upload' step (part 2 of its 2-part wizard).
  const invoiceTimelineN = steps.find((s) => s.key === 'invoice_upload')?.n ?? 0
  // Every step after the merged Invoice & Delivery Timeline step itself.
  const remainingSteps = steps.filter((s) => s.n > invoiceTimelineN)
  const lastN = lastStepN(steps)
  const [deadlines, setDeadlines] = useState<Record<number, string>>({})
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function bounds(stepN: number): { min?: string; max?: string } {
    let min: string | undefined
    let max: string | undefined
    for (const s of remainingSteps) {
      const v = deadlines[s.n]
      if (!v) continue
      if (s.n < stepN) min = !min || v > min ? v : min
      if (s.n > stepN && (!max || v < max)) max = v
    }
    return { min, max }
  }

  function labelOf(n: number) {
    const s = remainingSteps.find((x) => x.n === n)
    return s ? `${s.n}. ${s.label}` : `step ${n}`
  }

  function onChange(stepN: number, value: string) {
    if (value) {
      const { min, max } = bounds(stepN)
      if (min && value < min) {
        const earlier = remainingSteps.filter((s) => s.n < stepN && deadlines[s.n] === min)[0]
        setToast(
          `"${labelOf(stepN)}" can't be due before "${labelOf(earlier?.n ?? stepN)}". Later steps must come on or after earlier ones.`,
        )
        return
      }
      if (max && value > max) {
        const later = remainingSteps.filter((s) => s.n > stepN && deadlines[s.n] === max)[0]
        setToast(
          `"${labelOf(stepN)}" can't be due after "${labelOf(later?.n ?? stepN)}". Earlier steps must come on or before later ones.`,
        )
        return
      }
    }
    setDeadlines((prev) => {
      const next = { ...prev }
      if (value) next[stepN] = value
      else delete next[stepN]
      return next
    })
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <form action={action} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <input type="hidden" name="projectId" value={projectId} />

      <div>
        <label className={labelCls}>Final delivery deadline</label>
        <input name="deliveryDate" type="date" required className={inputCls} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-700">Per-step deadlines</p>
        <p className="mb-3 text-[11px] text-gray-500">
          Optional — set a target date for each remaining step ({invoiceTimelineN + 1}–{lastN}). A
          later step can&apos;t be due before an earlier one.
        </p>
        <div className="space-y-2">
          {remainingSteps.map((s) => {
            const { min, max } = bounds(s.n)
            return (
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
                  value={deadlines[s.n] ?? ''}
                  min={min}
                  max={max}
                  onChange={(e) => onChange(s.n, e.target.value)}
                  className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
              </div>
            )
          })}
        </div>
      </div>

      {state.status === 'error' && <p className="text-sm text-error">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {pending && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {pending ? 'Saving…' : 'Set Timeline'}
      </button>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-sm rounded-lg border border-red-200 bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </form>
  )
}
