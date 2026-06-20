'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export async function createProcessAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()

  const title = String(formData.get('title') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!title || !slug || !body) return

  await db.insert(processes).values({
    title,
    slug,
    body,
    createdBy: userId,
  })

  revalidatePath('/processes')
}

export async function updateProcessAction(formData: FormData): Promise<void> {
  await verifySession()

  const slug = String(formData.get('slug') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!slug || !body) return

  await db
    .update(processes)
    .set({ body, updatedAt: new Date() })
    .where(eq(processes.slug, slug))

  revalidatePath(`/processes/${slug}`)
  revalidatePath('/processes')
}
