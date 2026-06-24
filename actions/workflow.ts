'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { stepByN, LAST_STEP, canRoleActOnStep, type UserRole } from '@/lib/workflow'

function revalidateBoards() {
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
  revalidatePath('/admin/timeline')
}

/**
 * Advance a project to the next workflow step.
 *
 * Idempotent + safe: it only advances when the project is genuinely sitting at
 * `expectedStepN` and the caller's role is allowed to act on that step. Returns
 * `true` if it advanced. Callable directly (ack steps) or from other server
 * actions (checklist / readiness submission).
 */
export async function advanceProjectStep(opts: {
  projectId: string
  expectedStepN: number
  notes?: string | null
}): Promise<boolean> {
  const { userId, role } = await verifySession()
  const { projectId, expectedStepN } = opts
  if (!projectId) return false

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return false
  if (proj.currentStep !== expectedStepN) return false // stale / already advanced by someone else

  const step = stepByN(expectedStepN)
  if (!step) return false
  if (!canRoleActOnStep(step.role, role as UserRole)) return false

  await db.insert(projectStepCompletions).values({
    projectId,
    stepKey: step.key,
    stepN: step.n,
    completedBy: userId,
    notes: opts.notes?.trim() || null,
  })

  const nextStep = proj.currentStep + 1
  const done = nextStep > LAST_STEP
  await db
    .update(projects)
    .set({
      currentStep: nextStep,
      status: done ? 'delivered' : proj.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))

  revalidateBoards()
  return true
}

export type AckStepState = { ok: boolean; message?: string }

/** Completes an inline `ack` step (e.g. Factory Floor Projects) from the modal. */
export async function completeAckStepAction(
  _prev: AckStepState,
  input: { projectId: string; expectedStepN: number; notes?: string },
): Promise<AckStepState> {
  const step = stepByN(input?.expectedStepN)
  if (!step || step.kind !== 'ack') return { ok: false, message: 'Invalid step.' }
  const advanced = await advanceProjectStep({
    projectId: input.projectId,
    expectedStepN: input.expectedStepN,
    notes: input.notes,
  })
  return advanced
    ? { ok: true, message: 'Step completed.' }
    : { ok: false, message: 'Could not complete this step — it may have already moved on, or it is not your turn.' }
}
