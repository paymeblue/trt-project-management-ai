'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

const ROLES = ['factory_pm', 'site_pm', 'super_admin'] as const
type Role = (typeof ROLES)[number]

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const { role } = await verifySession()
  if (role !== 'super_admin') return // admin only
  const userId = String(formData.get('userId') ?? '')
  const newRole = String(formData.get('newRole') ?? '') as Role
  if (!userId || !ROLES.includes(newRole)) return
  await db.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, userId))
  revalidatePath('/admin/users')
}
