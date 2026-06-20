import 'server-only'
import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, verificationTokens, passwordResetTokens } from '@/db/schema'
import { sendEmail } from '@/lib/email'
import { verificationEmail, passwordResetEmail } from '@/lib/email-templates'

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

const TTL_MS = 1000 * 60 * 60 // 1 hour

/**
 * Issue a verification token for the given user and send the verification email.
 * The raw token is included only in the emailed URL — it is never persisted.
 */
export async function sendVerificationEmail(userId: string, email: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true },
  })
  const name = user?.name ?? 'there'

  const raw = randomBytes(32).toString('hex')
  await db.insert(verificationTokens).values({
    userId,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + TTL_MS),
  })

  const url = `${process.env.APP_URL}/verify-email?token=${raw}`
  const { subject, html, text } = verificationEmail({ name, verifyUrl: url })
  return sendEmail({ to: email, subject, html, text })
}

/**
 * Consume a verification token: validates it is not expired or already used,
 * marks it used, and sets users.emailVerified.
 * Returns the userId on success, null on failure.
 */
export async function consumeVerificationToken(rawToken: string) {
  const tokenHash = hash(rawToken)
  const row = await db.query.verificationTokens.findFirst({
    where: eq(verificationTokens.tokenHash, tokenHash),
  })

  if (!row || row.usedAt || row.expiresAt < new Date()) return null

  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, row.id))

  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.id, row.userId))

  return row.userId
}

/**
 * Issue a password-reset token and email the reset link.
 * DO NOT reveal whether the email exists — always return the same shape.
 */
export async function requestPasswordReset(email: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
    columns: { id: true, name: true },
  })

  // do NOT reveal whether the email exists
  if (!user) return { data: null, error: null }

  const raw = randomBytes(32).toString('hex')
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + TTL_MS),
  })

  const url = `${process.env.APP_URL}/reset-password?token=${raw}`
  const { subject, html, text } = passwordResetEmail({ name: user.name, resetUrl: url })
  return sendEmail({ to: email, subject, html, text })
}

/**
 * Consume a reset token: validates it is not expired or already used,
 * marks it used (single-use), and returns the userId.
 * The caller is responsible for updating the password.
 */
export async function consumeResetToken(rawToken: string) {
  const tokenHash = hash(rawToken)
  const row = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.tokenHash, tokenHash),
  })

  if (!row || row.usedAt || row.expiresAt < new Date()) return null

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id))

  // caller updates the password; token already marked single-use
  return row.userId
}
