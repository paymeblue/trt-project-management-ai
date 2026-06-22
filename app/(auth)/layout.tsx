import type { ReactNode } from 'react'
import Link from 'next/link'
import { TrtLogo } from '@/app/_components/trt-logo'
import AuthShowcase from '@/app/_components/auth-showcase'

/**
 * Public auth layout — split screen: form on the left, animated branded
 * dashboard preview on the right (hidden on mobile so it stays usable on phones).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-5 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Form column */}
        <div className="flex flex-col rounded-3xl bg-white px-6 py-8 shadow-sm sm:px-10">
          <Link href="/" className="inline-flex w-fit">
            <TrtLogo />
          </Link>
          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="mx-auto w-full max-w-md">{children}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
            <span>© {new Date().getFullYear()} TRT Arredo</span>
            <span>Industrial precision in architectural logistics</span>
          </div>
        </div>

        {/* Showcase column */}
        <AuthShowcase />
      </div>
    </div>
  )
}
