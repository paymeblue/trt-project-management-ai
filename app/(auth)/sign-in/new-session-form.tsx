'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tabSigninAction } from '@/actions/tab-auth';
import type { TabSigninState } from '@/actions/tab-auth';
import PasswordInput from '@/app/_components/password-input';

const initialState: TabSigninState = {};

/**
 * Client form for the "sign in as a different user" per-tab flow.
 * Wired to tabSigninAction via useActionState. On success, the tokens are
 * written to sessionStorage BEFORE any client-side navigation occurs — the
 * action itself never redirects, since a server-side redirect would discard
 * the freshly-minted tokens before this component could capture them.
 */
export default function NewSessionForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<TabSigninState, FormData>(
    tabSigninAction,
    initialState,
  );

  useEffect(() => {
    if (state.accessToken && state.refreshToken && state.expiresAt) {
      sessionStorage.setItem('tabAccessToken', state.accessToken);
      sessionStorage.setItem('tabRefreshToken', state.refreshToken);
      sessionStorage.setItem('tabTokenExpiresAt', String(state.expiresAt));
      router.push('/dashboard');
    }
  }, [state, router]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-gray-900">
        Sign in as a different user
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        This starts a new session in this tab only — other open tabs keep
        their own sign-in untouched.
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
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Password
          </label>
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
        Didn&apos;t mean to open a new session?{' '}
        <a href="/sign-in" className="font-medium text-primary hover:underline">
          Return to normal sign-in
        </a>
        .
      </p>
    </div>
  );
}
