'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export async function createProjectAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return
  const location = String(formData.get('location') ?? '').trim() || null
  const deliveryRaw = String(formData.get('deliveryDate') ?? '').trim()
  const deliveryDate = deliveryRaw ? new Date(deliveryRaw) : null

  await db.insert(projects).values({ name, location, deliveryDate, createdBy: userId })

  revalidatePath('/factory-pm/projects')
  revalidatePath('/site-pm/projects')
}

export async function toggleProjectStatusAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const id = String(formData.get('id') ?? '')
  const [proj] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!proj || proj.createdBy !== userId) return // creator-only

  const next = proj.status === 'delivered' ? 'not_delivered' : 'delivered'
  await db.update(projects).set({ status: next, updatedAt: new Date() }).where(eq(projects.id, id))

  revalidatePath('/factory-pm/projects')
  revalidatePath('/site-pm/projects')
}
