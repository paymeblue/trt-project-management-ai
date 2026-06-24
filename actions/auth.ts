'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { AuthError } from 'next-auth'
import { z } from 'zod'
import { signIn, signOut } from '@/auth'

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

// Public self sign-up is disabled. Accounts are created by an administrator
// (Super Admin / Operations), who emails the new user their credentials. This
// action is a no-op kept only so the legacy form import keeps compiling.
export async function signUpAction(
  _prevState: SignupState,
  _formData: FormData,
): Promise<SignupState> {
  void _prevState
  void _formData
  return {
    message: 'Public sign-up is disabled. Ask an administrator to create your account.',
  }
}

// ── signinAction ──────────────────────────────────────────────────────────────

const SigninSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address.' }),
  password: z.string().min(1, { error: 'Password is required.' }),
})

export async function signinAction(
  _prevState: SigninState,
  formData: FormData,
): Promise<SigninState> {
  const parsed = SigninSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Invalid credentials.' }
  }
  const { email, password } = parsed.data

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
  // Auth.js v5-beta can leave the session cookie behind, so a refresh re-auths
  // the user. Clear it ourselves (all known names + secure prefixes) as well.
  await signOut({ redirect: false })

  const store = await cookies()
  const names = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'authjs.csrf-token',
    '__Host-authjs.csrf-token',
  ]
  for (const name of names) {
    if (store.get(name)) store.delete(name)
  }

  redirect('/sign-in')
}
