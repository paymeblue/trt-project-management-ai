'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
  checklistResponses,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { advanceProjectStep } from '@/actions/workflow'
import { REQUIRED_PHOTOS, canEditChecklist, type ChecklistTargetRole } from '@/lib/workflow'

type ResponseValue = 'yes' | 'no' | 'na'

export type ChecklistAnswer = {
  value?: ResponseValue | null
  textValue?: string | null
  notes?: string | null
}

const MAX_PHOTO_DATA = 1_500_000 // ~1.5MB per downscaled data URL

export type SubmitChecklistInput = {
  definitionId: string
  slug: string
  answers: Record<string, ChecklistAnswer>
  // Set when launched from a project workflow step — ties the checklist to the
  // project and auto-advances it on success.
  projectId?: string | null
  expectedStepN?: number | null
  // Photo-evidence data URLs (required for some checklists, e.g. delivery_project).
  photos?: string[] | null
}

export type SubmitChecklistState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  // True when a project workflow step was advanced by this submission.
  advanced?: boolean
}

export async function submitChecklistAction(
  _prev: SubmitChecklistState,
  input: SubmitChecklistInput,
): Promise<SubmitChecklistState> {
  const { userId } = await verifySession()
  const definitionId = String(input?.definitionId ?? '')
  const slug = String(input?.slug ?? '')
  const answers = input?.answers ?? {}
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.definitionId, definitionId))

  if (items.length === 0) return { status: 'error', message: 'This checklist has no items.' }

  const projectId = input?.projectId ? String(input.projectId) : null

  // Required photo evidence (e.g. Delivery Project Checklist needs 2 images).
  const requiredPhotos = REQUIRED_PHOTOS[slug] ?? 0
  const photos = (Array.isArray(input?.photos) ? input.photos : [])
    .filter((p) => typeof p === 'string' && p.startsWith('data:image/'))
    .slice(0, 6)
  if (requiredPhotos > 0 && photos.length < requiredPhotos) {
    return {
      status: 'error',
      message: `Please attach ${requiredPhotos} photos before submitting this checklist.`,
    }
  }
  if (photos.some((p) => p.length > MAX_PHOTO_DATA)) {
    return { status: 'error', message: 'One of the photos is too large. Please retake it.' }
  }

  try {
    const [created] = await db
      .insert(checklists)
      .values({
        definitionId,
        projectId,
        createdBy: userId,
        status: 'submitted',
        submittedAt: new Date(),
        photoData: photos.length > 0 ? photos : null,
      })
      .returning({ id: checklists.id })

    for (const item of items) {
      const a = answers[item.id] ?? {}
      const value = a.value === 'yes' || a.value === 'no' || a.value === 'na' ? a.value : null
      await db.insert(checklistResponses).values({
        checklistId: created.id,
        templateItemId: item.id,
        value,
        textValue: a.textValue ? String(a.textValue) : null,
        notes: a.notes ? String(a.notes) : null,
      })
    }
  } catch {
    return { status: 'error', message: 'Could not save your submission. Please try again.' }
  }

  let advanced = false
  if (projectId && input?.expectedStepN) {
    advanced = await advanceProjectStep({
      projectId,
      expectedStepN: Number(input.expectedStepN),
    })
  }

  revalidatePath(`/checklists/${slug}`)
  return { status: 'success', message: 'Checklist submitted.', advanced }
}

// ── Template editing (Site PM / Factory PM) ───────────────────────────────
// PMs maintain their own checklist wording. Authorization is derived from the
// definition's `target_role` server-side — never trusted from the client.

const MAX_LABEL = 500
const MAX_HELP = 1000

export type EditChecklistState = { status: 'idle' | 'success' | 'error'; message?: string }

// Loads a definition and asserts the caller may edit it. Returns the definition
// (incl. slug for revalidation) or an error message.
async function authorizeChecklistEdit(definitionId: string) {
  const { role } = await verifySession()
  const [def] = await db
    .select()
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.id, definitionId))
    .limit(1)
  if (!def) return { error: 'Checklist not found.' as const }
  if (!canEditChecklist(role, def.targetRole as ChecklistTargetRole)) {
    return { error: 'You do not have permission to edit this checklist.' as const }
  }
  return { def }
}

export type UpdateChecklistItemTextInput = {
  itemId: string
  label: string
  helpText?: string | null
}

export async function updateChecklistItemText(
  input: UpdateChecklistItemTextInput,
): Promise<EditChecklistState> {
  const itemId = String(input?.itemId ?? '')
  const label = String(input?.label ?? '').trim()
  const helpText = input?.helpText ? String(input.helpText).trim() : null
  if (!itemId) return { status: 'error', message: 'Missing item.' }
  if (!label) return { status: 'error', message: 'Question text cannot be empty.' }
  if (label.length > MAX_LABEL || (helpText && helpText.length > MAX_HELP)) {
    return { status: 'error', message: 'That text is too long.' }
  }

  const [item] = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.id, itemId))
    .limit(1)
  if (!item) return { status: 'error', message: 'Question not found.' }

  const auth = await authorizeChecklistEdit(item.definitionId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  try {
    await db
      .update(checklistTemplateItems)
      .set({ label, helpText: helpText || null })
      .where(eq(checklistTemplateItems.id, itemId))
  } catch {
    return { status: 'error', message: 'Could not save the change. Please try again.' }
  }

  revalidatePath(`/checklists/${auth.def.slug}`)
  return { status: 'success', message: 'Saved.' }
}

export type AddChecklistItemInput = {
  definitionId: string
  label: string
  helpText?: string | null
}

export async function addChecklistItem(
  input: AddChecklistItemInput,
): Promise<EditChecklistState> {
  const definitionId = String(input?.definitionId ?? '')
  const label = String(input?.label ?? '').trim()
  const helpText = input?.helpText ? String(input.helpText).trim() : null
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }
  if (!label) return { status: 'error', message: 'Question text cannot be empty.' }
  if (label.length > MAX_LABEL || (helpText && helpText.length > MAX_HELP)) {
    return { status: 'error', message: 'That text is too long.' }
  }

  const auth = await authorizeChecklistEdit(definitionId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  // Append after the last existing item, keeping it in the last step/section.
  const existing = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.definitionId, definitionId))
  const lastStep = existing.reduce((m, i) => Math.max(m, i.step), 1)
  const lastSection =
    existing.filter((i) => i.step === lastStep).sort((a, b) => b.sortOrder - a.sortOrder)[0]
      ?.sectionTitle ?? null
  const nextSort = existing.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1

  try {
    await db.insert(checklistTemplateItems).values({
      definitionId,
      step: lastStep,
      sectionTitle: lastSection,
      sortOrder: nextSort,
      label,
      itemType: 'radio',
      responseOptions: 'yes_no',
      helpText: helpText || null,
    })
  } catch {
    return { status: 'error', message: 'Could not add the question. Please try again.' }
  }

  revalidatePath(`/checklists/${auth.def.slug}`)
  return { status: 'success', message: 'Question added.' }
}
