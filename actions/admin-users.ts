'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { requireAdmin, isAdminRole } from '@/lib/dal'
import { Roles, type UserRole } from '@/lib/workflow'
import { sendEmail } from '@/lib/email'
import { credentialsEmail } from '@/lib/email-templates'

const ASSIGNABLE_ROLES: UserRole[] = [
  Roles.FactoryPm,
  Roles.SitePm,
  Roles.SuperAdmin,
  Roles.Operations,
]

// Roles an admin may create from the UI (PMs). Admins/operations come from seeds.
const CREATABLE_ROLES: UserRole[] = [Roles.FactoryPm, Roles.SitePm]

const ROLE_LABELS: Record<UserRole, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
  operations: 'Operations',
}

type ActionResult = { ok: boolean; error?: string }
type CreateUserResult = ActionResult & { tempPassword?: string; emailed?: boolean }

function generatePassword() {
  // 16-char url-safe temporary password.
  return randomBytes(12).toString('base64url')
}

/** Admin-only: create a PM account and email them their credentials. */
export async function createUserAction(input: {
  name: string
  email: string
  role: string
  position?: string
}): Promise<CreateUserResult> {
  await requireAdmin()

  const name = String(input?.name ?? '').trim()
  const email = String(input?.email ?? '').toLowerCase().trim()
  const role = String(input?.role ?? '') as UserRole
  const position = String(input?.position ?? '').trim() || null

  if (name.length < 2) return { ok: false, error: 'Name must be at least 2 characters.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email.' }
  if (!CREATABLE_ROLES.includes(role)) return { ok: false, error: 'Role must be Factory PM or Site PM.' }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) return { ok: false, error: 'A user with that email already exists.' }

  const tempPassword = generatePassword()
  const hashed = await bcrypt.hash(tempPassword, 10)

  await db.insert(users).values({
    email,
    name,
    role,
    position,
    hashedPassword: hashed,
    emailVerified: new Date(), // admin-created accounts are pre-verified
  })

  // Email the credentials. Don't fail account creation if email send fails —
  // surface the temp password to the admin instead.
  const loginUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/sign-in`
  let emailed = true
  try {
    const { subject, html, text } = credentialsEmail({
      name,
      email,
      password: tempPassword,
      roleLabel: ROLE_LABELS[role],
      loginUrl,
    })
    await sendEmail({ to: email, subject, html, text })
  } catch {
    emailed = false
  }

  revalidatePath('/admin/users')
  return { ok: true, tempPassword, emailed }
}

/** Client-callable role update with the admin guard. */
export async function updateUserRoleAction(userId: string, newRole: string): Promise<ActionResult> {
  const { userId: meId } = await requireAdmin()
  if (!ASSIGNABLE_ROLES.includes(newRole as UserRole)) return { ok: false, error: 'Invalid role.' }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  // Admin accounts (Super Admin / Operations) can never be modified by someone else.
  if (isAdminRole(target.role as UserRole) && target.id !== meId) {
    return { ok: false, error: 'You cannot modify another administrator.' }
  }

  await db
    .update(users)
    .set({ role: newRole as UserRole, updatedAt: new Date() })
    .where(eq(users.id, userId))
  revalidatePath('/admin/users')
  return { ok: true }
}

/** Delete a user, with guards against removing administrators or yourself. */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const { userId: meId } = await requireAdmin()
  if (userId === meId) return { ok: false, error: 'You cannot delete your own account.' }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  if (isAdminRole(target.role as UserRole)) {
    return { ok: false, error: 'You cannot delete an administrator.' }
  }

  try {
    await db.delete(users).where(eq(users.id, userId))
  } catch {
    return { ok: false, error: 'This user has linked records (projects, checklists…) and cannot be deleted.' }
  }
  revalidatePath('/admin/users')
  return { ok: true }
}
