'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, workflowStepStates } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'
import { canRoleActOnStep, findStep, lastStepN, type UserRole, type WorkflowRole } from '@/lib/workflow'
import { getLiveWorkflowSteps, assigneeGatedRoles, getStepAssigneeGate, notifyNextStepOfficers } from '@/lib/workflow-graph'

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
export async function advanceProjectStep(tabToken: string | null, opts: {
  projectId: string
  expectedStepN: number
  notes?: string | null
}): Promise<boolean> {
  const { userId, role } = await verifySessionForAction(tabToken)
  const { projectId, expectedStepN } = opts
  if (!projectId) return false

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return false
  if (proj.currentStep !== expectedStepN) return false // stale / already advanced by someone else

  const steps = await getLiveWorkflowSteps()
  const step = findStep(steps, expectedStepN)
  if (!step) return false
  if (!canRoleActOnStep(step.role, role as UserRole)) return false

  // Quick task 260716-h0i: real server-side enforcement — only the site_pm
  // assigned via ops_design_confirmation may act on this project's gated
  // steps. No-op for any other role/step.
  if (assigneeGatedRoles(step.key).includes(role as WorkflowRole)) {
    const gateUserId = await getStepAssigneeGate('live', projectId, step.key)
    if (gateUserId && gateUserId !== userId) return false
  }

  await db.insert(projectStepCompletions).values({
    projectId,
    stepKey: step.key,
    stepN: step.n,
    stepDefId: step.stepDefId,
    graph: 'live',
    completedBy: userId,
    notes: opts.notes?.trim() || null,
  })

  const nextStep = proj.currentStep + 1
  const done = nextStep > lastStepN(steps)
  await db
    .update(projects)
    .set({
      currentStep: nextStep,
      status: done ? 'delivered' : proj.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))

  await notifyNextStepOfficers(projectId, userId)
  revalidateBoards()
  return true
}

/**
 * v2.0 Phase 22e: for a legacy-engine (readiness/checklist) step with
 * `dualRoles` set — e.g. the merged Materials/Delivery Readiness step
 * (factory_pm + site_pm both required) — records the caller's role as
 * confirmed, and only advances the project once EVERY dualRole has
 * independently confirmed. Unlike `advanceProjectStep` (immediate,
 * single-actor), this can be called multiple times by different actors
 * before the step actually completes; each call before the last is a no-op
 * on `projects.currentStep` but still persists partial progress.
 *
 * Returns `advanced: true` only on the call that completes the LAST
 * required role's confirmation.
 */
export async function confirmDualRoleStep(tabToken: string | null, opts: {
  projectId: string
  expectedStepN: number
  notes?: string | null
}): Promise<{ ok: boolean; advanced: boolean; message?: string }> {
  const { userId, role } = await verifySessionForAction(tabToken)
  return confirmDualRoleStepAs({ ...opts, userId, role })
}

/**
 * v2.0 Phase 22e: the auth-free core of confirmDualRoleStep, parameterized by
 * an explicit userId/role instead of reading them from verifySession(). Real
 * callers MUST go through confirmDualRoleStep (which enforces auth) — this is
 * exported only so scripts/verify-live-workflow.ts (a trusted CLI harness
 * with no request/session context) can exercise the exact same mechanics,
 * mirroring how the harness already calls lib/workflow-graph.ts's
 * completeGraphStep directly with an explicit actorId instead of going
 * through an auth-gated action wrapper.
 */
