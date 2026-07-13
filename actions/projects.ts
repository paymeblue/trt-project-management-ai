'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, projectStepDeadlines, users } from '@/db/schema'
import { requireAdmin, verifySession } from '@/lib/dal'
import { FIRST_ACTION_STEP, Positions, Roles, isAdminRole, lastStepN, projectComplete, type UserRole } from '@/lib/workflow'
import { getLiveWorkflowSteps, getGraphSteps, autoAssignIfConfigured } from '@/lib/workflow-graph'
import { advanceProjectStep } from '@/actions/workflow'
import { notifyAllSuperAdmins } from '@/lib/notifications'

function revalidateProjectBoards() {
  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
}

// v2.0 Phase 22c: since 'payment_confirmation' was removed, FIRST_ACTION_STEP
// (the step a new project is parked at) now IS assign_designer_brief — which
// is auto-assigned (see lib/workflow-graph.ts autoAssignIfConfigured), not
// manually triggered by completing a prior step. That hook only runs inside
// completeGraphStep's advancement chain, which a brand-new project never
// goes through (its currentStep is set directly at INSERT time) — so it must
// be invoked explicitly here, right after creation, or the very first step
// would sit unassigned forever with nothing to trigger it.
async function triggerEntryAutoAssign(projectId: string): Promise<void> {
  const steps = await getGraphSteps('live')
  const entryActionStep = steps.find((s) => s.orderIndex === FIRST_ACTION_STEP)
  if (entryActionStep) await autoAssignIfConfigured(projectId, entryActionStep)
}

export type CreateProjectIntentState = { status: 'idle' | 'error'; message?: string }

// Customer Care (or admin) only. Captures the client's intent from the intake
// call and creates the project — unpaid by default (STG-01, PAY-01). No
// deadlines are collected here; Head of Operations sets the timeline once the
// invoice is uploaded.
export async function createProjectIntentAction(
  _prev: CreateProjectIntentState,
  formData: FormData,
): Promise<CreateProjectIntentState> {
  const { userId, role } = await verifySession()
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

  await triggerEntryAutoAssign(created.id)

  revalidatePath('/admin/timeline')
  revalidatePath('/customer-care/dashboard')
  redirect('/customer-care/dashboard')
}

export type SetInvoiceTimelineState = { status: 'idle' | 'error'; message?: string }

// Head of Operations ONLY (exact `users.position` match, not just the
// Operations/Super Admin role) — v2.0 Phase 22: sets the overall delivery
// date + a deadline for every step after Invoice, once the invoice has been
// uploaded (Confirmation Correction/Internal Approval and everything
// downstream). Steps 3/4 (Assign Designer, Brief Taking) are already done by
// the time this runs — they're auto-assigned with an implicit 5-day SLA
// (see lib/workflow-graph.ts autoAssignIfConfigured), not a deadline set here.
export async function setInvoiceTimelineAction(
  _prev: SetInvoiceTimelineState,
  formData: FormData,
): Promise<SetInvoiceTimelineState> {
  const { userId, role } = await verifySession()
  if (!isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only Operations or a Super Admin can set the timeline.' }
  }
  const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
  if (actingUser?.position !== Positions.HeadOfOperations) {
    return { status: 'error', message: 'This step is restricted to the Operations Manager (Admin).' }
  }

  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!projectId) return { status: 'error', message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { status: 'error', message: 'Project not found.' }

  const steps = await getLiveWorkflowSteps()
  const invoiceTimelineStep = steps.find((s) => s.key === 'invoice_timeline')
  if (!invoiceTimelineStep) return { status: 'error', message: 'Invoice timeline step is not configured.' }
  if (proj.currentStep !== invoiceTimelineStep.n) {
    return { status: 'error', message: 'This project is not awaiting the invoice timeline.' }
  }

  const deadlineRaw = String(formData.get('deliveryDate') ?? '').trim()
  if (!deadlineRaw) return { status: 'error', message: 'A delivery deadline is required.' }
  const deliveryDate = new Date(deadlineRaw)
  if (Number.isNaN(deliveryDate.getTime()))
    return { status: 'error', message: 'Please enter a valid deadline.' }

  // Parse + validate per-step deadlines for every step AFTER Invoice Timeline.
  const parsedDeadlines: { stepN: number; deadline: Date }[] = []
  for (const s of steps) {
    if (s.n <= invoiceTimelineStep.n) continue
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

  const advanced = await advanceProjectStep({ projectId, expectedStepN: invoiceTimelineStep.n })
  if (!advanced) {
    return { status: 'error', message: 'Could not complete this step — it may have already moved on.' }
  }

  revalidatePath('/admin/timeline')
  redirect('/admin/timeline')
}

// Admin-only manual override of delivered status (status is otherwise managed
// automatically when the workflow reaches Close Out).
export async function toggleProjectStatusAction(formData: FormData): Promise<void> {
  await requireAdmin()
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
  _prev: FlagState,
  input: { projectId: string; reason?: string },
): Promise<FlagState> {
  const { userId } = await verifySession()
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
  _prev: FlagState,
  input: { projectId: string },
): Promise<FlagState> {
  const { role } = await verifySession()
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
