'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, projectStepDeadlines } from '@/db/schema'
import { requireAdmin, verifySession } from '@/lib/dal'
import { FIRST_ACTION_STEP, Roles, isAdminRole, lastStepN, projectComplete, type UserRole } from '@/lib/workflow'
import { getLiveWorkflowSteps, completeGraphStep } from '@/lib/workflow-graph'
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

  revalidatePath('/admin/timeline')
  revalidatePath('/customer-care/dashboard')
  redirect('/customer-care/dashboard')
}

export type SetInvoiceTimelineState = { status: 'idle' | 'error'; message?: string }

// Operations OR a Super Admin (D-01, quick task 260713-rb2 — role=operations
// already admits both via isAdminRole; requiredPosition is null on the
// merged step, so no exact-position gate here) — part 2 of the merged
// Invoice & Delivery Timeline step's 2-part wizard: sets the overall
// delivery date + a deadline for every step after it, once the invoice has
// been uploaded (part 1). Steps 2/3 (Assign Designer, Brief Taking) are
// handled manually (Head Designer assigns; the assigned designer takes the
// brief) before this runs, so no deadline is set for them here.
export async function setInvoiceTimelineAction(
  _prev: SetInvoiceTimelineState,
  formData: FormData,
): Promise<SetInvoiceTimelineState> {
  const { userId, role } = await verifySession()
  if (!isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only Operations or a Super Admin can set the timeline.' }
  }

  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!projectId) return { status: 'error', message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { status: 'error', message: 'Project not found.' }

  const steps = await getLiveWorkflowSteps()
  const mergedStep = steps.find((s) => s.key === 'invoice_upload')
  if (!mergedStep) return { status: 'error', message: 'Invoice & Delivery Timeline step is not configured.' }
  if (proj.currentStep !== mergedStep.n) {
    return { status: 'error', message: 'This project is not awaiting the invoice & delivery timeline.' }
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

  // Single completion of the merged step (D-02) — advances
  // projects.currentStep via syncProjectCurrentStepAfterCompletion, straight
  // to Design Initiation. Throws 'step-not-fulfilled' if part 1 (the
  // invoice upload) hasn't been recorded yet — a spoofed direct part-2
  // submit can't skip part 1 (T-rb2-02).
  try {
    await completeGraphStep({ projectId, stepDefId: mergedStep.stepDefId, actorId: userId })
  } catch (err) {
    if (err instanceof Error && err.message === 'step-not-fulfilled') {
      return { status: 'error', message: 'Upload the invoice before setting the delivery timeline.' }
    }
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
