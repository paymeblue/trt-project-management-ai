'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, stepBypassRequests } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import {
  stepByN,
  canRoleActOnStep,
  isProjectComplete,
  LAST_STEP,
  Roles,
  workflowRoleLabel,
  type UserRole,
} from '@/lib/workflow'
import { notifyAllSuperAdmins } from '@/lib/notifications'

function revalidateBypass() {
  revalidatePath('/admin/approvals')
  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
}

export type BypassState = { ok: boolean; message?: string }

// Actor requests approval to advance the current step WITHOUT completing its
// checklist (REQ-G09). Notifies every super admin.
export async function requestStepBypassAction(
  _prev: BypassState,
  input: { projectId: string; stepN: number; reason?: string },
): Promise<BypassState> {
  const { userId, role } = await verifySession()
  const projectId = String(input?.projectId ?? '')
  const stepN = Number(input?.stepN)
  const reason = String(input?.reason ?? '').trim()
  if (!projectId || !stepN) return { ok: false, message: 'Missing project or step.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { ok: false, message: 'Project not found.' }
  if (proj.status === 'paused') return { ok: false, message: 'This project is paused.' }
  if (proj.currentStep !== stepN) return { ok: false, message: 'This step is no longer current.' }

  const step = stepByN(stepN)
  if (!step) return { ok: false, message: 'Invalid step.' }
  if (!canRoleActOnStep(step.role, role as UserRole))
    return { ok: false, message: 'This is not your step to act on.' }

  const [existing] = await db
    .select({ id: stepBypassRequests.id })
    .from(stepBypassRequests)
    .where(
      and(
        eq(stepBypassRequests.projectId, projectId),
        eq(stepBypassRequests.stepN, stepN),
        eq(stepBypassRequests.status, 'pending'),
      ),
    )
    .limit(1)
  if (existing) return { ok: false, message: 'A request for this step is already pending.' }

  await db
    .insert(stepBypassRequests)
    .values({ projectId, stepN, reason: reason || null, requestedBy: userId })

  await notifyAllSuperAdmins({
    type: 'bypass_request',
    title: `Bypass requested: ${proj.name}`,
    body: `${workflowRoleLabel(step.role)} step "${step.label}" — ${reason || 'no reason given'}`,
    projectId,
    actorId: userId,
  })

  revalidateBypass()
  return { ok: true, message: 'Approval requested. Super admins have been notified.' }
}

// Super admin approves or denies. Approval advances the step with an audited
// completion row (who approved + reason).
export async function decideStepBypassAction(input: {
  requestId: string
  approve: boolean
}): Promise<BypassState> {
  const { userId, role } = await verifySession()
  if (role !== Roles.SuperAdmin) return { ok: false, message: 'Only a super admin can decide.' }
  const requestId = String(input?.requestId ?? '')

  const [req] = await db
    .select()
    .from(stepBypassRequests)
    .where(eq(stepBypassRequests.id, requestId))
    .limit(1)
  if (!req || req.status !== 'pending')
    return { ok: false, message: 'Request not found or already decided.' }

  if (!input.approve) {
    await db
      .update(stepBypassRequests)
      .set({ status: 'denied', decidedBy: userId, decidedAt: new Date() })
      .where(eq(stepBypassRequests.id, requestId))
    revalidateBypass()
    return { ok: true, message: 'Request denied.' }
  }

  const [proj] = await db.select().from(projects).where(eq(projects.id, req.projectId)).limit(1)
  const step = stepByN(req.stepN)
  if (
    proj &&
    step &&
    proj.status !== 'paused' &&
    proj.currentStep === req.stepN &&
    !isProjectComplete(proj.currentStep)
  ) {
    await db.insert(projectStepCompletions).values({
      projectId: req.projectId,
      stepKey: step.key,
      stepN: step.n,
      completedBy: userId,
      notes: `Bypass approved by super admin: ${req.reason || 'no reason given'}`,
    })
    const nextStep = proj.currentStep + 1
    const done = nextStep > LAST_STEP
    await db
      .update(projects)
      .set({ currentStep: nextStep, status: done ? 'delivered' : proj.status, updatedAt: new Date() })
      .where(eq(projects.id, req.projectId))
  }

  await db
    .update(stepBypassRequests)
    .set({ status: 'approved', decidedBy: userId, decidedAt: new Date() })
    .where(eq(stepBypassRequests.id, requestId))

  revalidateBypass()
  return { ok: true, message: 'Approved — step advanced.' }
}
