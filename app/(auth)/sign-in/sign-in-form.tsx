'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signinAction } from '@/actions/auth';
import type { SigninState } from '@/actions/auth';
import PasswordInput from '@/app/_components/password-input';
import { TAB_SESSION_ACTIVATE_EVENT } from '@/app/_components/tab-session-provider';

const initialState: SigninState = {};

/**
 * Client sign-in form wired to signinAction via useActionState.
 *
 * Every sign-in is per-tab (Phase 20.1 follow-up): the action sets the
 * shared cookie AND returns freshly-minted per-tab tokens instead of
 * redirecting server-side. This effect stores them, activates the fetch
 * override, then navigates — the same contract as new-session-form.tsx —
 * so a later sign-in as someone else in another tab (which replaces the
 * browser-wide cookie) can never change who THIS tab is.
 */
export default function SignInForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SigninState, FormData>(
    signinAction,
    initialState,
  );

  useEffect(() => {
    if (state.accessToken && state.refreshToken && state.expiresAt) {
      sessionStorage.setItem('tabAccessToken', state.accessToken);
      sessionStorage.setItem('tabRefreshToken', state.refreshToken);
      sessionStorage.setItem('tabTokenExpiresAt', String(state.expiresAt));
      window.dispatchEvent(new Event(TAB_SESSION_ACTIVATE_EVENT));
      router.push('/dashboard');
      // Discard any Router-Cache segments rendered under a previous identity
      // (same reasoning as new-session-form.tsx).
      router.refresh();
    }
  }, [state, router]);

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

      <form action={formAction} className="space-y-4">
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
