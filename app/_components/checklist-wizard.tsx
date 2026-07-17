'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  submitChecklistAction,
  type ChecklistAnswer,
  type SubmitChecklistState,
} from '@/actions/checklists'
import { downscaleImage } from '@/lib/downscale-image'
import { FM_READINESS_SLUG, missingConditionalPhotos, missingRequiredAnswers } from '@/lib/workflow'

export type WizardItem = {
  id: string
  label: string
  helpText: string | null
  itemType: 'radio' | 'text' | 'file'
  responseOptions: 'yes_no' | 'yes_no_na' | null
  step: number
  sectionTitle: string | null
}

type Group = { step: number; title: string | null; items: WizardItem[] }

const INITIAL: SubmitChecklistState = { status: 'idle' }

export default function ChecklistWizard({
  definitionId,
  slug,
  items,
  projectId = null,
  expectedStepN = null,
  returnTo = null,
  requirePhotos = 0,
}: {
  definitionId: string
  slug: string
  items: WizardItem[]
  projectId?: string | null
  expectedStepN?: number | null
  returnTo?: string | null
  requirePhotos?: number
}) {
  const router = useRouter()
  const [stepIdx, setStepIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [photoError, setPhotoError] = useState('')
  // Quick task 260717-cl0: per-item photo evidence for the Materials/
  // Accessories Readiness checklist — capped at 1 photo per item, only
  // required when that item is answered "yes". Scoped entirely to
  // FM_READINESS_SLUG; every other checklist keeps the bulk `photos` flow.
  const [photosByItem, setPhotosByItem] = useState<Record<string, string[]>>({})
  const [itemPhotoError, setItemPhotoError] = useState<Record<string, string>>({})
  const [state, dispatch, pending] = useActionState(submitChecklistAction, INITIAL)

  // When this checklist was opened from a project workflow step and the step
  // advanced, return the user to their project board.
  useEffect(() => {
    if (state.status === 'success' && state.advanced && returnTo) {
      const t = setTimeout(() => router.push(returnTo), 1200)
      return () => clearTimeout(t)
    }
  }, [state.status, state.advanced, returnTo, router])

  // Group items by their `step`, preserving order. If everything is on one step,
  // fall back to one item per page so small checklists still feel like a wizard.
  const groups = useMemo<Group[]>(() => {
    const byStep = new Map<number, Group>()
    for (const it of items) {
      const g = byStep.get(it.step)
      if (g) g.items.push(it)
      else byStep.set(it.step, { step: it.step, title: it.sectionTitle, items: [it] })
    }
    const list = [...byStep.values()].sort((a, b) => a.step - b.step)
    if (list.length <= 1 && items.length > 1) {
      return items.map((it) => ({ step: it.step, title: it.sectionTitle, items: [it] }))
    }
    return list
  }, [items])

  const total = groups.length
  const isLast = stepIdx === total - 1
  const group = groups[stepIdx]

  const progress = useMemo(
    () => (total === 0 ? 0 : Math.round(((stepIdx + 1) / total) * 100)),
    [stepIdx, total],
  )

  // Quick task 260717-cl0: shared gating helpers (lib/workflow.ts) — no-ops
  // for every slug other than FM_READINESS_SLUG. Computed above the early
  // returns below so these hooks always run in the same order every render.
  const missingPhotoIds = useMemo(
    () => missingConditionalPhotos(slug, items, answers, photosByItem),
    [slug, items, answers, photosByItem],
  )
  const missingAnswerIds = useMemo(
    () => missingRequiredAnswers(slug, items, answers),
    [slug, items, answers],
  )

  if (total === 0) {
    return <p className="text-sm text-gray-400">No items configured yet for this checklist.</p>
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
        <span className="material-symbols-outlined text-4xl text-green-600">check_circle</span>
        <p className="mt-2 text-base font-semibold text-gray-900">Checklist submitted</p>
        <p className="mt-1 text-sm text-gray-500">
          {state.advanced
            ? 'This step is complete — the project moves to the next step. Returning to your projects…'
            : 'Your responses were recorded. See “Your submissions” below.'}
        </p>
        {state.advanced && returnTo && (
          <a href={returnTo} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
            Back to projects
          </a>
        )}
      </div>
    )
  }

  function setAnswer(id: string, patch: Partial<ChecklistAnswer>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function optsFor(item: WizardItem): Array<'yes' | 'no' | 'na'> {
    return item.responseOptions === 'yes_no_na' ? ['yes', 'no', 'na'] : ['yes', 'no']
  }

  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('')
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file
    for (const file of files) {
      if (photos.length >= 6) break
      try {
        const data = await downscaleImage(file, 1280, 0.8)
        setPhotos((prev) => (prev.length >= 6 ? prev : [...prev, data]))
      } catch {
        setPhotoError('Could not read one of the images. Please try another.')
      }
    }
  }

  // Quick task 260717-cl0: per-item photo capture for the Materials/
  // Accessories Readiness checklist — capped at 1 photo per item.
  async function onItemPhoto(itemId: string, e: React.ChangeEvent<HTMLInputElement>) {
    setItemPhotoError((prev) => ({ ...prev, [itemId]: '' }))
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      const data = await downscaleImage(file, 1280, 0.8)
      setPhotosByItem((prev) => ({ ...prev, [itemId]: [data] }))
    } catch {
      setItemPhotoError((prev) => ({
        ...prev,
        [itemId]: 'Could not read this image. Please try another.',
      }))
    }
  }

  const photosNeeded = Math.max(0, requirePhotos - photos.length)
  const photosOk = photos.length >= requirePhotos

  const labelById = (id: string) => items.find((i) => i.id === id)?.label ?? ''
  const currentStepMissingAnswer = group.items.some((it) => missingAnswerIds.includes(it.id))
  const currentStepMissingPhoto = group.items.some((it) => missingPhotoIds.includes(it.id))
  const submitGated = missingAnswerIds.length > 0 || missingPhotoIds.length > 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      {/* Progress */}
      <div className="mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>
            Step {stepIdx + 1} of {total}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {group.title && (
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-primary">{group.title}</h2>
      )}

      <div className="space-y-6">
        {group.items.map((item) => {
          const current = answers[item.id] ?? {}
          return (
            <fieldset key={item.id} className="border-b border-gray-100 pb-4 last:border-0">
              <legend className="text-sm font-medium text-gray-900">{item.label}</legend>
              {item.helpText && <p className="mt-1 text-xs text-gray-400">{item.helpText}</p>}

              <div className="mt-3">
                {item.itemType === 'text' ? (
                  <input
                    value={current.textValue ?? ''}
                    onChange={(e) => setAnswer(item.id, { textValue: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    placeholder="Your answer"
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
                          className={`rounded-full border px-4 py-1.5 text-sm transition ${
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
                  className="mt-3 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
                  placeholder="Notes (optional)"
                />

                {/* Quick task 260717-cl0: per-item photo evidence, gated on this
                    item being answered "yes" — scoped to the Materials/
                    Accessories Readiness checklist only. */}
                {slug === FM_READINESS_SLUG && current.value === 'yes' && (
                  <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-900">
                      Photo evidence <span className="text-error">*</span>
                    </p>
                    {(photosByItem[item.id]?.length ?? 0) > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(photosByItem[item.id] ?? []).map((p, i) => (
                          <div key={i} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p}
                              alt={`${item.label} evidence`}
                              className="h-16 w-16 rounded-md border border-gray-200 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPhotosByItem((prev) => ({ ...prev, [item.id]: [] }))
                              }
                              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                              title="Remove"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary">
                        <span className="material-symbols-outlined text-base">add_a_photo</span>
                        Add photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onItemPhoto(item.id, e)}
                        />
                      </label>
                    )}
                    {itemPhotoError[item.id] && (
                      <p className="mt-1 text-xs text-error">{itemPhotoError[item.id]}</p>
                    )}
                  </div>
                )}

                {slug === FM_READINESS_SLUG && missingAnswerIds.includes(item.id) && (
                  <p className="mt-2 text-xs text-error">Answer this item before continuing.</p>
                )}
              </div>
            </fieldset>
          )
        })}
      </div>

      {/* Required photo evidence — only on the final step */}
      {isLast && requirePhotos > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Photo evidence <span className="text-error">*</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Attach {requirePhotos} photos to submit this checklist.
            {photosOk ? ' ✓ Done.' : ` ${photosNeeded} more needed.`}
          </p>

          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt={`Evidence ${i + 1}`} className="h-20 w-20 rounded-md border border-gray-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                    title="Remove"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < 6 && (
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary">
              <span className="material-symbols-outlined text-base">add_a_photo</span>
              Add photo
              <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotos} />
            </label>
          )}
          {photoError && <p className="mt-2 text-xs text-error">{photoError}</p>}
        </div>
      )}

      {state.status === 'error' && (
        <p className="mt-4 text-sm text-error">{state.message ?? 'Something went wrong.'}</p>
      )}

      {/* Quick task 260717-cl0: summary of what's outstanding for the
          Materials/Accessories Readiness checklist (answer-required and/or
          photo-required items), shown only when Next/Submit is blocked. */}
      {slug === FM_READINESS_SLUG && isLast && submitGated && (
        <p className="mt-4 text-sm text-error">
          {missingAnswerIds.length > 0 &&
            `Still need an answer: ${missingAnswerIds.map(labelById).join(', ')}. `}
          {missingPhotoIds.length > 0 &&
            `Still need a photo: ${missingPhotoIds.map(labelById).join(', ')}.`}
        </p>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0 || pending}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Back
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={() =>
              dispatch({ definitionId, slug, answers, projectId, expectedStepN, photos, photosByItem })
            }
            disabled={pending || !photosOk || submitGated}
            title={
              !photosOk
                ? `Attach ${requirePhotos} photos first`
                : missingAnswerIds.length > 0
                  ? 'Answer this item before continuing'
                  : missingPhotoIds.length > 0
                    ? 'Attach a photo before continuing'
                    : undefined
            }
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {pending && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {pending ? 'Submitting…' : 'Submit checklist'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIdx((s) => Math.min(total - 1, s + 1))}
            disabled={currentStepMissingAnswer || currentStepMissingPhoto}
            title={
              currentStepMissingAnswer
                ? 'Answer this item before continuing'
                : currentStepMissingPhoto
                  ? 'Attach a photo before continuing'
                  : undefined
            }
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
          >
            Next
          </button>
        )}
      </div>
    </div>
  )
}
