'use server'

import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { users, projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { escalationTargetPosition } from '@/lib/escalation'
import { userRoleLabel, type UserRole } from '@/lib/workflow'
import { notifyUser } from '@/lib/notifications'

export type EscalateResult = { ok: boolean; message: string }

/**
 * Per-checklist escalation flag (items #9, #14). Unlike pauseProjectAction
 * (REQ-G08, broadcasts to every super admin and pauses the project), this is
 * a lightweight, single-recipient notification to the escalating user's
 * fixed superior position — the project is NOT paused, nothing blocks.
 */
export async function escalateChecklistAction(input: {
  projectId: string
  checklistLabel: string
  reason?: string | null
}): Promise<EscalateResult> {
  const { userId, role } = await verifySession()
  const projectId = String(input?.projectId ?? '')
  const checklistLabel = String(input?.checklistLabel ?? 'a checklist').trim()
  const reason = String(input?.reason ?? '').trim().slice(0, 500)
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
