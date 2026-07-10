'use client'

import Link from 'next/link'

// Client error boundary for every (app) page: guarantees a visible fallback
// (never a blank screen) for any error thrown during render.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-6">
        <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-500">{error.message || 'An unexpected error occurred.'}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => reset()}
            className="rounded-md bg-surface-container-high px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-outline-variant px-4 py-2 text-sm font-medium text-gray-900 hover:bg-surface-container"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
