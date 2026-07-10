'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, projectStepDeadlines } from '@/db/schema'
import { requireAdmin, verifySession } from '@/lib/dal'
import { FIRST_ACTION_STEP, Roles, isAdminRole, lastStepN, projectComplete, type UserRole } from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'
import { advanceProjectStep } from '@/actions/workflow'
import { notifyAllSuperAdmins } from '@/lib/notifications'

function revalidateProjectBoards() {
  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
}

// v2.0 Phase 22: "Assign Designer/Architect for Brief" (stepN 3) and "Brief
// Taking" (stepN 4) must each be due within 5 days of when Operations sets
// the timeline (business rule from the production-pipeline update — these
// are the two steps immediately after Payment Confirmation & Timeline).
const FIVE_DAY_MAX_STEP_NS = new Set([3, 4])
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

function checkFiveDayCap(parsedDeadlines: { stepN: number; deadline: Date }[], anchor: Date): string | null {
  const limit = new Date(anchor.getTime() + FIVE_DAYS_MS)
  for (const { stepN, deadline } of parsedDeadlines) {
    if (FIVE_DAY_MAX_STEP_NS.has(stepN) && deadline > limit) {
      return `Step ${stepN}'s deadline must be within 5 days — it can't be later than ${limit.toLocaleDateString()}.`
    }
  }
  return null
}

export type CreateProjectState = { status: 'idle' | 'error'; message?: string }

// Operations / Super Admin only. Creates a project, sets its deadline, marks the
// "New Project" step (step 1) complete, and parks it at the first actionable step.
export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const { userId } = await requireAdmin()

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return { status: 'error', message: 'Project name is required.' }

  const location = String(formData.get('location') ?? '').trim() || null

  const deadlineRaw = String(formData.get('deliveryDate') ?? '').trim()
  if (!deadlineRaw) return { status: 'error', message: 'A delivery deadline is required.' }
  const deliveryDate = new Date(deadlineRaw)
  if (Number.isNaN(deliveryDate.getTime()))
    return { status: 'error', message: 'Please enter a valid deadline.' }

  // Parse the per-step deadlines (REQ-G05) up front and validate ORDER before
  // creating anything: a later step can't be due before an earlier one (#4).
  const parsedDeadlines: { stepN: number; deadline: Date }[] = []
  for (const s of await getLiveWorkflowSteps()) {
    if (s.n < FIRST_ACTION_STEP) continue // step 1 auto-completes, no deadline
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
  // The final delivery deadline should not precede the last step deadline either.
  const lastStepDl = parsedDeadlines[parsedDeadlines.length - 1]?.deadline
  if (lastStepDl && deliveryDate < lastStepDl) {
    return {
      status: 'error',
      message: 'The final delivery deadline must be on or after the last step deadline.',
    }
  }
  const fiveDayError = checkFiveDayCap(parsedDeadlines, new Date())
  if (fiveDayError) return { status: 'error', message: fiveDayError }

  const [created] = await db
    .insert(projects)
    .values({ name, location, deliveryDate, createdBy: userId, currentStep: FIRST_ACTION_STEP })
    .returning({ id: projects.id })

  await db.insert(projectStepCompletions).values({
    projectId: created.id,
    stepKey: 'new_project',
    stepN: 1,
    completedBy: userId,
  })

  if (parsedDeadlines.length) {
    await db
      .insert(projectStepDeadlines)
      .values(parsedDeadlines.map((p) => ({ projectId: created.id, stepN: p.stepN, deadline: p.deadline })))
  }

  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
  redirect('/admin/timeline')
}

export type CreateProjectIntentState = { status: 'idle' | 'error'; message?: string }

// Customer Care (or admin) only. Captures the client's intent from the intake
// call and creates the project — unpaid by default (STG-01, PAY-01). No
// deadlines are collected here; Operations sets the timeline and confirms
// payment at step 2 (Payment Confirmation & Timeline).
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

export type ConfirmPaymentState = { status: 'idle' | 'error'; message?: string }

// Operations / Super Admin only. Completes step 2 (Payment Confirmation &
// Timeline, PAY-02): toggles the project to `paid` and sets the per-step
// deadlines for every remaining step, then advances past this step via the
// same generic advancement engine every other step uses.
export async function confirmPaymentAndSetTimelineAction(
  _prev: ConfirmPaymentState,
  formData: FormData,
): Promise<ConfirmPaymentState> {
  await requireAdmin()

  const projectId = String(formData.get('projectId') ?? '').trim()
  if (!projectId) return { status: 'error', message: 'Missing project.' }

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!proj) return { status: 'error', message: 'Project not found.' }
  if (proj.currentStep !== 2)
    return { status: 'error', message: 'This project is not awaiting payment confirmation.' }

  const deadlineRaw = String(formData.get('deliveryDate') ?? '').trim()
  if (!deadlineRaw) return { status: 'error', message: 'A delivery deadline is required.' }
  const deliveryDate = new Date(deadlineRaw)
  if (Number.isNaN(deliveryDate.getTime()))
    return { status: 'error', message: 'Please enter a valid deadline.' }

  // Parse + validate per-step deadlines for every step AFTER this one (3+).
  const parsedDeadlines: { stepN: number; deadline: Date }[] = []
  for (const s of await getLiveWorkflowSteps()) {
    if (s.n <= 2) continue // step 1 auto-completed; step 2 is this one, no future deadline needed
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
  const fiveDayError = checkFiveDayCap(parsedDeadlines, new Date())
  if (fiveDayError) return { status: 'error', message: fiveDayError }

  await db
    .update(projects)
    .set({ paymentStatus: 'paid', deliveryDate, updatedAt: new Date() })
    .where(eq(projects.id, projectId))

  if (parsedDeadlines.length) {
    await db
      .insert(projectStepDeadlines)
      .values(parsedDeadlines.map((p) => ({ projectId, stepN: p.stepN, deadline: p.deadline })))
      .onConflictDoUpdate({
        target: [projectStepDeadlines.projectId, projectStepDeadlines.stepN],
        set: { deadline: sql`excluded.deadline` },
      })
  }

  const advanced = await advanceProjectStep({ projectId, expectedStepN: 2 })
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
