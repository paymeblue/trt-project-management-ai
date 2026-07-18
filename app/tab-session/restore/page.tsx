'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TAB_SESSION_RESTORE_PATH } from '@/app/_components/tab-session-provider'

// Only ever land on an internal path — reject absolute/protocol-relative URLs
// (open redirect) and this route itself (loop). Read from window.location
// inside the effect rather than useSearchParams() so the page needs no
// Suspense boundary and stays fully static.
function safeTo(): string {
  const raw = new URLSearchParams(window.location.search).get('to')
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith(TAB_SESSION_RESTORE_PATH)
  ) {
    return '/dashboard'
  }
  return raw
}

// Per-tab session restore bounce (Phase 20.1). A hard refresh of a per-tab
// tab paints the shared cookie's user first (native navigation carries no
// Authorization header), so TabSessionProvider natively redirects here — an
// identity-agnostic route OUTSIDE the (app) layout group. This document
// starts with an empty client Router Cache, so the soft navigation below
// re-mounts the entire (app) tree (layout chrome included) from an RSC fetch
// that DOES carry the per-tab Bearer header.
export default function TabSessionRestorePage() {
  const router = useRouter()

  useEffect(() => {
    // setTimeout(0): in the initial hydration commit, this page's effect
    // (child) runs BEFORE TabSessionProvider's effect (root-layout parent),
    // which is what installs the window.fetch Authorization override.
    // Deferring one task guarantees the navigation below goes through the
    // installed override.
    const id = setTimeout(() => {
      const to = safeTo()
      if (!sessionStorage.getItem('tabAccessToken')) {
        // No per-tab token (cookie-only visitor) — plain native navigation.
        window.location.replace(to)
        return
      }
      // replace(), not push(): this bounce page must not remain in history —
      // Back should land on whatever preceded the refreshed entry.
      router.replace(to)
    }, 0)
    return () => clearTimeout(id)
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3 text-on-surface-variant">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
        <p className="text-sm">Restoring your session…</p>
      </div>
    </main>
  )
}
