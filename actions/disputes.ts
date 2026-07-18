'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projectDisputes, projects } from '@/db/schema'
import { verifySessionForAction } from '@/lib/dal'

// Post a message to a project's dispute thread (REQ-G10). Any authenticated user
// (participants + super admins) can post — the boards are already shared.
export async function postDisputeMessageAction(tabToken: string | null, formData: FormData): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  const projectId = String(formData.get('projectId') ?? '')
  const body = String(formData.get('body') ?? '').trim()
  if (!projectId || body.length < 1) return

  const [proj] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!proj) return

  await db.insert(projectDisputes).values({ projectId, authorId: userId, body })
  revalidatePath(`/disputes/${projectId}`)
}
