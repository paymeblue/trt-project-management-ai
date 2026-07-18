'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, projectStepDeadlines, workflowStepStates, users } from '@/db/schema'
import { requireAdminForAction, verifySessionForAction } from '@/lib/dal'
import { FIRST_ACTION_STEP, Roles, isAdminRole, lastStepN, projectComplete, type UserRole } from '@/lib/workflow'
import { getLiveWorkflowSteps, getStepById, completeGraphStep, confirmPaymentReceived } from '@/lib/workflow-graph'
import { notifyAllSuperAdmins } from '@/lib/notifications'

function revalidateProjectBoards() {
  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
}

export type CreateProjectIntentState = { status: 'idle' | 'error'; message?: string }

// Customer Care (or admin) only. Captures the client's intent from the intake
// call and creates the project — unpaid by default (STG-01, PAY-01). No
// deadlines are collected here; Head of Operations sets the timeline once the
// invoice is uploaded.
export async function createProjectIntentAction(
  tabToken: string | null,
  _prev: CreateProjectIntentState,
  formData: FormData,
): Promise<CreateProjectIntentState> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (role !== Roles.CustomerCare && !isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only Customer Care can create a project intent.' }
  }

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return { status: 'error', message: 'Project name is required.' }

  const customerName = String(formData.get('customerName') ?? '').trim()
  if (!customerName) return { status: 'error', message: "Customer's name is required." }

  const customerEmail = String(formData.get('customerEmail') ?? '').trim() || null
  const customerPhone = String(formData.get('customerPhone') ?? '').trim() || null
  const location = String(formData.get('location') ?? '').trim() || null
  const scope = String(formData.get('scope') ?? '').trim() || null

  const [created] = await db
    .insert(projects)
    .values({
      name,
      location,
      customerName,
      customerEmail,
      customerPhone,
      scope,
      createdBy: userId,
      currentStep: FIRST_ACTION_STEP,
      // paymentStatus defaults to 'unpaid' at the schema level.
    })
    .returning({ id: projects.id })

  await db.insert(projectStepCompletions).values({
    projectId: created.id,
    stepKey: 'new_project',
    stepN: 1,
    completedBy: userId,
  })

  // Quick task 260714-b4t: auto-seed deadlines for the three early steps per
  // the owner's SLA spec (1d / 2d / 2d, all measured from project creation)
  // so the countdown timer has something to count before Operations sets the
  // full timeline at the merged Invoice & Delivery Timeline step (step 4,
  // setInvoiceTimelineAction above, which owns everything downstream).
  // Resolved by step_key (not hardcoded step numbers) — a step missing from
  // the live graph is skipped rather than thrown.
  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const earlyStepDeadlines: { key: string; offsetMs: number }[] = [
    { key: 'assign_designer_brief', offsetMs: 1 * DAY_MS },
    { key: 'brief_taking', offsetMs: 2 * DAY_MS },
    { key: 'invoice_upload', offsetMs: 2 * DAY_MS },
    // quick task 260714-qe4: the timeline-setting half of the old merged
    // step split out into its own step 5 — 1-day SLA (was +2d on the
    // merged step; owner said keep invoice_upload itself at +2d).
    { key: 'set_delivery_timeline', offsetMs: 1 * DAY_MS },
  ]
  const liveSteps = await getLiveWorkflowSteps()
  const seededDeadlines = earlyStepDeadlines
    .map(({ key, offsetMs }) => {
      const step = liveSteps.find((s) => s.key === key)
      return step ? { projectId: created.id, stepN: step.n, deadline: new Date(now + offsetMs) } : null
    })
    .filter((d): d is { projectId: string; stepN: number; deadline: Date } => d !== null)
  if (seededDeadlines.length) {
    await db.insert(projectStepDeadlines).values(seededDeadlines).onConflictDoNothing()
  }

  revalidatePath('/admin/timeline')
  revalidatePath('/customer-care/dashboard')
  redirect('/customer-care/dashboard')
}

export type SetInvoiceTimelineState = { status: 'idle' | 'error'; message?: string }

