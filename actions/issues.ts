'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues, projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export async function createIssueAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
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

export async function toggleIssueAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const id = String(formData.get('id') ?? '')
  const [iss] = await db.select().from(issues).where(eq(issues.id, id)).limit(1)
  if (!iss || iss.createdBy !== userId) return // creator-only
  const next = iss.status === 'open' ? 'closed' : 'open'
  await db.update(issues).set({ status: next }).where(eq(issues.id, id))
  revalidatePath('/site-pm/issues')
}
