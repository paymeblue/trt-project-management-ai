'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import { FIRST_ACTION_STEP } from '@/lib/workflow'

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
