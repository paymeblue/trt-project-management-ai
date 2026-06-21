'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

const ROLES = ['factory_pm', 'site_pm', 'super_admin'] as const
type Role = (typeof ROLES)[number]

type ActionResult = { ok: boolean; error?: string }

/** Client-callable role update with the Super-Admin guard. */
export async function updateUserRoleAction(userId: string, newRole: string): Promise<ActionResult> {
  const { role, userId: meId } = await verifySession()
  if (role !== 'super_admin') return { ok: false, error: 'Not allowed.' }
  if (!ROLES.includes(newRole as Role)) return { ok: false, error: 'Invalid role.' }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  // A Super Admin can never modify another Super Admin.
  if (target.role === 'super_admin' && target.id !== meId) {
    return { ok: false, error: 'You cannot modify another Super Admin.' }
  }

  await db.update(users).set({ role: newRole as Role, updatedAt: new Date() }).where(eq(users.id, userId))
  revalidatePath('/admin/users')
  return { ok: true }
}

/** Delete a user, with guards against removing Super Admins or yourself. */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const { role, userId: meId } = await verifySession()
  if (role !== 'super_admin') return { ok: false, error: 'Not allowed.' }
  if (userId === meId) return { ok: false, error: 'You cannot delete your own account.' }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  if (target.role === 'super_admin') {
    return { ok: false, error: 'You cannot delete a Super Admin.' }
  }

  try {
    await db.delete(users).where(eq(users.id, userId))
  } catch {
    return { ok: false, error: 'This user has linked records (projects, checklists…) and cannot be deleted.' }
  }
  revalidatePath('/admin/users')
  return { ok: true }
}
