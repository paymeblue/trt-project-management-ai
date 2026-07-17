'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
  checklistResponses,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { advanceOrConfirmDualRole } from '@/actions/workflow'
import { getLiveWorkflowSteps, assigneeGatedRoles, getStepAssigneeGate } from '@/lib/workflow-graph'
import {
  REQUIRED_PHOTOS,
  canEditChecklist,
  findStep,
  canActOnGraphStep,
  missingConditionalPhotos,
  missingRequiredAnswers,
  FM_READINESS_SLUG,
  type UserRole,
  type WorkflowRole,
} from '@/lib/workflow'

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
  // Quick task 260717-cl0: per-item photo evidence, keyed by template item id
  // — required only for items answered "yes" on the Materials/Accessories
  // Readiness checklist (FM_READINESS_SLUG). Ignored for every other slug.
  photosByItem?: Record<string, string[]> | null
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
  const { userId, role } = await verifySession()
  const definitionId = String(input?.definitionId ?? '')
  const slug = String(input?.slug ?? '')
  const answers = input?.answers ?? {}
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.definitionId, definitionId),
        eq(checklistTemplateItems.isActive, true),
      ),
    )

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

  // Quick task 260717-cl0: per-item photo evidence — sanitize server-side,
  // never trust the client. Only meaningful for FM_READINESS_SLUG; ignored
  // (and never persisted) for every other checklist.
  const rawPhotosByItem =
    slug === FM_READINESS_SLUG && input?.photosByItem && typeof input.photosByItem === 'object'
      ? input.photosByItem
      : {}
  const photosByItem: Record<string, string[]> = {}
  for (const item of items) {
    const arr = Array.isArray(rawPhotosByItem[item.id]) ? rawPhotosByItem[item.id] : []
    photosByItem[item.id] = arr
      .filter((p) => typeof p === 'string' && p.startsWith('data:image/'))
      .slice(0, 1)
  }
  const itemPhotosFlat = Object.values(photosByItem).flat()
  if (itemPhotosFlat.some((p) => p.length > MAX_PHOTO_DATA)) {
    return { status: 'error', message: 'One of the photos is too large. Please retake it.' }
  }

  // Quick task 260717-cl0: authoritative server-side gates for the Materials/
  // Accessories Readiness checklist — never trust the client's Next/Submit
  // gating. No-ops for every other slug (both helpers short-circuit).
  const missingAnswers = missingRequiredAnswers(slug, items, answers)
  if (missingAnswers.length > 0) {
    return {
      status: 'error',
      message: 'Answer the Material and Accessories readiness items before submitting.',
    }
  }
  const missingPhotos = missingConditionalPhotos(slug, items, answers, photosByItem)
  if (missingPhotos.length > 0) {
    return {
      status: 'error',
      message: 'Attach a photo for each item you answered "yes".',
    }
  }

  // Step-linked submissions must be authorized against the live workflow graph
  // server-side — the client's slug/step pairing is never trusted.
  if (projectId && input?.expectedStepN) {
    const steps = await getLiveWorkflowSteps()
    const step = findStep(steps, Number(input.expectedStepN))
    if (!step || step.slug !== slug || !canActOnGraphStep(step, role as UserRole)) {
      return {
        status: 'error',
        message: 'You are not authorized to submit this checklist for this step.',
      }
    }
    // Quick task 260716-h0i: real server-side enforcement — only the site_pm
    // assigned via ops_design_confirmation may act on this project's gated
    // steps. No-op for any other role/step (e.g. a factory_pm on their own
    // half of a dual-role step).
    if (assigneeGatedRoles(step.key).includes(role as WorkflowRole)) {
      const gateUserId = await getStepAssigneeGate('live', projectId, step.key)
      if (gateUserId && gateUserId !== userId) {
        return {
          status: 'error',
          message: 'This step is assigned to a specific Site PM for this project.',
        }
      }
    }
  }

  try {
    // Quick task 260717-cl0: per-item photos flatten into the existing
    // `checklists.photoData` array alongside any bulk photos, matching the
    // current base64 storage shape — evidence stays saved either way.
    const allPhotos = [...photos, ...itemPhotosFlat]
    const [created] = await db
      .insert(checklists)
      .values({
        definitionId,
        projectId,
        createdBy: userId,
        status: 'submitted',
        submittedAt: new Date(),
        photoData: allPhotos.length > 0 ? allPhotos : null,
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
    advanced = await advanceOrConfirmDualRole({
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
  if (!canEditChecklist(role)) {
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

// ── Full authoring CRUD (super_admin only, REQ-G01) ───────────────────────
// Deletes are soft (is_active = false): checklist_responses reference template
// items and checklists reference definitions, and the platform is a permanent
// record — nothing is ever hard-deleted.

const ITEM_TYPES = ['radio', 'text', 'file'] as const
const RESPONSE_OPTIONS = ['yes_no', 'yes_no_na'] as const
const TARGET_ROLES = ['factory_pm', 'site_pm', 'both'] as const
type ItemType = (typeof ITEM_TYPES)[number]
type ResponseOptions = (typeof RESPONSE_OPTIONS)[number]
type TargetRole = (typeof TARGET_ROLES)[number]

const asItemType = (v: unknown): ItemType | null =>
  ITEM_TYPES.includes(v as ItemType) ? (v as ItemType) : null
const asResponseOptions = (v: unknown): ResponseOptions | null =>
  RESPONSE_OPTIONS.includes(v as ResponseOptions) ? (v as ResponseOptions) : null
const asTargetRole = (v: unknown): TargetRole | null =>
  TARGET_ROLES.includes(v as TargetRole) ? (v as TargetRole) : null

// Loads a template item and asserts the caller may edit its definition.
async function authorizeItemEdit(itemId: string) {
  const [item] = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.id, itemId))
    .limit(1)
  if (!item) return { error: 'Question not found.' as const }
  const auth = await authorizeChecklistEdit(item.definitionId)
  if ('error' in auth) return { error: auth.error }
  return { item, def: auth.def }
}

export type DeleteChecklistItemInput = { itemId: string }

export async function deleteChecklistItem(
  input: DeleteChecklistItemInput,
): Promise<EditChecklistState> {
  const itemId = String(input?.itemId ?? '')
  if (!itemId) return { status: 'error', message: 'Missing item.' }
  const auth = await authorizeItemEdit(itemId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  try {
    await db
      .update(checklistTemplateItems)
      .set({ isActive: false })
      .where(eq(checklistTemplateItems.id, itemId))
  } catch {
    return { status: 'error', message: 'Could not delete the question. Please try again.' }
  }

  revalidatePath(`/checklists/${auth.def.slug}`)
  revalidatePath('/admin/checklists')
  return { status: 'success', message: 'Question removed.' }
}

export type MoveChecklistItemInput = { itemId: string; direction: 'up' | 'down' }

export async function moveChecklistItem(
  input: MoveChecklistItemInput,
): Promise<EditChecklistState> {
  const itemId = String(input?.itemId ?? '')
  const direction = input?.direction === 'up' ? 'up' : 'down'
  if (!itemId) return { status: 'error', message: 'Missing item.' }
  const auth = await authorizeItemEdit(itemId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  // Swap (step, sort_order) with the adjacent active item so the change is
  // reflected under the wizard's `order by step, sort_order` read.
  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.definitionId, auth.item.definitionId),
        eq(checklistTemplateItems.isActive, true),
      ),
    )
    .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder))

  const idx = items.findIndex((i) => i.id === itemId)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) {
    return { status: 'error', message: 'That question is already at the edge.' }
  }
  const a = items[idx]
  const b = items[swapIdx]

  try {
    await db
      .update(checklistTemplateItems)
      .set({ step: b.step, sortOrder: b.sortOrder })
      .where(eq(checklistTemplateItems.id, a.id))
    await db
      .update(checklistTemplateItems)
      .set({ step: a.step, sortOrder: a.sortOrder })
      .where(eq(checklistTemplateItems.id, b.id))
  } catch {
    return { status: 'error', message: 'Could not reorder. Please try again.' }
  }

  revalidatePath(`/checklists/${auth.def.slug}`)
  revalidatePath('/admin/checklists')
  return { status: 'success', message: 'Order updated.' }
}

