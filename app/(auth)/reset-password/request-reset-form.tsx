'use client'

import { useActionState } from 'react'
import { requestPasswordResetAction } from '@/actions/email-auth'
import type { ResetRequestState } from '@/actions/email-auth'

const initialState: ResetRequestState = { message: '' }

/**
 * Client component for the password-reset request form.
 * Wires useActionState to requestPasswordResetAction so the generic
 * non-enumerating message is displayed inline after submission.
 */
export default function RequestResetForm() {
  const [state, formAction, pending] = useActionState<ResetRequestState, FormData>(
    requestPasswordResetAction,
    initialState,
  )

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">Reset your password</h1>
      <p className="mb-6 text-sm text-gray-500">
        Enter your account email address and we will send you a reset link.
      </p>

      {state.message && (
        <p role="status" className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
          {state.message}
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Email address
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
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  )
}
