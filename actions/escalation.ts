'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import {
  users,
  projects,
  stepEscalations,
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
  checklistResponses,
} from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'
import { MAX_PHOTO_DATA, MAX_AMEND_PHOTOS } from '@/lib/photo-limits'
import { escalationTargetPosition, canAmendEscalation } from '@/lib/escalation'
import { userRoleLabel, type UserRole } from '@/lib/workflow'
import { notifyUser } from '@/lib/notifications'
import type { ChecklistAnswer } from '@/actions/checklists'

export type EscalateResult = { ok: boolean; message: string }

/**
 * Per-checklist escalation flag (items #9, #14). Unlike pauseProjectAction
 * (REQ-G08, broadcasts to every super admin and pauses the project), this is
 * a lightweight, single-recipient notification to the escalating user's
 * fixed superior position — the project is NOT paused, nothing blocks.
 *
 * Quick task 260727-gow: also persists a durable `step_escalations` row so
 * the target superior can act on the escalation from the dispute page (see
 * amendEscalatedChecklistAction below), not just read a notification
 * sentence. `checklistSlug`/`stepN` are optional — readiness-form escalations
 * (no checklist definition) pass `stepN` only.
 */
export async function escalateChecklistAction(tabToken: string | null, input: {
  projectId: string
  checklistLabel: string
  reason?: string | null
  checklistSlug?: string | null
  stepN?: number | null
}): Promise<EscalateResult> {
  const { userId, role } = await verifySessionForAction(tabToken)
  const projectId = String(input?.projectId ?? '')
  const checklistLabel = String(input?.checklistLabel ?? 'a checklist').trim()
  const reason = String(input?.reason ?? '').trim().slice(0, 500)
  const checklistSlug =
    typeof input?.checklistSlug === 'string' && input.checklistSlug.trim()
      ? input.checklistSlug.trim()
      : null
  const stepN = Number.isFinite(input?.stepN) ? Number(input!.stepN) : null
  if (!projectId) return { ok: false, message: 'Missing project.' }

  const targetPosition = escalationTargetPosition(role as UserRole)
  if (!targetPosition) {
    return { ok: false, message: 'No escalation path is configured for your role.' }
  }

  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { ok: false, message: 'Project not found.' }

  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.position, targetPosition), ne(users.id, userId)))

  if (recipients.length === 0) {
    return { ok: false, message: 'No one currently holds the escalation target position — nothing sent.' }
  }

  // Persist durable step identity BEFORE the notification fan-out — an
  // unroutable escalation (no recipients, handled above) must never leave an
  // orphan actionable row with nobody able to act on it.
  await db.insert(stepEscalations).values({
    projectId,
    stepN,
    checklistSlug,
    checklistLabel,
    reason: reason || null,
    targetPosition,
    createdBy: userId,
  })

  for (const r of recipients) {
    await notifyUser({
      recipientId: r.id,
      actorId: userId,
      type: 'escalation',
      title: `Escalation from ${userRoleLabel(role as UserRole)}: ${checklistLabel} on ${proj.name}`,
      body: reason || 'No additional details provided.',
      projectId,
    })
  }

  return { ok: true, message: `Escalated to ${recipients.length === 1 ? 'the assigned officer' : `${recipients.length} officers`}.` }
}

// ── Escalation panel: view + upsert (quick task 260727-gow) ────────────────
// D-01/D-02/D-03: the escalation's target-position holder (or an admin) may
// view and UPSERT the escalated checklist's content, inline on the dispute
// page. This is RECORD CORRECTION only — the project's current-step counter
// and any step-completion/state-tracking tables are never touched, and no
// step-completion function is ever called. A superior fixing a past step's
// content must never silently rewind or advance the project. (This file is
// grep-gated in CI to contain zero references to the specific
// step-advancement APIs it must stay decoupled from — see the plan's
// verification step.)

export type EscalationPanelItem = {
  id: string
  label: string
  helpText: string | null
  itemType: 'radio' | 'text' | 'file'
  responseOptions: 'yes_no' | 'yes_no_na' | null
  step: number
  sectionTitle: string | null
}

export type EscalationPanelRow = {
  id: string
  projectId: string
  stepN: number | null
  checklistSlug: string | null
  checklistLabel: string
  reason: string | null
  targetPosition: string
  createdAt: Date
  canAmend: boolean
  definitionName: string | null
  items: EscalationPanelItem[]
  hasSubmission: boolean
  initialAnswers: Record<string, ChecklistAnswer>
  amendedByName: string | null
  amendedAt: Date | null
  // Quick task 260727-ibr: existing evidence photos on the submission behind
  // this escalation, rendered read-only in the panel. Empty when there is no
  // submission yet.
  photos: string[]
}

