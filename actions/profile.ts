'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export async function updateProfileAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const name = String(formData.get('name') ?? '').trim()
  const position = String(formData.get('position') ?? '').trim() || null
  const bioRaw = String(formData.get('bio') ?? '').trim()
  const bio = bioRaw ? bioRaw.slice(0, 500) : null
  if (name.length < 2) return
  await db
    .update(users)
    .set({ name, position, bio, updatedAt: new Date() })
    .where(eq(users.id, userId))
  revalidatePath('/profile')
}
