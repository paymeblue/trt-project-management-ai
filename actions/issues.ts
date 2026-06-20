'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export async function createIssueAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const title = String(formData.get('title') ?? '').trim()
  if (title.length < 2) return
  const description = String(formData.get('description') ?? '').trim() || null
  await db.insert(issues).values({ title, description, createdBy: userId })
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