/**
 * Server helper the dispute page calls to render one panel per escalation on
 * a project. The viewer's position is read ONCE for the whole page (not per
 * row) — position is otherwise a fresh-per-invocation read elsewhere in this
 * file because it can change between calls, but a single page render is one
 * consistent snapshot in time.
 */
export async function loadEscalationPanelData(
  projectId: string,
  viewerId: string,
  viewerRole: UserRole,
): Promise<EscalationPanelRow[]> {
  const rows = await db
    .select()
    .from(stepEscalations)
    .where(eq(stepEscalations.projectId, projectId))
    .orderBy(desc(stepEscalations.createdAt))

  if (rows.length === 0) return []

  const [viewer] = await db
    .select({ position: users.position })
    .from(users)
    .where(eq(users.id, viewerId))
    .limit(1)
  const viewerPosition = viewer?.position ?? null

  const result: EscalationPanelRow[] = []

  for (const row of rows) {
    const canAmend = canAmendEscalation(viewerRole, viewerPosition, row.targetPosition)

    let definitionName: string | null = null
    let items: EscalationPanelItem[] = []
    let hasSubmission = false
    const initialAnswers: Record<string, ChecklistAnswer> = {}
    let amendedByName: string | null = null
    let amendedAt: Date | null = null
    let photos: string[] = []

    if (row.checklistSlug) {
      const [def] = await db
        .select()
        .from(checklistDefinitions)
        .where(eq(checklistDefinitions.slug, row.checklistSlug))
        .limit(1)

      if (def) {
        definitionName = def.name

        const activeItems = await db
          .select()
          .from(checklistTemplateItems)
          .where(
            and(
              eq(checklistTemplateItems.definitionId, def.id),
              eq(checklistTemplateItems.isActive, true),
            ),
          )
          .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder))

        items = activeItems.map((i) => ({
          id: i.id,
          label: i.label,
          helpText: i.helpText,
          itemType: i.itemType,
          responseOptions: i.responseOptions,
          step: i.step,
          sectionTitle: i.sectionTitle,
        }))

        const [submission] = await db
          .select()
          .from(checklists)
          .where(and(eq(checklists.projectId, projectId), eq(checklists.definitionId, def.id)))
          .orderBy(desc(checklists.createdAt))
          .limit(1)

        if (submission) {
          hasSubmission = true
          photos = submission.photoData ?? []
          const responses = await db
            .select()
            .from(checklistResponses)
            .where(eq(checklistResponses.checklistId, submission.id))
          for (const r of responses) {
            initialAnswers[r.templateItemId] = {
              value: r.value,
              textValue: r.textValue,
              notes: r.notes,
            }
          }
          if (submission.amendedBy) {
            amendedAt = submission.amendedAt
            const [amender] = await db
              .select({ name: users.name })
              .from(users)
              .where(eq(users.id, submission.amendedBy))
              .limit(1)
            amendedByName = amender?.name ?? null
          }
        }
      }
    }

    result.push({
      id: row.id,
      projectId: row.projectId,
      stepN: row.stepN,
      checklistSlug: row.checklistSlug,
      checklistLabel: row.checklistLabel,
      reason: row.reason,
      targetPosition: row.targetPosition,
      createdAt: row.createdAt,
      canAmend,
      definitionName,
      items,
      hasSubmission,
      initialAnswers,
      amendedByName,
      amendedAt,
      photos,
    })
  }

  return result
}

export type AmendEscalatedChecklistInput = {
  escalationId: string
  answers: Record<string, ChecklistAnswer>
  // Quick task 260727-ibr: ADDITIVE ONLY. There is deliberately no "remove
  // photo" or "replace photos" input — a supervisor amending a subordinate's
  // record must never be able to destroy the subordinate's photographic
  // evidence. Deletion, if ever needed, is an admin/DB-level action with its
  // own audit, not something this action exposes.
  newPhotos?: string[] | null
}

