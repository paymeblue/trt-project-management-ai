// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import TabSessionRestorePage from '@/app/tab-session/restore/page'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const routerReplaceMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), refresh: vi.fn() }),
}))

type LocationMock = {
  pathname: string
  search: string
  replace: ReturnType<typeof vi.fn>
}

let locationMock: LocationMock
let fetchMock: ReturnType<typeof vi.fn>
let container: HTMLDivElement | undefined
let root: Root | undefined

function mockLocation(search: string) {
  locationMock = { pathname: '/tab-session/restore', search, replace: vi.fn() }
  Reflect.deleteProperty(window, 'location')
  ;(window as unknown as { location: LocationMock }).location = locationMock
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<TabSessionRestorePage />)
  })
  // The page defers its work one task (setTimeout(0)) past the hydration
  // commit — flush it, including the async refresh path.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function unmount() {
  if (root) {
    const r = root
    await act(async () => {
      r.unmount()
    })
  }
  root = undefined
  container?.remove()
  container = undefined
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  routerReplaceMock.mockReset()
  fetchMock = vi.fn()
  window.fetch = fetchMock as unknown as typeof window.fetch
  mockLocation('?to=%2Fadmin%2Fdashboard')
})

afterEach(async () => {
  await unmount()
  vi.useRealTimers()
})

describe('TabSessionRestorePage', () => {
  it('no token: plain native navigation to `to` (cookie identity)', async () => {
    await mount()
    expect(locationMock.replace).toHaveBeenCalledWith('/admin/dashboard')
    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fresh token: soft-replaces to `to` without touching the refresh endpoint', async () => {
    sessionStorage.setItem('tabAccessToken', 'access-A')
    sessionStorage.setItem('tabRefreshToken', 'refresh-A')
    sessionStorage.setItem('tabTokenExpiresAt', String(Date.now() + 10 * 60 * 1000))
    await mount()
    expect(routerReplaceMock).toHaveBeenCalledWith('/admin/dashboard')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(locationMock.replace).not.toHaveBeenCalled()
  })

  it('stale/expired token with a live refresh token: refreshes FIRST, stores the new token, then soft-replaces (idle-tab identity recovery)', async () => {
    sessionStorage.setItem('tabAccessToken', 'access-old')
    sessionStorage.setItem('tabRefreshToken', 'refresh-A')
    sessionStorage.setItem('tabTokenExpiresAt', String(Date.now() - 1000)) // already expired
    const newExpiry = Date.now() + 20 * 60 * 1000
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'access-fresh', expiresAt: newExpiry }),
    })

    await mount()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/tab-refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-A' }),
      }),
    )
    expect(sessionStorage.getItem('tabAccessToken')).toBe('access-fresh')
    expect(sessionStorage.getItem('tabTokenExpiresAt')).toBe(String(newExpiry))
    expect(routerReplaceMock).toHaveBeenCalledWith('/admin/dashboard')
    expect(locationMock.replace).not.toHaveBeenCalled()
  })

  it('dead refresh token (>8h idle): clears the per-tab session and falls through natively to the cookie identity', async () => {
    sessionStorage.setItem('tabAccessToken', 'access-old')
    sessionStorage.setItem('tabRefreshToken', 'refresh-dead')
    sessionStorage.setItem('tabTokenExpiresAt', String(Date.now() - 1000))
    fetchMock.mockResolvedValue({ ok: false })

    await mount()

    expect(sessionStorage.getItem('tabAccessToken')).toBeNull()
    expect(sessionStorage.getItem('tabRefreshToken')).toBeNull()
    expect(sessionStorage.getItem('tabTokenExpiresAt')).toBeNull()
    expect(locationMock.replace).toHaveBeenCalledWith('/admin/dashboard')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('rejects external/protocol-relative and self-referencing `to` targets (open-redirect + loop guard)', async () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/tab-session/restore']) {
      routerReplaceMock.mockReset()
      sessionStorage.clear()
      sessionStorage.setItem('tabAccessToken', 'access-A')
      sessionStorage.setItem('tabRefreshToken', 'refresh-A')
      sessionStorage.setItem('tabTokenExpiresAt', String(Date.now() + 10 * 60 * 1000))
      mockLocation(`?to=${encodeURIComponent(bad)}`)
      await mount()
      expect(routerReplaceMock).toHaveBeenCalledWith('/dashboard')
      await unmount()
    }
  })
})
