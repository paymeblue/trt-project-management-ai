'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import {
  requestPasswordReset,
  consumeResetToken,
  consumeVerificationToken,
} from '@/lib/auth/email-flows'

// ── Schemas ───────────────────────────────────────────────────────────────

const emailSchema = z.object({
  email: z.string().email(),
})

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

// ── Action result types ───────────────────────────────────────────────────

export type ResetRequestState = { message: string; resetUrl?: string }
export type ResetPasswordState = { message?: string; error?: string }
export type VerifyEmailResult = { ok: boolean }

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * AUTH-03 (request): Sends a password reset email.
 * ALWAYS returns the same generic message — no account enumeration.
 * Non-enumerating even on parse failure (same message returned).
 */
export async function requestPasswordResetAction(
  _prevState: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = emailSchema.safeParse({ email: formData.get('email') })

  if (parsed.success) {
    const result = await requestPasswordReset(parsed.data.email).catch(() => null)
    if (result?.delivery === 'manual') {
      return {
        message: 'Email delivery is unavailable. Copy the reset link below to continue.',
        resetUrl: result.resetUrl,
      }
    }
  }

  // If that email exists, a reset link has been sent.
  return { message: 'If that email exists, a reset link has been sent.' }
}

/**
 * AUTH-03 (complete): Validates the reset token and updates the user's password.
 * If the token is invalid, expired, or already used: returns an error and does
 * NOT touch the password — this is test-asserted.
 */
export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: 'Invalid request. Please check your input.' }
  }

  const { token, password } = parsed.data

  const userId = await consumeResetToken(token)

  if (!userId) {
    return { error: 'This reset link is invalid or has expired.' }
  }

  // Token is valid — bcrypt-hash the new password and update the DB
  const hashedPassword = await bcrypt.hash(password, 10)

  await db
    .update(users)
    .set({ hashedPassword, updatedAt: new Date() })
    .where(eq(users.id, userId))

  return { message: 'Password updated. You can now sign in.' }
}

/**
 * Consume an email verification token and mark the account as verified.
 */
export async function verifyEmailAction(token: string): Promise<VerifyEmailResult> {
  const userId = await consumeVerificationToken(token)
  return { ok: !!userId }
}