export async function confirmDualRoleStepAs(opts: {
  projectId: string
  expectedStepN: number
  notes?: string | null
  userId: string
  role: UserRole
}): Promise<{ ok: boolean; advanced: boolean; message?: string }> {
  const { userId, role, projectId, expectedStepN } = opts

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { ok: false, advanced: false, message: 'Project not found.' }
  if (proj.currentStep !== expectedStepN) {
    return { ok: false, advanced: false, message: 'This step is no longer awaiting action.' }
  }

  const steps = await getLiveWorkflowSteps()
  const step = findStep(steps, expectedStepN)
  if (!step || !step.dualRoles?.length) {
    return { ok: false, advanced: false, message: 'This step is not configured for dual-role confirmation.' }
  }
  if (!(step.dualRoles as string[]).includes(role)) {
    return { ok: false, advanced: false, message: 'Not your step.' }
  }

  // Quick task 260716-h0i: real server-side enforcement — the dual-role
  // materials_readiness step's site_pm party must be the one assigned via
  // ops_design_confirmation; the factory_pm party is completely unaffected
  // (assigneeGatedRoles('materials_readiness') is ['site_pm'], so this is a
  // no-op whenever role === 'factory_pm').
  if (assigneeGatedRoles(step.key).includes(role as WorkflowRole)) {
    const gateUserId = await getStepAssigneeGate('live', projectId, step.key)
    if (gateUserId && gateUserId !== userId) {
      return {
        ok: false,
        advanced: false,
        message: 'This step is assigned to a specific Site PM for this project.',
      }
    }
  }

  // Atomic upsert: the array_append CASE avoids a JS read-then-write, which
  // under two simultaneous confirmations would lose one caller's role (the
  // second insert's onConflictDoUpdate would overwrite the first's pending
  // array with a value computed from the same stale SELECT).
  const [row] = await db
    .insert(workflowStepStates)
    .values({ projectId, stepDefId: step.stepDefId, status: 'pending', confirmedRoles: [role], actedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: {
        confirmedRoles: sql`CASE WHEN ${role} = ANY(${workflowStepStates.confirmedRoles}) THEN ${workflowStepStates.confirmedRoles} ELSE array_append(${workflowStepStates.confirmedRoles}, ${role}) END`,
        actedBy: userId,
        updatedAt: new Date(),
      },
    })
    .returning({ confirmedRoles: workflowStepStates.confirmedRoles })
  const confirmedRoles = row?.confirmedRoles ?? [role]

  const allConfirmed = step.dualRoles.every((r) => confirmedRoles.includes(r))
  if (!allConfirmed) {
    revalidateBoards()
    return { ok: true, advanced: false, message: 'Your confirmation was recorded — waiting on the other role.' }
  }

  await db
    .update(workflowStepStates)
    .set({ status: 'complete', updatedAt: new Date() })
    .where(and(eq(workflowStepStates.projectId, projectId), eq(workflowStepStates.stepDefId, step.stepDefId)))

  await db.insert(projectStepCompletions).values({
    projectId,
    stepKey: step.key,
    stepN: step.n,
    stepDefId: step.stepDefId,
    graph: 'live',
    completedBy: userId,
    notes: opts.notes?.trim() || null,
  })

  const nextStep = proj.currentStep + 1
  const done = nextStep > lastStepN(steps)
  await db
    .update(projects)
    .set({ currentStep: nextStep, status: done ? 'delivered' : proj.status, updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  await notifyNextStepOfficers(projectId, userId)
  revalidateBoards()
  return { ok: true, advanced: true, message: 'Both roles confirmed — step completed.' }
}

/**
 * Shared dispatcher for the readiness/checklist submission actions: most
 * steps advance immediately on a single submission (advanceProjectStep), but
 * a step with `dualRoles` configured (v2.0 Phase 22e) needs BOTH roles to
 * independently confirm first (confirmDualRoleStep). Callers just want a
 * single boolean — this picks the right engine transparently.
 */
export async function advanceOrConfirmDualRole(tabToken: string | null, opts: {
  projectId: string
  expectedStepN: number
  notes?: string | null
}): Promise<boolean> {
  const step = findStep(await getLiveWorkflowSteps(), opts.expectedStepN)
  if (step?.dualRoles?.length) {
    const res = await confirmDualRoleStep(tabToken, opts)
    return res.advanced
  }
  return advanceProjectStep(tabToken, opts)
}

export type AckStepState = { ok: boolean; message?: string }

/** Completes an inline `ack` step (e.g. Factory Floor Projects) from the modal. */
export async function completeAckStepAction(
  tabToken: string | null,
  _prev: AckStepState,
  input: { projectId: string; expectedStepN: number; notes?: string },
): Promise<AckStepState> {
  const step = findStep(await getLiveWorkflowSteps(), input?.expectedStepN)
  if (!step || step.kind !== 'ack') return { ok: false, message: 'Invalid step.' }
  const advanced = await advanceProjectStep(tabToken, {
    projectId: input.projectId,
    expectedStepN: input.expectedStepN,
    notes: input.notes,
  })
  return advanced
    ? { ok: true, message: 'Step completed.' }
    : { ok: false, message: 'Could not complete this step — it may have already moved on, or it is not your turn.' }
}
