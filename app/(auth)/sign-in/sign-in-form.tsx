'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signinAction } from '@/actions/auth';
import type { SigninState } from '@/actions/auth';
import PasswordInput from '@/app/_components/password-input';
import { TAB_SESSION_ACTIVATE_EVENT } from '@/app/_components/tab-session-provider';

const initialState: SigninState = {};

/**
 * Client sign-in form calling signinAction directly inside a transition
 * (NOT useActionState + a reactive useEffect on its returned state).
 *
 * Found live 2026-07-20: the useActionState+effect split failed
 * intermittently in `next dev` — if the click landed while React's
 * StrictMode double-mount (dev-only) was mid-cycle for this component, the
 * action's resolved state could land on an already-discarded fiber, so the
 * effect that writes sessionStorage never ran (server-side sign-in still
 * succeeded, cookie set, but this tab's own token never got stored).
 * Awaiting the action directly inside the submit handler's own closure ties
 * the sessionStorage write to the DOM event itself, not to a later,
 * remount-sensitive effect — immune to this race by construction.
 *
 * Every sign-in is per-tab (Phase 20.1 follow-up): the action sets the
 * shared cookie AND returns freshly-minted per-tab tokens. This handler
 * stores them, activates the fetch override, then navigates — the same
 * contract as new-session-form.tsx — so a later sign-in as someone else in
 * another tab (which replaces the browser-wide cookie) can never change who
 * THIS tab is.
 */
export default function SignInForm() {
  const router = useRouter();
  const [state, setState] = useState<SigninState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await signinAction(initialState, formData);
      if (result.accessToken && result.refreshToken && result.expiresAt) {
        sessionStorage.setItem('tabAccessToken', result.accessToken);
        sessionStorage.setItem('tabRefreshToken', result.refreshToken);
        sessionStorage.setItem('tabTokenExpiresAt', String(result.expiresAt));
        window.dispatchEvent(new Event(TAB_SESSION_ACTIVATE_EVENT));
        router.push('/dashboard');
        // Discard any Router-Cache segments rendered under a previous identity
        // (same reasoning as new-session-form.tsx).
        router.refresh();
      } else {
        setState(result);
      }
    });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">
        Sign in to TRT PM
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Welcome back. Enter your credentials.
      </p>

      {state.message && (
        <p
          role="alert"
          className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
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
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <a
              href="/reset-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Accounts are created by your administrator. Contact them if you need access.
      </p>

      <a
        href="/sign-in?newSession=1"
        className="mt-2 block text-center text-sm font-medium text-primary hover:underline"
      >
        Sign in as a different user
      </a>
    </div>
  );
}
