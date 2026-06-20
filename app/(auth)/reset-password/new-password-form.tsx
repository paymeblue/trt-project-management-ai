'use client'

import { useActionState } from 'react'
import { resetPasswordAction } from '@/actions/email-auth'
import type { ResetPasswordState } from '@/actions/email-auth'

interface Props {
  token: string
}

const initialState: ResetPasswordState = {}

/**
 * Client component: collects a new password and submits it together with the
 * reset token to resetPasswordAction via useActionState.
 */
export default function NewPasswordForm({ token }: Props) {
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    initialState,
  )

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Set a new password</h1>
      <p className="mb-6 text-sm text-gray-500">
        Choose a strong password of at least 8 characters.
      </p>

      {state.error && (
        <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {state.message ? (
        <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-700">
          {state.message}{' '}
          <a href="/sign-in" className="font-medium underline">
            Sign in
          </a>
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          {/* Hidden field carries the reset token to the server action */}
          <input type="hidden" name="token" value={token} />

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  )
}
