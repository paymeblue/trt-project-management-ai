'use client'

import { useActionState } from 'react'
import { signinAction } from '@/actions/auth'
import type { SigninState } from '@/actions/auth'

const initialState: SigninState = {}

/**
 * Client sign-in form wired to signinAction via useActionState.
 * On success the action redirects (NEXT_REDIRECT) to /dashboard.
 */
export default function SignInForm() {
  const [state, formAction, pending] = useActionState<SigninState, FormData>(
    signinAction,
    initialState,
  )

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Sign in to TRT PM</h1>
      <p className="mb-6 text-sm text-gray-500">Welcome back. Enter your credentials.</p>

      {state.message && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {state.message}
        </p>
      )}

      <form action={formAction} className="space-y-4">
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
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <a href="/reset-password" className="text-xs font-medium text-blue-600 hover:underline">
              Forgot password?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <a href="/sign-up" className="font-medium text-blue-600 hover:underline">
          Create one
        </a>
      </p>
    </div>
  )
}
