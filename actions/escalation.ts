'use server'

import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { users, projects, stepEscalations } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'
import { escalationTargetPosition } from '@/lib/escalation'
import { userRoleLabel, type UserRole } from '@/lib/workflow'
import { notifyUser } from '@/lib/notifications'

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
