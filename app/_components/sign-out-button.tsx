'use client'

import { signoutAction } from '@/actions/auth'

export default function SignOutButton() {
  return (
    <form
      action={signoutAction}
      onSubmit={() => {
        // Every sign-in is per-tab (Phase 20.1 follow-up): a full sign-out
        // must drop THIS tab's token session too, or the tab would keep
        // acting as the token's user after the shared cookie is cleared.
        // clear() (not 3 named removeItem calls) so nothing session-scoped
        // ever survives a sign-out, even something added later. There is no
        // auth data in localStorage (only the theme preference) — never
        // wiped, since that's a UI setting, not a credential.
        sessionStorage.clear()
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        Sign out
      </button>
    </form>
  )
}
