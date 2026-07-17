'use client'

import { useSyncExternalStore } from 'react'

// Sibling to SignOutButton (app/_components/sign-out-button.tsx), NOT a
// replacement. Clears only this tab's per-tab session (sessionStorage) and
// hard-navigates to /sign-in. Deliberately never touches the shared
// next-auth cookie or shared sign-out flow — doing so would sign out every
// other tab, violating D-07's per-tab isolation guarantee.
//
// Reads sessionStorage via useSyncExternalStore (matching this repo's
// established pattern in theme-toggle.tsx) rather than useEffect+setState,
// which avoids the "setState synchronously within an effect" lint error.
function subscribe() {
  return () => {}
}
function hasTabSession() {
  return typeof window !== 'undefined' && !!sessionStorage.getItem('tabAccessToken')
}

export default function TabSignOutButton() {
  const hasSession = useSyncExternalStore(subscribe, hasTabSession, () => false)

  if (!hasSession) return null

  const handleSignOut = () => {
    sessionStorage.removeItem('tabAccessToken')
    sessionStorage.removeItem('tabRefreshToken')
    sessionStorage.removeItem('tabTokenExpiresAt')
    window.location.href = '/sign-in'
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
    >
      Sign out (this tab)
    </button>
  )
}
