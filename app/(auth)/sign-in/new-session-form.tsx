'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { tabSigninAction } from '@/actions/tab-auth';
import type { TabSigninState } from '@/actions/tab-auth';
import PasswordInput from '@/app/_components/password-input';
import { TAB_SESSION_ACTIVATE_EVENT } from '@/app/_components/tab-session-provider';

const initialState: TabSigninState = {};

/**
 * Client form for the "sign in as a different user" per-tab flow, calling
 * tabSigninAction directly inside a transition (NOT useActionState + a
 * reactive useEffect on its returned state — see sign-in-form.tsx for why:
 * that split raced against React StrictMode's dev-only double-mount cycle
 * and could silently drop the token write). Awaiting the action inside the
 * submit handler's own closure ties the sessionStorage write to the DOM
 * event itself, immune to that race by construction.
 *
 * On success, the tokens are written to sessionStorage BEFORE any
 * client-side navigation occurs — the action itself never redirects, since
 * a server-side redirect would discard the freshly-minted tokens before
 * this component could capture them.
 */
export default function NewSessionForm() {
  const router = useRouter();
  const [state, setState] = useState<TabSigninState>(initialState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await tabSigninAction(initialState, formData);
      if (result.accessToken && result.refreshToken && result.expiresAt) {
        sessionStorage.setItem('tabAccessToken', result.accessToken);
        sessionStorage.setItem('tabRefreshToken', result.refreshToken);
        sessionStorage.setItem('tabTokenExpiresAt', String(result.expiresAt));
        // TabSessionProvider mounts once at the root layout and won't see this
        // brand-new token on its own — tell it to activate the fetch override
        // NOW, synchronously, before router.push() below fires the RSC fetch
        // for /dashboard. Without this, that first navigation goes out
        // unauthenticated-by-header and falls through to the shared cookie,
        // rendering the ORIGINAL user's dashboard instead of this new one.
        window.dispatchEvent(new Event(TAB_SESSION_ACTIVATE_EVENT));
        router.push('/dashboard');
        // The (app) layout (sidebar, name/role header) is a shared segment
        // Next's client Router Cache can reuse across a soft navigation even
        // though page.tsx re-executes verifySession() fresh — without this,
        // the URL and page body correctly reflect the new per-tab user while
        // the sidebar keeps showing the ORIGINAL user's nav shape. refresh()
        // discards the cached segment tree so the layout re-renders from the
        // new Authorization-header identity too.
        router.refresh();
      } else {
        setState(result);
      }
    });
  }

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
