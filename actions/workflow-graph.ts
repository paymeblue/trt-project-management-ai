'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { users, projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { canRoleActOnStep } from '@/lib/workflow'
import { notifyUser } from '@/lib/notifications'
import {
  getStepById,
  completeGraphStep,
  submitYesNoUpload,
  sendApproval,
  receiveApproval,
  rejectApproval,
  getApprovalReceiverHolders,
  assignUser,
  getStepAssigneeGate,
} from '@/lib/workflow-graph'

// ── Server actions for the DB-driven workflow graph (Phase 16, WF-02) ─────
// Thin wrappers: each resolves the target step, verifies the session, gates
// on role, delegates to the write engine in lib/workflow-graph.ts, and maps
// engine errors to a distinct, visible reject reason (never a generic
// catch-all — see actions/workflow.ts for the pattern this mirrors).

export type WorkflowGraphActionState = { ok: boolean; message?: string }

function revalidateBoards() {
  revalidatePath('/workflow/step')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
  revalidatePath('/admin/timeline')
}

// Maps a thrown engine Error's message to user-facing text. Unrecognized
// errors fall back to a generic message, but every reason the engine
// explicitly guards against (T-16-06/07/08) is surfaced distinctly.
const ENGINE_ERROR_MESSAGES: Record<string, string> = {
  'step-not-found': 'That step could not be found.',
  'required-step-cannot-be-skipped': 'This step is required and cannot be skipped.',
  'step-not-fulfilled': "Complete this step's form before marking it done.",
  'approval-not-sent': 'This approval has not been sent yet.',
  'approval-requires-two-parties':
    'You cannot approve your own submission — a different person must receive it.',
  'assignee-role-mismatch': 'The selected user does not have the required role for this step.',
  'position-mismatch': 'This step is restricted to a specific title, and your account is not set to it.',
  'assignee-mismatch':
    'This step is assigned to a specific person — only they (or the Head Designer, by reassigning) can act on it.',
}

function engineErrorMessage(err: unknown): string {
  const key = err instanceof Error ? err.message : ''
  return ENGINE_ERROR_MESSAGES[key] ?? 'Could not complete this action.'
}

type StepAuth = { ok: true; userId: string } | { ok: false; message: string }

// Resolves the step, verifies the session, and gates on role + (if set)
// exact position — every action below runs this before touching the write
// engine (T-16-05). Position is fetched fresh from the DB, not the session
// (v2.0 Phase 19 — `users.position` is not carried in the JWT since it can
// change post-signup via the self-service profile flow, and a stale claim
// would silently under- or over-authorize).
// `forReceive` (v2.0 Phase 22): approval-kind steps can gate the 2nd party
// (receiver) to a DIFFERENT exact position than the 1st party (sender) via
// `receiverRequiredPosition` — e.g. Send for Production: sender must be
// Head of Operations (`requiredPosition`), receiver must be Chief Production
// Officer (`receiverRequiredPosition`). When unset, receive falls back to the
// step's normal `requiredPosition` gate (legacy behavior unchanged).
// v2.0 Phase 22e: approval-kind steps can ALSO gate the receiver to a
// DIFFERENT ROLE entirely via `receiverRole` — e.g. Delivery: factory_pm
// sends, site_pm receives. When set, this replaces the normal
// canRoleActOnStep(step.role, ...) gate for the receive action only.
// Quick task 260713-ekr (security fix): after role + position pass, a
// step in ASSIGNEE_GATED_STEPS (brief_taking/kickoff_meeting/design_stage)
// is further narrowed to the ONE person assigned at its governing
// assignment step — not any user whose role/position otherwise qualifies.
async function authorizeStep(stepDefId: string, projectId: string, forReceive = false): Promise<StepAuth> {
  const { userId, role } = await verifySession()
  const step = await getStepById(stepDefId)
  if (!step) return { ok: false, message: 'That step could not be found.' }
  const roleGate = forReceive && step.receiverRole ? step.receiverRole : step.role
  if (!canRoleActOnStep(roleGate, role)) return { ok: false, message: 'Not your step.' }
  const requiredPos = forReceive ? (step.receiverRequiredPosition ?? step.requiredPosition) : step.requiredPosition
  if (requiredPos) {
    const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actingUser?.position !== requiredPos) {
      return { ok: false, message: engineErrorMessage(new Error('position-mismatch')) }
    }
  }
  const gateUserId = await getStepAssigneeGate(step.graph, projectId, step.key)
  if (gateUserId && gateUserId !== userId) {
    return { ok: false, message: engineErrorMessage(new Error('assignee-mismatch')) }
  }
  return { ok: true, userId }
}

