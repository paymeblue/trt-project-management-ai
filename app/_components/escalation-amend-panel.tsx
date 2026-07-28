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
import { readUploadFile, UploadFileError } from '@/lib/read-upload-file'
import { MAX_AMEND_PHOTOS } from '@/lib/photo-limits'

const INITIAL: EscalateResult = { ok: false, message: '' }

type Group = { title: string | null; items: EscalationPanelItem[] }

// Quick task 260727-gow (D-03): inline, collapsed-by-default editing panel
// for one step_escalations row, rendered on /disputes/{projectId}. Mirrors
// checklist-wizard.tsx's visual language (grouped sections, pill-style
// yes/no/na, notes textarea) rather than inventing a new design system.
export default function EscalationAmendPanel({
  escalationId,
  projectName,
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
  existingPhotos,
}: {
  escalationId: string
  projectName: string
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
  existingPhotos: string[]
}) {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>(initialAnswers)
  // Quick task 260727-ibr: newly captured, not-yet-saved photos. Existing
  // evidence (existingPhotos) is rendered read-only elsewhere and never
  // enters this state — this action has no delete/replace path either.
  const [newPhotos, setNewPhotos] = useState<string[]>([])
  const [photoError, setPhotoError] = useState('')
  const [state, dispatch, pending] = useActionState(
    async () => {
      const result = await amendEscalatedChecklistAction(getTabToken(), {
        escalationId,
        answers,
        newPhotos,
      })
      // Clear locally-staged new photos only once the save actually succeeds
      // — guards on the action result, not optimistically, so a failed save
      // keeps the photos staged for retry.
      if (result.ok) setNewPhotos([])
      return result
    },
    INITIAL,
  )

  async function onAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('')
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file
    for (const file of files) {
      if (newPhotos.length >= MAX_AMEND_PHOTOS) break
      try {
        const data = await readUploadFile(file)
        setNewPhotos((prev) => (prev.length >= MAX_AMEND_PHOTOS ? prev : [...prev, data]))
      } catch (err) {
        setPhotoError(
          err instanceof UploadFileError ? err.message : 'Could not read one of the images. Please try another.',
        )
      }
    }
  }

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
      {/* Quick task 260728-esc: project name leads the header, not the
          checklist label — a supervisor with escalations across several
          projects previously had no way to tell cards apart at a glance
          (every card said only "Delivery Project Checklist · Step 5" with
          no project attribution). Checklist label + step number demoted to
          the same muted register, middot-separated, so the header doesn't
          grow a second competing bold string. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-gray-900">{projectName}</span>
          <span className="ml-2 text-xs text-gray-400">
            {checklistLabel}
            {stepN != null && <> · Step {stepN}</>}
          </span>
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

              {/* Quick task 260727-ibr: photo evidence — existing photos are
                  read-only (this panel/action has no delete path, by design:
                  a supervisor correcting a record must never be able to
                  destroy the subordinate's evidence); new photos are staged
                  client-side only until Save. */}
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-900">
                  Photo evidence{existingPhotos.length > 0 && ` — Submitted evidence (${existingPhotos.length})`}
                </p>
                {existingPhotos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {existingPhotos.map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={p}
                        alt={`Submitted evidence ${i + 1}`}
                        className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                      />
                    ))}
                  </div>
                )}

                {canAmend && (
                  <>
                    {newPhotos.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          New — not yet saved
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {newPhotos.map((p, i) => (
                            <div key={i} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p}
                                alt={`New evidence ${i + 1}`}
                                className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => setNewPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                                title="Remove"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {newPhotos.length < MAX_AMEND_PHOTOS && (
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary">
                        <span className="material-symbols-outlined text-base">add_a_photo</span>
                        Add photo
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={onAddPhoto}
                        />
                      </label>
                    )}
                    {photoError && <p className="mt-2 text-xs text-error">{photoError}</p>}
                  </>
                )}
              </div>

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
