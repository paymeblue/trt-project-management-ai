'use server'

import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { signIn, signOut } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import { sendVerificationEmail } from '@/lib/auth/email-flows'

// ── Role whitelist (privilege-escalation guard: only public roles allowed) ──
const ALLOWED_ROLES = ['factory_pm', 'site_pm'] as const

const SignupSchema = z.object({
  name: z.string().min(2, { error: 'Name must be at least 2 characters.' }),
  email: z.email({ error: 'Please enter a valid email address.' }),
  password: z.string().min(8, { error: 'Password must be at least 8 characters.' }),
  role: z.enum(ALLOWED_ROLES, { error: 'Role must be factory_pm or site_pm.' }),
})

// ── Action result types ───────────────────────────────────────────────────────

export type SignupState = {
  errors?: {
    name?: string[]
    email?: string[]
    password?: string[]
    role?: string[]
  }
  message?: string
}

export type SigninState = {
  message?: string
}

// ── signUpAction ──────────────────────────────────────────────────────────────

export async function signUpAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, email: rawEmail, password, role } = parsed.data
  const email = rawEmail.toLowerCase().trim()

  const hashed = await bcrypt.hash(password, 10)

  // Optional profile fields
  const bioRaw = String(formData.get('bio') ?? '').trim()
  const bio = bioRaw ? bioRaw.slice(0, 500) : null
  const avatarRaw = String(formData.get('avatarData') ?? '')
  const avatarData =
    avatarRaw.startsWith('data:image/') && avatarRaw.length < 3_000_000 ? avatarRaw : null

  const [row] = await db
    .insert(users)
    .values({ email, name, role, hashedPassword: hashed, bio, avatarData })
    .returning({ id: users.id })

  // Send verification email — do NOT fail signup on send error
  await sendVerificationEmail(row.id, email).catch(() => {
    // Swallow: verification email can be re-sent; the account is already created
  })

  // Sign in immediately after insert — await insert is already done above
  await signIn('credentials', { email, password, redirect: false })

  redirect('/dashboard')
}

// ── signinAction ──────────────────────────────────────────────────────────────

export async function signinAction(
  _prevState: SigninState,
  formData: FormData,
): Promise<SigninState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: 'Invalid email or password.' }
    }
    // Re-throw redirect errors (NEXT_REDIRECT) so Next.js handles them
    throw error
  }
  return {}
}

// ── signoutAction ─────────────────────────────────────────────────────────────

export async function signoutAction(): Promise<void> {
  await signOut({ redirectTo: '/sign-in' })
}