export async function completeStepAction(input: {
  projectId: string
  stepDefId: string
  skip?: boolean
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId)
  if (!auth.ok) return auth
  try {
    await completeGraphStep({
      projectId: input.projectId,
      stepDefId: input.stepDefId,
      actorId: auth.userId,
      skip: input.skip,
    })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

export async function submitYesNoUploadAction(input: {
  projectId: string
  stepDefId: string
  answer: 'yes' | 'no'
  uploadData?: string | null
  uploadName?: string | null
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId)
  if (!auth.ok) return auth
  try {
    await submitYesNoUpload({
      projectId: input.projectId,
      stepDefId: input.stepDefId,
      actorId: auth.userId,
      answer: input.answer,
      uploadData: input.uploadData,
      uploadName: input.uploadName,
    })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

export async function sendApprovalAction(input: {
  projectId: string
  stepDefId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId)
  if (!auth.ok) return auth
  try {
    await sendApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  // Notify every receiver-title holder that a design is ready for their
  // approval. An empty holder list is surfaced as a visible warning in the
  // UI (Task 2), not a thrown error here — the send itself already
  // succeeded and must not be rolled back for a staffing gap.
  const step = await getStepById(input.stepDefId)
  if (step) {
    const holders = await getApprovalReceiverHolders(step)
    if (holders.length > 0) {
      const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, input.projectId)).limit(1)
      const projectName = proj?.name ?? 'a project'
      for (const holder of holders) {
        await notifyUser({
          recipientId: holder.id,
          actorId: auth.userId,
          type: 'approval_request',
          title: `Design ready to approve for production: ${projectName}`,
          projectId: input.projectId,
        })
      }
    }
  }
  revalidateBoards()
  return { ok: true }
}

export async function receiveApprovalAction(input: {
  projectId: string
  stepDefId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId, true)
  if (!auth.ok) return auth
  try {
    await receiveApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

/**
 * The receiver's single "Approve & send to Factory" click: chains
 * receiveApproval then completeGraphStep server-side (both with the SAME
 * actorId) so completedBy is durably attributed to the receiver, not a
 * second, separate "Complete step" click by whoever happens to press it.
 */
export async function approveAndCompleteApprovalAction(input: {
  projectId: string
  stepDefId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId, true)
  if (!auth.ok) return auth
  try {
    await receiveApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
    await completeGraphStep({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

/**
 * The receiver rejects the design: returns the step to phase 1/2 (status
 * 'pending', sentBy cleared) and notifies the original sender to revise and
 * resend. Authorized EXACTLY like receive — only a receiver-eligible user
 * may reject (forReceive=true).
 */
export async function rejectApprovalAction(input: {
  projectId: string
  stepDefId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId, true)
  if (!auth.ok) return auth
  try {
    const result = await rejectApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
    if (result.sentBy) {
      await notifyUser({
        recipientId: result.sentBy,
        actorId: auth.userId,
        type: 'approval_rejected',
        title: 'Design rejected — please revise and resend',
        body: 'Rejected by the reviewer on this project.',
        projectId: input.projectId,
      })
    }
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

export async function assignUserAction(input: {
  projectId: string
  stepDefId: string
  assignedUserId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, input.projectId)
  if (!auth.ok) return auth
  try {
    await assignUser({
      projectId: input.projectId,
      stepDefId: input.stepDefId,
      actorId: auth.userId,
      assignedUserId: input.assignedUserId,
    })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}