// Operations OR a Super Admin (D-01, quick task 260713-rb2 — role=operations
// already admits both via isAdminRole; requiredPosition is null on this
// step, so no exact-position gate here). Quick task 260714-qe4: retargeted
// from the old merged 'invoice_upload' step to the new standalone
// 'set_delivery_timeline' step (resolved by stepKey, not a hardcoded
// orderIndex) — sets the overall delivery date + a deadline for every step
// after it. Steps 2/3 (Assign Designer, Brief Taking) are handled manually
// (Head Designer assigns; the assigned designer takes the brief) before
// this runs, so no deadline is set for them here.
export async function setInvoiceTimelineAction(
  tabToken: string | null,
  _prev: SetInvoiceTimelineState,
  formData: FormData,
): Promise<SetInvoiceTimelineState> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (!isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only Operations or a Super Admin can set the timeline.' }
  }

  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!projectId) return { status: 'error', message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { status: 'error', message: 'Project not found.' }

  const steps = await getLiveWorkflowSteps()
  const mergedStep = steps.find((s) => s.key === 'set_delivery_timeline')
  if (!mergedStep) return { status: 'error', message: 'Set Delivery Timeline step is not configured.' }
  if (proj.currentStep !== mergedStep.n) {
    return { status: 'error', message: 'This project is not awaiting the delivery timeline.' }
  }

  const deadlineRaw = String(formData.get('deliveryDate') ?? '').trim()
  if (!deadlineRaw) return { status: 'error', message: 'A delivery deadline is required.' }
  const deliveryDate = new Date(deadlineRaw)
  if (Number.isNaN(deliveryDate.getTime()))
    return { status: 'error', message: 'Please enter a valid deadline.' }

  // Parse + validate per-step deadlines for every step AFTER the merged step.
  const parsedDeadlines: { stepN: number; deadline: Date }[] = []
  for (const s of steps) {
    if (s.n <= mergedStep.n) continue
    const raw = String(formData.get(`deadline_${s.n}`) ?? '').trim()
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime()))
      return { status: 'error', message: `Please enter a valid deadline for step ${s.n}.` }
    parsedDeadlines.push({ stepN: s.n, deadline: d })
  }
  for (let i = 1; i < parsedDeadlines.length; i++) {
    if (parsedDeadlines[i].deadline < parsedDeadlines[i - 1].deadline) {
      return {
        status: 'error',
        message: `Step ${parsedDeadlines[i].stepN}'s deadline can't be earlier than step ${parsedDeadlines[i - 1].stepN}'s — later steps must be due on or after earlier ones.`,
      }
    }
  }
  const lastStepDl = parsedDeadlines[parsedDeadlines.length - 1]?.deadline
  if (lastStepDl && deliveryDate < lastStepDl) {
    return {
      status: 'error',
      message: 'The final delivery deadline must be on or after the last step deadline.',
    }
  }

  await db.update(projects).set({ deliveryDate, updatedAt: new Date() }).where(eq(projects.id, projectId))

  if (parsedDeadlines.length) {
    await db
      .insert(projectStepDeadlines)
      .values(parsedDeadlines.map((p) => ({ projectId, stepN: p.stepN, deadline: p.deadline })))
      .onConflictDoUpdate({
        target: [projectStepDeadlines.projectId, projectStepDeadlines.stepN],
        set: { deadline: sql`excluded.deadline` },
      })
  }

  // Completes the standalone 'set_delivery_timeline' step (quick task
  // 260714-qe4 — this step now stands alone, no upload gate: 'timeline_setting'
  // is not a STATE_GATED_KINDS kind, so completeGraphStep never throws
  // 'step-not-fulfilled' here; the currentStep check above is the entry gate).
  try {
    await completeGraphStep({ projectId, stepDefId: mergedStep.stepDefId, actorId: userId })
  } catch {
    return { status: 'error', message: 'Could not complete this step — it may have already moved on.' }
  }

  revalidatePath('/admin/timeline')
  redirect('/admin/timeline')
}

export type ConfirmClientPaidState = { ok: boolean; message?: string }

