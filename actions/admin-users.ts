'use server'

import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/db'
import { users } from '@/db/schema'
import { requireAdmin, isAdminRole } from '@/lib/dal'
import { Roles, userRoleLabel, type UserRole } from '@/lib/workflow'
import { sendEmail } from '@/lib/email'
import { credentialsEmail } from '@/lib/email-templates'
import { positionExists } from '@/lib/positions'

const ASSIGNABLE_ROLES: UserRole[] = [
  Roles.FactoryPm,
  Roles.SitePm,
  Roles.SuperAdmin,
  Roles.Operations,
  Roles.Design,
  Roles.Architect,
  Roles.Production,
  Roles.CustomerCare,
  Roles.FactoryOperations,
  Roles.FactoryManager,
]

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
}): Promise<CreateUserResult> {
  await requireAdmin()

  const name = String(input?.name ?? '').trim()
  const email = String(input?.email ?? '').toLowerCase().trim()
  const role = String(input?.role ?? '') as UserRole

  if (name.length < 2) return { ok: false, error: 'Name must be at least 2 characters.' }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email.' }
  // A super admin can create an account for any assignable role, including
  // Super Admin and Operations — admin/operations accounts are no longer
  // seed-only.
  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'That role can\'t be created here.' }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) return { ok: false, error: 'A user with that email already exists.' }

  const tempPassword = generatePassword()
  const hashed = await bcrypt.hash(tempPassword, 10)

  await db.insert(users).values({
    email,
    name,
    role,
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
      roleLabel: userRoleLabel(role),
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

/**
 * Admin-only: set (or clear) another user's position (title), e.g. Head of
 * Design, Operations Admin. Previously position was self-service only via
 * /profile — this lets an admin assign it directly from Manage Users, same
 * protection rules as updateUserRoleAction (cannot touch another admin).
 */
export async function updateUserPositionAction(
  userId: string,
  newPosition: string | null,
): Promise<ActionResult> {
  const { userId: meId } = await requireAdmin()
  if (newPosition && !(await positionExists(newPosition))) {
    return { ok: false, error: 'Invalid position.' }
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  if (isAdminRole(target.role as UserRole) && target.id !== meId) {
    return { ok: false, error: 'You cannot modify another administrator.' }
  }

  await db
    .update(users)
    .set({ position: newPosition, updatedAt: new Date() })
    .where(eq(users.id, userId))
  revalidatePath('/admin/users')
  return { ok: true }
}

type ResetPasswordResult = ActionResult & { tempPassword?: string; emailed?: boolean }

/**
 * Admin-only: set a NEW password for an existing user and return it once so
 * the admin can share it. There is no way to recover a user's ORIGINAL
 * password — passwords are bcrypt-hashed (one-way) by design, same as every
 * other credential in this app; storing them recoverably would be a serious
 * vulnerability (one DB breach exposes every real password). This resets to
 * a fresh temp password instead, covering the actual need (a locked-out
 * user) without that risk.
 */
export async function resetUserPasswordAction(userId: string): Promise<ResetPasswordResult> {
  const { userId: meId } = await requireAdmin()

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { ok: false, error: 'User not found.' }
  if (isAdminRole(target.role as UserRole) && target.id !== meId) {
    return { ok: false, error: 'You cannot reset another administrator\'s password.' }
  }

  const tempPassword = generatePassword()
  const hashed = await bcrypt.hash(tempPassword, 10)
  await db.update(users).set({ hashedPassword: hashed, updatedAt: new Date() }).where(eq(users.id, userId))

  const loginUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/sign-in`
  let emailed = true
  try {
    const { subject, html, text } = credentialsEmail({
      name: target.name,
      email: target.email,
      password: tempPassword,
      roleLabel: userRoleLabel(target.role as UserRole),
      loginUrl,
    })
    await sendEmail({ to: target.email, subject, html, text })
  } catch {
    emailed = false
  }

  revalidatePath('/admin/users')
  return { ok: true, tempPassword, emailed }
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
