import type { ReactNode } from 'react'

/**
 * Public auth layout — no session check.
 * Wraps verify-email and reset-password pages with minimal chrome.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