// Phase 2/2 of the new customer_care-owned 2-phase "Invoicing" step (step 4,
// quick task 260714-qe4). CHOSEN MECHANISM: reuses the proven 2-part-wizard
// pattern (additionalKinds=['payment_confirmation'] on the live
// invoice_upload row) rather than the `approval` kind — receiveApproval()
// throws 'approval-requires-two-parties' whenever sentBy===actorId, which
// blocks a same-role (customer_care) 2-phase flow; the wizard pattern has no
// such restriction and already proved itself on the old merged step. Sole
// caller of completeGraphStep for this step (mirrors setInvoiceTimelineAction's
// precedent for the old merged step / the new set_delivery_timeline step).
export async function confirmClientPaidAction(tabToken: string | null, input: {
  projectId: string
  stepDefId: string
}): Promise<ConfirmClientPaidState> {
  const { userId, role } = await verifySessionForAction(tabToken)
  if (role !== Roles.CustomerCare && !isAdminRole(role as UserRole)) {
    return { ok: false, message: 'Only Customer Care can confirm payment.' }
  }
  if (isAdminRole(role as UserRole) && role !== Roles.CustomerCare) {
    // PAY-02: narrow the admin path to Head of Operations specifically —
    // any operations/super_admin was too broad (roadmap Phase 20 criterion 2).
    const [actor] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actor?.position !== 'head_of_operations') {
      return { ok: false, message: 'Only Head of Operations can confirm payment.' }
    }
  }

  const step = await getStepById(input.stepDefId)
  if (!step || step.key !== 'invoice_upload') return { ok: false, message: 'Invoicing step not found.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
  if (!proj) return { ok: false, message: 'Project not found.' }
  if (proj.currentStep !== step.orderIndex) {
    return { ok: false, message: 'This project is not awaiting invoice payment confirmation.' }
  }

  const [state] = await db
    .select({ fulfilledKinds: workflowStepStates.fulfilledKinds })
    .from(workflowStepStates)
    .where(and(eq(workflowStepStates.projectId, input.projectId), eq(workflowStepStates.stepDefId, input.stepDefId)))
    .limit(1)
  if (!(state?.fulfilledKinds ?? []).includes('yes_no_upload')) {
    return { ok: false, message: 'Upload the invoice (part 1/2) before confirming payment.' }
  }

  // Sequential writes — the neon-http driver's db.transaction() throws (see
  // actions/positions.ts's identical caveat); paymentStatus is set before
  // the step completion that advances the project, mirroring
  // setInvoiceTimelineAction's ordering (deadline write, then completion).
  await db.update(projects).set({ paymentStatus: 'paid', updatedAt: new Date() }).where(eq(projects.id, input.projectId))
  await confirmPaymentReceived({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: userId })

  try {
    await completeGraphStep({ projectId: input.projectId, stepDefId: input.stepDefId, actorId: userId })
  } catch {
    return { ok: false, message: 'Could not complete this step — it may have already moved on.' }
  }

  revalidatePath('/admin/timeline')
  revalidatePath('/customer-care/dashboard')
  return { ok: true }
}

// Admin-only manual override of delivered status (status is otherwise managed
// automatically when the workflow reaches Close Out).
export async function toggleProjectStatusAction(tabToken: string | null, formData: FormData): Promise<void> {
  await requireAdminForAction(tabToken)
  const id = String(formData.get('id') ?? '')
  const [proj] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!proj) return

  const next = proj.status === 'delivered' ? 'not_delivered' : 'delivered'
  await db.update(projects).set({ status: next, updatedAt: new Date() }).where(eq(projects.id, id))

  revalidatePath('/admin/timeline')
}

export type FlagState = { ok: boolean; message?: string }

// Any actor can pause/flag a project when things aren't ready (REQ-G08). Pauses
// the project and notifies every super admin; it stays paused until a super
// admin resumes it.
export async function pauseProjectAction(
  tabToken: string | null,
  _prev: FlagState,
  input: { projectId: string; reason?: string },
): Promise<FlagState> {
  const { userId } = await verifySessionForAction(tabToken)
  const projectId = String(input?.projectId ?? '')
  const reason = String(input?.reason ?? '').trim()
  if (!projectId) return { ok: false, message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { ok: false, message: 'Project not found.' }
  if (proj.status === 'paused') return { ok: false, message: 'This project is already paused.' }
  if (projectComplete(proj.currentStep, lastStepN(await getLiveWorkflowSteps())))
    return { ok: false, message: 'This project is already complete.' }

  await db
    .update(projects)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  await notifyAllSuperAdmins({
    type: 'pause_flag',
    title: `Project flagged: ${proj.name}`,
    body: reason || 'Flagged as not ready — paused until resolved.',
    projectId,
    actorId: userId,
  })

  revalidateProjectBoards()
  return { ok: true, message: 'Project paused. Super admins have been notified.' }
}

// Super-admin-only resume of a paused project (REQ-G08).
export async function resumeProjectAction(
  tabToken: string | null,
  _prev: FlagState,
  input: { projectId: string },
): Promise<FlagState> {
  const { role } = await verifySessionForAction(tabToken)
  if (role !== Roles.SuperAdmin)
    return { ok: false, message: 'Only a super admin can resume a paused project.' }
  const projectId = String(input?.projectId ?? '')
  if (!projectId) return { ok: false, message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { ok: false, message: 'Project not found.' }
  if (proj.status !== 'paused') return { ok: false, message: 'This project is not paused.' }

  await db
    .update(projects)
    .set({ status: 'not_delivered', updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  revalidateProjectBoards()
  return { ok: true, message: 'Project resumed.' }
}
