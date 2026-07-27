'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import {
  amendEscalatedChecklistAction,
  type EscalationPanelItem,
} from '@/actions/escalation'
import type { ChecklistAnswer } from '@/actions/checklists'
import type { EscalateResult } from '@/actions/escalation'
import { getTabToken } from '@/lib/use-tab-token'

const INITIAL: EscalateResult = { ok: false, message: '' }

type Group = { title: string | null; items: EscalationPanelItem[] }

// Quick task 260727-gow (D-03): inline, collapsed-by-default editing panel
// for one step_escalations row, rendered on /disputes/{projectId}. Mirrors
// checklist-wizard.tsx's visual language (grouped sections, pill-style
// yes/no/na, notes textarea) rather than inventing a new design system.
export default function EscalationAmendPanel({
  escalationId,
  checklistLabel,
  reason,
  stepN,
  createdAt,
  definitionName,
  items,
  initialAnswers,
  canAmend,
  amendedByName,
  amendedAt,
  hasSubmission,
}: {
  escalationId: string
  checklistLabel: string
  reason: string | null
  stepN: number | null
  createdAt: string
  definitionName: string | null
  items: EscalationPanelItem[]
  initialAnswers: Record<string, ChecklistAnswer>
  canAmend: boolean
  amendedByName: string | null
  amendedAt: string | null
  hasSubmission: boolean
}) {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>(initialAnswers)
  const [state, dispatch, pending] = useActionState(
    async () =>
      amendEscalatedChecklistAction(getTabToken(), {
        escalationId,
        answers,
      }),
    INITIAL,
  )

  const groups = useMemo<Group[]>(() => {
    const byTitle = new Map<string, Group>()
    const ungrouped: EscalationPanelItem[] = []
    for (const it of items) {
      if (!it.sectionTitle) {
        ungrouped.push(it)
        continue
      }
      const g = byTitle.get(it.sectionTitle)
      if (g) g.items.push(it)
      else byTitle.set(it.sectionTitle, { title: it.sectionTitle, items: [it] })
    }
    const list = [...byTitle.values()]
    if (ungrouped.length > 0) list.push({ title: null, items: ungrouped })
    return list
  }, [items])

  function setAnswer(id: string, patch: Partial<ChecklistAnswer>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function optsFor(item: EscalationPanelItem): Array<'yes' | 'no' | 'na'> {
    return item.responseOptions === 'yes_no_na' ? ['yes', 'no', 'na'] : ['yes', 'no']
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-gray-900">{checklistLabel}</span>
          {stepN != null && <span className="ml-2 text-xs text-gray-400">Step {stepN}</span>}
        </span>
        <span className="material-symbols-outlined text-gray-400">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4">
          {reason && (
            <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">{reason}</p>
          )}
          <p className="mb-3 text-[11px] text-gray-400">
            Escalated {new Date(createdAt).toLocaleString()}
          </p>

          {!definitionName ? (
            <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
              No inline checklist content for this escalation.
            </p>
          ) : (
            <>
              {!hasSubmission && (
                <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                  The officer has not filled this in yet — you are creating the first record.
                </p>
              )}
              {!canAmend && (
                <p className="mb-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                  Only holders of this escalation&apos;s target position and admins can update this.
                </p>
              )}

              <fieldset disabled={!canAmend} className="space-y-5 disabled:opacity-60">
                {groups.map((group, gi) => (
                  <div key={gi}>
                    {group.title && (
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                        {group.title}
                      </h3>
                    )}
                    <div className="space-y-4">
                      {group.items.map((item) => {
                        const current = answers[item.id] ?? {}
                        return (
                          <div key={item.id} className="border-b border-gray-100 pb-3 last:border-0">
                            <p className="text-sm font-medium text-gray-900">{item.label}</p>
                            {item.helpText && (
                              <p className="mt-0.5 text-xs text-gray-400">{item.helpText}</p>
                            )}
                            <div className="mt-2">
                              {item.itemType === 'text' ? (
                                <input
                                  value={current.textValue ?? ''}
                                  onChange={(e) => setAnswer(item.id, { textValue: e.target.value })}
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                                  placeholder="Answer"
                                />
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {optsFor(item).map((opt) => {
                                    const active = current.value === opt
                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setAnswer(item.id, { value: opt })}
                                        className={`rounded-full border px-3 py-1 text-xs transition ${
                                          active
                                            ? 'border-primary bg-primary text-white'
                                            : 'border-gray-300 text-gray-700 hover:border-primary'
                                        }`}
                                      >
                                        {opt === 'na' ? 'N/A' : opt === 'yes' ? 'Yes' : 'No'}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                              <input
                                value={current.notes ?? ''}
                                onChange={(e) => setAnswer(item.id, { notes: e.target.value })}
                                className="mt-2 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                                placeholder="Notes (optional)"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>

              {amendedByName && (
                <p className="mt-3 text-xs font-medium text-gray-500">
                  Amended by {amendedByName}
                  {amendedAt && <>, {new Date(amendedAt).toLocaleString()}</>}
                </p>
              )}

              {canAmend && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => dispatch()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {pending ? 'Saving…' : 'Save changes'}
                  </button>
                  {state.message && (
                    <p className={`text-xs ${state.ok ? 'text-green-700' : 'text-error'}`}>
                      {state.message}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
