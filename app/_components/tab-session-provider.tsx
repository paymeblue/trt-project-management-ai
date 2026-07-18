'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_BUFFER_MS = 2 * 60 * 1000

// Fired by any caller (e.g. new-session-form.tsx) immediately after writing a
// freshly-minted per-tab token to sessionStorage, so the override below can
// activate synchronously BEFORE that caller's own router.push() fires its
// RSC fetch. TabSessionProvider is mounted once in the root layout and does
// not remount on client-side navigation, so its own mount-time check alone
// would miss a token that first appears mid-session (the D-03 "sign in as a
// different user" flow) — that gap was caught live during the Task 4
// checkpoint (a freshly-minted per-tab session's first navigation rendered
// the ORIGINAL shared-cookie user's dashboard, not the new user's, because
// the fetch override hadn't been installed yet).
export const TAB_SESSION_ACTIVATE_EVENT = 'trt-pm:tab-session-activate'

// Installs a window.fetch override, but ONLY for tabs holding a per-tab
// token in sessionStorage (Phase 20.1). Tabs using the default shared-cookie
// session never touch window.fetch at all — this is a strict no-op for them.
//
// Two responsibilities once active:
//  1. Inject `Authorization: Bearer <tabAccessToken>` onto every outgoing
//     fetch, including Next's own soft-navigation RSC fetches (confirmed via
//     Task 1.5's smoke test to survive router.push in this Next 16.2.9 +
//     React 19.2.4 setup — RESEARCH.md Pattern 4 / Assumption A1).
//  2. Schedule a silent refresh at (expiresAt - 2min) via
//     POST /api/auth/tab-refresh so a long-open tab doesn't get stranded by
//     the 20-minute access-token lifetime. On refresh failure, clear the
//     per-tab session and let the tab gracefully fall through to the shared
//     cookie on its next request (D-20.1-03-B).
export default function TabSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    let originalFetch: typeof window.fetch | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const clearTabSession = () => {
      sessionStorage.removeItem('tabAccessToken')
      sessionStorage.removeItem('tabRefreshToken')
      sessionStorage.removeItem('tabTokenExpiresAt')
    }

    const scheduleRefresh = () => {
      const expiresAt = Number(sessionStorage.getItem('tabTokenExpiresAt'))
      const refreshToken = sessionStorage.getItem('tabRefreshToken')
      if (!expiresAt || !refreshToken || !originalFetch) return
      const baseFetch = originalFetch

      const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BUFFER_MS)
      timeoutId = setTimeout(async () => {
        try {
          const res = await baseFetch('/api/auth/tab-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
          if (!res.ok) {
            clearTabSession()
            return
          }
          const json = (await res.json()) as {
            accessToken: string
            expiresAt: number
          }
          sessionStorage.setItem('tabAccessToken', json.accessToken)
          sessionStorage.setItem('tabTokenExpiresAt', String(json.expiresAt))
          scheduleRefresh()
        } catch {
          clearTabSession()
        }
      }, delay)
    }

    // Idempotent: a tab that already activated (e.g. via the mount-time
    // check) ignores a later activate event, and vice versa.
    //
    // `forceRerender`: a HARD refresh (F5, typed URL, new tab to an existing
    // per-tab session) is the browser's own native top-level navigation —
    // it happens BEFORE any JS runs, so it can never carry the Authorization
    // header. That first server render resolves via the shared cookie, not
    // this tab's per-tab user (the bug: "user refreshes, sees the wrong
    // user"). Once this effect finally runs and the override is installed,
    // router.refresh() re-fetches the current route's RSC payload through
    // the now-overridden window.fetch — WITH the header — re-rendering every
    // Server Component (including the root/app layout) as the correct
    // per-tab user. A brief flash of the shared-cookie identity is the
    // tradeoff; silently staying wrong is not acceptable. The event-driven
    // path (new-session-form.tsx) already does its own router.push after
    // dispatching the activate event, so it does not need this.
    const activate = (opts?: { forceRerender?: boolean }) => {
      const token = sessionStorage.getItem('tabAccessToken')
      if (!token || originalFetch) return

      originalFetch = window.fetch
      window.fetch = (input, init = {}) => {
        const headers = new Headers(init.headers)
        const current = sessionStorage.getItem('tabAccessToken')
        if (current) headers.set('Authorization', `Bearer ${current}`)
        return originalFetch!(input, { ...init, headers })
      }

      scheduleRefresh()
      if (opts?.forceRerender) {
        // TEST (2026-07-18 continued): isolating whether returning to the
        // SAME URL that already committed a forbidden()/error boundary on
        // the initial (wrong-identity) render is what prevents the
        // corrected content from painting, even though the server resolves
        // the corrected identity successfully (confirmed via logs). Land on
        // a safe, always-accessible route instead of round-tripping back to
        // the exact prior URL.
        router.push('/dashboard')
      }
    }

    const onActivateEvent = () => activate()

    activate({ forceRerender: true }) // mount-time: default shared-cookie tab has empty sessionStorage (no-op); a per-tab tab re-renders itself correctly after a hard refresh
    window.addEventListener(TAB_SESSION_ACTIVATE_EVENT, onActivateEvent)

    return () => {
      window.removeEventListener(TAB_SESSION_ACTIVATE_EVENT, onActivateEvent)
      if (originalFetch) window.fetch = originalFetch
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [router])

  return children
}
