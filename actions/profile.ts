'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { POSITION_VALUES } from '@/lib/workflow'

export async function updateProfileAction(formData: FormData): Promise<void> {
  const { userId } = await verifySession()
  const name = String(formData.get('name') ?? '').trim()
  const positionRaw = String(formData.get('position') ?? '').trim()
  const position =
    positionRaw && (POSITION_VALUES as readonly string[]).includes(positionRaw) ? positionRaw : null
  const bioRaw = String(formData.get('bio') ?? '').trim()
  const bio = bioRaw ? bioRaw.slice(0, 500) : null
  // Avatar: a valid data:image keeps/sets it; empty string removes it.
  const avatarRaw = String(formData.get('avatarData') ?? '')
  const avatarData =
    avatarRaw.startsWith('data:image/') && avatarRaw.length < 3_000_000 ? avatarRaw : null
  if (name.length < 2) return
  await db
    .update(users)
    .set({ name, position, bio, avatarData, updatedAt: new Date() })
    .where(eq(users.id, userId))
  revalidatePath('/profile')
}
