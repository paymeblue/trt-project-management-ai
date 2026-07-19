// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import TabSessionProvider, {
  TAB_SESSION_ACTIVATE_EVENT,
  TAB_SESSION_RESTORE_PATH,
} from '@/app/_components/tab-session-provider'

// createRoot outside a test renderer needs this flag or act() warns.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Mirrors the provider's private constant — the silent refresh fires at
// (expiresAt - REFRESH_BUFFER_MS).
const REFRESH_BUFFER_MS = 2 * 60 * 1000

type LocationMock = {
  pathname: string
  search: string
  replace: ReturnType<typeof vi.fn>
}

let locationMock: LocationMock
let fetchMock: ReturnType<typeof vi.fn>
let container: HTMLDivElement | undefined
let root: Root | undefined

// jsdom's window.location can't navigate — swap in an assertable stub.
function mockLocation(pathname: string, search = '') {
  locationMock = { pathname, search, replace: vi.fn() }
  Reflect.deleteProperty(window, 'location')
  ;(window as unknown as { location: LocationMock }).location = locationMock
}

function seedTokens(opts: { access?: string; refresh?: string; expiresInMs?: number } = {}) {
  sessionStorage.setItem('tabAccessToken', opts.access ?? 'access-A')
  sessionStorage.setItem('tabRefreshToken', opts.refresh ?? 'refresh-A')
  sessionStorage.setItem(
    'tabTokenExpiresAt',
    String(Date.now() + (opts.expiresInMs ?? REFRESH_BUFFER_MS + 10_000)),
  )
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      <TabSessionProvider>
        <div />
      </TabSessionProvider>,
    )
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

function authHeaderOfCall(n: number): string | null {
  const init = fetchMock.mock.calls[n]?.[1] as RequestInit | undefined
  return new Headers(init?.headers).get('Authorization')
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  fetchMock = vi.fn()
  window.fetch = fetchMock as unknown as typeof window.fetch
  mockLocation('/factory-pm/dashboard')
})

afterEach(async () => {
  await unmount()
  vi.useRealTimers()
})

describe('TabSessionProvider', () => {
  it('no token: strict no-op — fetch untouched, no redirect', async () => {
    await mount()
    expect(window.fetch).toBe(fetchMock)
    expect(locationMock.replace).not.toHaveBeenCalled()
  })

  it('token at mount on a normal path: installs the override and natively bounces to the restore route with to=<path+search>', async () => {
    seedTokens()
    mockLocation('/admin/dashboard', '?tab=2')
    await mount()
    expect(window.fetch).not.toBe(fetchMock)
    expect(locationMock.replace).toHaveBeenCalledWith(
      `${TAB_SESSION_RESTORE_PATH}?to=${encodeURIComponent('/admin/dashboard?tab=2')}`,
    )
  })

  it('token at mount already on the restore route: installs the override WITHOUT bouncing (no redirect loop)', async () => {
    seedTokens()
    mockLocation(TAB_SESSION_RESTORE_PATH, '?to=%2Fadmin%2Fdashboard')
    await mount()
    expect(window.fetch).not.toBe(fetchMock)
    expect(locationMock.replace).not.toHaveBeenCalled()
  })

  it('override injects Authorization from the CURRENT token at call time, not the mount-time token', async () => {
    seedTokens({ access: 'access-A' })
    mockLocation(TAB_SESSION_RESTORE_PATH)
    await mount()
    fetchMock.mockResolvedValue({ ok: true })

    await window.fetch('/x')
    expect(authHeaderOfCall(0)).toBe('Bearer access-A')

    // Same tab switches users (new sign-in overwrote sessionStorage).
    sessionStorage.setItem('tabAccessToken', 'access-B')
    await window.fetch('/y')
    expect(authHeaderOfCall(1)).toBe('Bearer access-B')
  })

  it('silent refresh reads the refresh token at FIRE time — a user switch while the timer is pending must never restore the previous session', async () => {
    seedTokens({ refresh: 'refresh-A', expiresInMs: REFRESH_BUFFER_MS + 10_000 })
    mockLocation(TAB_SESSION_RESTORE_PATH)
    await mount()

    // Switch users WITHOUT the activate event (worst case: timer still armed
    // from the previous session).
    sessionStorage.setItem('tabRefreshToken', 'refresh-B')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'fresh-access', expiresAt: Date.now() + 20 * 60 * 1000 }),
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/tab-refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-B' }),
      }),
    )
    // The refreshed access token was stored for the CURRENT session.
    expect(sessionStorage.getItem('tabAccessToken')).toBe('fresh-access')
  })

  it('activate event on an already-active tab re-arms the timer against the NEW session expiry (old timer cleared)', async () => {
    seedTokens({ expiresInMs: REFRESH_BUFFER_MS + 10_000 }) // old timer would fire at +10s
    mockLocation(TAB_SESSION_RESTORE_PATH)
    await mount()

    // User switch via the sign-in flows: new tokens with a LATER expiry, then
    // the activate event (what new-session-form / sign-in-form dispatch).
    seedTokens({ access: 'access-B', refresh: 'refresh-B', expiresInMs: REFRESH_BUFFER_MS + 60_000 })
    await act(async () => {
      window.dispatchEvent(new Event(TAB_SESSION_ACTIVATE_EVENT))
    })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'fresh-B', expiresAt: Date.now() + 20 * 60 * 1000 }),
    })

    // The previous session's fire time passes silently — its timer is gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    // The new session's fire time arrives — exactly one refresh, as the new user.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/tab-refresh',
      expect.objectContaining({ body: JSON.stringify({ refreshToken: 'refresh-B' }) }),
    )
  })

  it('failed refresh clears the per-tab session (graceful fall-through to the shared cookie, D-20.1-03-B)', async () => {
    seedTokens({ expiresInMs: REFRESH_BUFFER_MS + 10_000 })
    mockLocation(TAB_SESSION_RESTORE_PATH)
    await mount()
    fetchMock.mockResolvedValue({ ok: false })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(sessionStorage.getItem('tabAccessToken')).toBeNull()
    expect(sessionStorage.getItem('tabRefreshToken')).toBeNull()
    expect(sessionStorage.getItem('tabTokenExpiresAt')).toBeNull()
  })

  it('unmount restores the original window.fetch', async () => {
    seedTokens()
    mockLocation(TAB_SESSION_RESTORE_PATH)
    await mount()
    expect(window.fetch).not.toBe(fetchMock)
    await unmount()
    expect(window.fetch).toBe(fetchMock)
  })
})