export async function amendEscalatedChecklistAction(
  tabToken: string | null,
  input: AmendEscalatedChecklistInput,
): Promise<EscalateResult> {
  const { userId, role } = await verifySessionForAction(tabToken)
  const escalationId = String(input?.escalationId ?? '')
  if (!escalationId) return { ok: false, message: 'Missing escalation.' }

  const [escalation] = await db
    .select()
    .from(stepEscalations)
    .where(eq(stepEscalations.id, escalationId))
    .limit(1)
  if (!escalation) return { ok: false, message: 'Escalation not found.' }

  // Fresh db read — NEVER trust a session-carried position (T-gow-02):
  // positions are mutable and the session token is not re-minted on change.
  const [viewer] = await db
    .select({ position: users.position })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const viewerPosition = viewer?.position ?? null

  if (!canAmendEscalation(role as UserRole, viewerPosition, escalation.targetPosition)) {
    return { ok: false, message: 'You are not authorized to update this checklist.' }
  }

  if (!escalation.checklistSlug) {
    return { ok: false, message: 'This escalation has no editable checklist content.' }
  }

  const [def] = await db
    .select()
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, escalation.checklistSlug))
    .limit(1)
  if (!def) return { ok: false, message: 'This escalation has no editable checklist content.' }

  // Active template items are derived server-side from the definition —
  // never trusted from the client answers map (T-gow-03). Any answer keyed
  // by an id not in this set is silently discarded below.
  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.definitionId, def.id),
        eq(checklistTemplateItems.isActive, true),
      ),
    )
  if (items.length === 0) return { ok: false, message: 'This checklist has no items.' }

  const answers = input?.answers ?? {}

  // Quick task 260727-ibr (T-ibr-01): sanitize BEFORE any write, and return
  // early on violation so the zero-writes invariant holds. `newPhotos` is
  // fully attacker-controlled — this is a public Server Action HTTP endpoint,
  // and the client's readUploadFile downscale is a UX affordance, not a
  // control.
  const newPhotos = (Array.isArray(input?.newPhotos) ? input.newPhotos : []).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  )
  if (newPhotos.length > MAX_AMEND_PHOTOS) {
    return { ok: false, message: 'You can attach up to 6 photos at a time.' }
  }
  if (newPhotos.some((p) => p.length > MAX_PHOTO_DATA)) {
    return { ok: false, message: 'One of the photos is too large. Please retake it.' }
  }

  const [existing] = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.projectId, escalation.projectId), eq(checklists.definitionId, def.id)))
    .orderBy(desc(checklists.createdAt))
    .limit(1)

  try {
    if (existing) {
      // Amend path: rewrite the existing submission's responses in place.
      // This action MUST NOT touch the project's current-step counter or
      // any step-completion/state-tracking tables, MUST NOT call a
      // step-completion or additional-requirement-recording function.
      // `checklists.photoData` is APPEND-ONLY as of quick task 260727-ibr —
      // existing entries are never filtered, reordered, or overwritten
      // (evidence integrity, T-ibr-02); the rest of D-02 is unchanged: this
      // is still record correction, not workflow progression.
      const existingResponses = await db
        .select()
        .from(checklistResponses)
        .where(eq(checklistResponses.checklistId, existing.id))
      const priorByItemId = new Map(existingResponses.map((r) => [r.templateItemId, r]))

      for (const item of items) {
        const a = answers[item.id] ?? {}
        const value = a.value === 'yes' || a.value === 'no' || a.value === 'na' ? a.value : null
        const textValue = a.textValue ? String(a.textValue) : null
        const notes = a.notes ? String(a.notes) : null
        const prior = priorByItemId.get(item.id)
        if (prior) {
          await db
            .update(checklistResponses)
            .set({ value, textValue, notes, updatedAt: new Date() })
            .where(eq(checklistResponses.id, prior.id))
        } else {
          // Handles items added to the template after the original submission.
          await db.insert(checklistResponses).values({
            checklistId: existing.id,
            templateItemId: item.id,
            value,
            textValue,
            notes,
          })
        }
      }

      // APPEND-ONLY: only touch photoData when there's something to append —
      // never null/[] churn on a row that already holds evidence, and never
      // filter/reorder what's already there.
      await db
        .update(checklists)
        .set({
          amendedBy: userId,
          amendedAt: new Date(),
          updatedAt: new Date(),
          ...(newPhotos.length > 0
            ? { photoData: [...(existing.photoData ?? []), ...newPhotos] }
            : {}),
        })
        .where(eq(checklists.id, existing.id))
    } else {
      // Create-from-blank path: the officer left it blank, so the superior's
      // edit becomes the first recorded submission — mirrors
      // submitChecklistAction's insert shape.
      const [created] = await db
        .insert(checklists)
        .values({
          definitionId: def.id,
          projectId: escalation.projectId,
          createdBy: userId,
          status: 'submitted',
          submittedAt: new Date(),
          amendedBy: userId,
          amendedAt: new Date(),
          photoData: newPhotos.length > 0 ? newPhotos : null,
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
    }
  } catch {
    return { ok: false, message: 'Could not save your changes. Please try again.' }
  }

  revalidatePath(`/disputes/${escalation.projectId}`)
  return { ok: true, message: 'Checklist updated.' }
}