export type UpdateChecklistItemFieldsInput = {
  itemId: string
  itemType?: string
  responseOptions?: string
  isPhotoRequired?: boolean
}

export async function updateChecklistItemFields(
  input: UpdateChecklistItemFieldsInput,
): Promise<EditChecklistState> {
  const itemId = String(input?.itemId ?? '')
  if (!itemId) return { status: 'error', message: 'Missing item.' }
  const auth = await authorizeItemEdit(itemId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  const itemType = asItemType(input?.itemType) ?? auth.item.itemType
  const responseOptions = asResponseOptions(input?.responseOptions) ?? auth.item.responseOptions
  const isPhotoRequired =
    typeof input?.isPhotoRequired === 'boolean' ? input.isPhotoRequired : auth.item.isPhotoRequired

  try {
    await db
      .update(checklistTemplateItems)
      .set({
        itemType,
        responseOptions,
        isPhotoRequired,
        // A required photo must also be allowed.
        isPhotoAllowed: isPhotoRequired ? true : auth.item.isPhotoAllowed,
      })
      .where(eq(checklistTemplateItems.id, itemId))
  } catch {
    return { status: 'error', message: 'Could not save the change. Please try again.' }
  }

  revalidatePath(`/checklists/${auth.def.slug}`)
  revalidatePath('/admin/checklists')
  return { status: 'success', message: 'Saved.' }
}

// ── Definition CRUD ────────────────────────────────────────────────────────

export type CreateChecklistDefinitionInput = {
  name: string
  slug: string
  targetRole: string
}

export async function createChecklistDefinition(
  input: CreateChecklistDefinitionInput,
): Promise<EditChecklistState & { slug?: string }> {
  const { role } = await verifySession()
  if (!canEditChecklist(role)) {
    return { status: 'error', message: 'You do not have permission to create checklists.' }
  }

  const name = String(input?.name ?? '').trim()
  const slug = String(input?.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const targetRole = asTargetRole(input?.targetRole)

  if (!name) return { status: 'error', message: 'Name is required.' }
  if (name.length > MAX_LABEL) return { status: 'error', message: 'That name is too long.' }
  if (!slug) {
    return { status: 'error', message: 'A valid slug is required (letters, numbers, underscores).' }
  }
  if (!targetRole) return { status: 'error', message: 'Choose who this checklist is for.' }

  const [existing] = await db
    .select({ id: checklistDefinitions.id })
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, slug))
    .limit(1)
  if (existing) return { status: 'error', message: 'A checklist with that slug already exists.' }

  try {
    await db.insert(checklistDefinitions).values({ name, slug, targetRole })
  } catch {
    return { status: 'error', message: 'Could not create the checklist. Please try again.' }
  }

  revalidatePath('/admin/checklists')
  return { status: 'success', message: 'Checklist created.', slug }
}

