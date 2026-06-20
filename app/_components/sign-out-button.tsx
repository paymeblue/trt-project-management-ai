'use client'

import { signoutAction } from '@/actions/auth'

export default function SignOutButton() {
  return (
    <form action={signoutAction}>
      <button
        type="submit"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
      >
        Sign out
      </button>
    </form>
  )
}
