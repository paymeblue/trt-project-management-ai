'use client'

import { useEffect } from 'react'

const REFRESH_BUFFER_MS = 2 * 60 * 1000

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
  useEffect(() => {
    const token = sessionStorage.getItem('tabAccessToken')
    if (!token) return // default shared-cookie tab: do not touch fetch at all

    const originalFetch = window.fetch
    window.fetch = (input, init = {}) => {
      const headers = new Headers(init.headers)
      const current = sessionStorage.getItem('tabAccessToken')
      if (current) headers.set('Authorization', `Bearer ${current}`)
      return originalFetch(input, { ...init, headers })
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const clearTabSession = () => {
      sessionStorage.removeItem('tabAccessToken')
      sessionStorage.removeItem('tabRefreshToken')
      sessionStorage.removeItem('tabTokenExpiresAt')
    }

    const scheduleRefresh = () => {
      const expiresAt = Number(sessionStorage.getItem('tabTokenExpiresAt'))
      const refreshToken = sessionStorage.getItem('tabRefreshToken')
      if (!expiresAt || !refreshToken) return

      const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BUFFER_MS)
      timeoutId = setTimeout(async () => {
        try {
          const res = await originalFetch('/api/auth/tab-refresh', {
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

    scheduleRefresh()

    return () => {
      window.fetch = originalFetch
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  return children
}
