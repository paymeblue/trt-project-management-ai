'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { canRoleActOnStep } from '@/lib/workflow'
import {
  getStepById,
  completeGraphStep,
  submitYesNoUpload,
  sendApproval,
  receiveApproval,
  assignUser,
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
async function authorizeStep(stepDefId: string, forReceive = false): Promise<StepAuth> {
  const { userId, role } = await verifySession()
  const step = await getStepById(stepDefId)
  if (!step) return { ok: false, message: 'That step could not be found.' }
  if (!canRoleActOnStep(step.role, role)) return { ok: false, message: 'Not your step.' }
  const requiredPos = forReceive ? (step.receiverRequiredPosition ?? step.requiredPosition) : step.requiredPosition
  if (requiredPos) {
    const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actingUser?.position !== requiredPos) {
      return { ok: false, message: engineErrorMessage(new Error('position-mismatch')) }
    }
  }
  return { ok: true, userId }
}

export async function completeStepAction(input: {
  projectId: string
  stepDefId: string
  skip?: boolean
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId)
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
  const auth = await authorizeStep(input.stepDefId)
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
  const auth = await authorizeStep(input.stepDefId)
  if (!auth.ok) return auth
  try {
    await sendApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
  } catch (err) {
    return { ok: false, message: engineErrorMessage(err) }
  }
  revalidateBoards()
  return { ok: true }
}

export async function receiveApprovalAction(input: {
  projectId: string
  stepDefId: string
}): Promise<WorkflowGraphActionState> {
  const auth = await authorizeStep(input.stepDefId, true)
  if (!auth.ok) return auth
  try {
    await receiveApproval({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: auth.userId })
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
  const auth = await authorizeStep(input.stepDefId)
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
