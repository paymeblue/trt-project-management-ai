'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues, projects } from '@/db/schema'
import { verifySessionForAction, requireAdminForAction } from '@/lib/dal'
import { notifyAllSuperAdmins } from '@/lib/notifications'

export async function createIssueAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  const title = String(formData.get('title') ?? '').trim()
  const projectId = String(formData.get('projectId') ?? '')
  if (title.length < 2 || !projectId) return
  // Every issue must be tied to a real project (REQ-G03).
  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!proj) return
  const description = String(formData.get('description') ?? '').trim() || null
  await db.insert(issues).values({ title, description, projectId, createdBy: userId })
  revalidatePath('/site-pm/issues')
}

export async function toggleIssueAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  const id = String(formData.get('id') ?? '')
  const [iss] = await db.select().from(issues).where(eq(issues.id, id)).limit(1)
  if (!iss || iss.createdBy !== userId) return // creator-only
  const next = iss.status === 'open' ? 'closed' : 'open'
  await db.update(issues).set({ status: next }).where(eq(issues.id, id))
  revalidatePath('/site-pm/issues')
}

// Admin-only: open/close ANY issue from the admin issue log (REQ-G10 acting).
export async function adminToggleIssueAction(tabToken: string | null, formData: FormData): Promise<void> {
  await requireAdminForAction(tabToken)
  const id = String(formData.get('id') ?? '')
  const [iss] = await db.select().from(issues).where(eq(issues.id, id)).limit(1)
  if (!iss) return
  const next = iss.status === 'open' ? 'closed' : 'open'
  await db.update(issues).set({ status: next }).where(eq(issues.id, id))
  revalidatePath('/admin/issues')
}

// Escalate an issue to every super admin (REQ-G10): marks it escalated and fans
// out an in-app alert linking to the project.
export async function escalateIssueAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  const id = String(formData.get('id') ?? '')
  const [iss] = await db.select().from(issues).where(eq(issues.id, id)).limit(1)
  if (!iss || iss.createdBy !== userId) return // creator escalates their own issue
  if (iss.escalatedAt) return // already escalated

  await db.update(issues).set({ escalatedAt: new Date() }).where(eq(issues.id, id))
  await notifyAllSuperAdmins({
    type: 'escalation',
    title: `Issue escalated: ${iss.title}`,
    body: iss.description || 'Escalated for super-admin attention.',
    projectId: iss.projectId,
    actorId: userId,
  })
  revalidatePath('/site-pm/issues')
}