export type UpdateChecklistDefinitionInput = {
  definitionId: string
  name?: string
  targetRole?: string
}

export async function updateChecklistDefinition(
  input: UpdateChecklistDefinitionInput,
): Promise<EditChecklistState> {
  const definitionId = String(input?.definitionId ?? '')
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }
  const auth = await authorizeChecklistEdit(definitionId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  const name = input?.name !== undefined ? String(input.name).trim() : auth.def.name
  const targetRole = asTargetRole(input?.targetRole) ?? auth.def.targetRole

  if (!name) return { status: 'error', message: 'Name cannot be empty.' }
  if (name.length > MAX_LABEL) return { status: 'error', message: 'That name is too long.' }

  try {
    await db
      .update(checklistDefinitions)
      .set({ name, targetRole })
      .where(eq(checklistDefinitions.id, definitionId))
  } catch {
    return { status: 'error', message: 'Could not save the change. Please try again.' }
  }

  revalidatePath('/admin/checklists')
  revalidatePath(`/checklists/${auth.def.slug}`)
  return { status: 'success', message: 'Saved.' }
}

export type SetChecklistDefinitionActiveInput = {
  definitionId: string
  isActive: boolean
}

export async function setChecklistDefinitionActive(
  input: SetChecklistDefinitionActiveInput,
): Promise<EditChecklistState> {
  const definitionId = String(input?.definitionId ?? '')
  if (!definitionId) return { status: 'error', message: 'Missing checklist.' }
  const auth = await authorizeChecklistEdit(definitionId)
  if ('error' in auth) return { status: 'error', message: auth.error }

  const isActive = Boolean(input?.isActive)
  try {
    await db
      .update(checklistDefinitions)
      .set({ isActive })
      .where(eq(checklistDefinitions.id, definitionId))
  } catch {
    return { status: 'error', message: 'Could not update the checklist. Please try again.' }
  }

  revalidatePath('/admin/checklists')
  revalidatePath(`/checklists/${auth.def.slug}`)
  return { status: 'success', message: isActive ? 'Checklist restored.' : 'Checklist deactivated.' }
}
