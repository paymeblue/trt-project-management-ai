'use client'

import { useActionState } from 'react'
import { signUpAction } from '@/actions/auth'
import type { SignupState } from '@/actions/auth'

const initialState: SignupState = {}

const ROLES = [
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'site_pm', label: 'Site PM' },
] as const

/**
 * Client sign-up form wired to signUpAction via useActionState.
 * Role is restricted to the two self-serve PM roles (Super Admin is seeded separately).
 * On success the action signs the user in and redirects to /dashboard.
 */
export default function SignUpForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signUpAction,
    initialState,
  )

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Create your TRT PM account</h1>
      <p className="mb-6 text-sm text-gray-500">Pick your role to get started.</p>

      {state.message && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
            Full name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Jane Doe"
          />
          {state.errors?.name && (
            <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="you@example.com"
          />
          {state.errors?.email && (
            <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="role" className="mb-1 block text-sm font-medium text-gray-700">
            Role
          </label>
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="" disabled>
              Select your role…
            </option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {state.errors?.role && (
            <p className="mt-1 text-xs text-red-600">{state.errors.role[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="At least 8 characters"
          />
          {state.errors?.password && (
            <p className="mt-1 text-xs text-red-600">{state.errors.password[0]}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <a href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </a>
      </p>
    </div>
  )
}
