'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, projectStepDeadlines } from '@/db/schema'
import { requireAdmin, verifySession } from '@/lib/dal'
import { FIRST_ACTION_STEP, WORKFLOW_STEPS, Roles, isProjectComplete } from '@/lib/workflow'
import { notifyAllSuperAdmins } from '@/lib/notifications'

function revalidateProjectBoards() {
  revalidatePath('/admin/timeline')
  revalidatePath('/site-pm/projects')
  revalidatePath('/factory-pm/projects')
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
  for (const s of WORKFLOW_STEPS) {
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
  if (isProjectComplete(proj.currentStep))
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
