'use client'

import { useEffect, useState } from 'react'

// Sibling to SignOutButton (app/_components/sign-out-button.tsx), NOT a
// replacement. Clears only this tab's per-tab session (sessionStorage) and
// hard-navigates to /sign-in. Deliberately never touches the shared
// next-auth cookie/signoutAction — doing so would sign out every other tab,
// violating D-07's per-tab isolation guarantee.
export default function TabSignOutButton() {
  const [hasTabSession, setHasTabSession] = useState(false)

  useEffect(() => {
    setHasTabSession(!!sessionStorage.getItem('tabAccessToken'))
  }, [])

  if (!hasTabSession) return null

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
