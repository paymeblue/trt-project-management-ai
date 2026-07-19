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
// Refresh the access token slightly before it actually expires — navigating
// with a dead bearer fails closed to /sign-in, which forwards cookie-holders
// to the COOKIE user's dashboard: the exact wrong-identity outcome this
// route exists to prevent.
const EXPIRY_MARGIN_MS = 60 * 1000

function clearTabSession() {
  sessionStorage.removeItem('tabAccessToken')
  sessionStorage.removeItem('tabRefreshToken')
  sessionStorage.removeItem('tabTokenExpiresAt')
}

export default function TabSessionRestorePage() {
  const router = useRouter()

  useEffect(() => {
    // setTimeout(0): in the initial hydration commit, this page's effect
    // (child) runs BEFORE TabSessionProvider's effect (root-layout parent),
    // which is what installs the window.fetch Authorization override.
    // Deferring one task guarantees the navigation below goes through the
    // installed override.
    const id = setTimeout(async () => {
      const to = safeTo()
      if (!sessionStorage.getItem('tabAccessToken')) {
        // No per-tab token (cookie-only visitor) — plain native navigation.
        window.location.replace(to)
        return
      }

      // A tab left idle past the 20-minute access TTL (background timers are
      // heavily throttled, so the silent refresh may never have fired) still
      // holds an 8-hour refresh token — recover its own identity FIRST.
      const expiresAt = Number(sessionStorage.getItem('tabTokenExpiresAt'))
      const refreshToken = sessionStorage.getItem('tabRefreshToken')
      if (refreshToken && (!expiresAt || Date.now() > expiresAt - EXPIRY_MARGIN_MS)) {
        try {
          const res = await fetch('/api/auth/tab-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
          if (res.ok) {
            const json = (await res.json()) as { accessToken: string; expiresAt: number }
            sessionStorage.setItem('tabAccessToken', json.accessToken)
            sessionStorage.setItem('tabTokenExpiresAt', String(json.expiresAt))
          } else {
            // Refresh token dead too (>8h idle or revoked): this per-tab
            // session is genuinely over. Clear it and fall through honestly
            // to the shared cookie's identity.
            clearTabSession()
            window.location.replace(to)
            return
          }
        } catch {
          // Transient network failure — proceed with the current token; the
          // worst case is the fail-closed redirect to /sign-in.
        }
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
