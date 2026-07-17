import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

const verifyTabTokenMock = vi.fn()
const mintTabAccessTokenMock = vi.fn()
vi.mock('@/lib/tab-session', () => ({
  verifyTabToken: verifyTabTokenMock,
  mintTabAccessToken: mintTabAccessTokenMock,
  ACCESS_TTL_S: 20 * 60,
}))

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }))
vi.mock('@/db', () => ({ db: { select: selectMock } }))

function userQuery(row: { role: string } | undefined) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mintTabAccessTokenMock.mockResolvedValue('new-access-token')
})

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/tab-refresh', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/auth/tab-refresh', () => {
  it('valid refresh token: returns 200 with a new accessToken/expiresAt, role sourced from the DB (not the token payload)', async () => {
    // Real refresh tokens never carry a `role` claim (mintTabRefreshToken) —
    // this is the exact shape verifyTabToken returns for a genuine refresh
    // token, proving the fix doesn't accidentally depend on payload.role.
    verifyTabTokenMock.mockResolvedValue({ sub: 'user-1', typ: 'refresh' })
    selectMock.mockReturnValue(userQuery({ role: 'factory_pm' }))

    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const before = Date.now()
    const res = await POST(makeRequest({ refreshToken: 'valid-refresh' }))
    const after = Date.now()

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.accessToken).toBe('new-access-token')
    expect(typeof json.expiresAt).toBe('number')
    expect(json.expiresAt).toBeGreaterThanOrEqual(before + 20 * 60 * 1000)
    expect(json.expiresAt).toBeLessThanOrEqual(after + 20 * 60 * 1000)
    expect(mintTabAccessTokenMock).toHaveBeenCalledWith('user-1', 'factory_pm')
  })

  it('reflects a role change since the refresh token was minted (DB is the source of truth on refresh)', async () => {
    verifyTabTokenMock.mockResolvedValue({ sub: 'user-1', typ: 'refresh' })
    selectMock.mockReturnValue(userQuery({ role: 'operations' }))

    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    await POST(makeRequest({ refreshToken: 'valid-refresh' }))

    expect(mintTabAccessTokenMock).toHaveBeenCalledWith('user-1', 'operations')
  })

  it('user no longer exists (deleted since refresh token was minted): returns 401', async () => {
    verifyTabTokenMock.mockResolvedValue({ sub: 'deleted-user', typ: 'refresh' })
    selectMock.mockReturnValue(userQuery(undefined))

    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const res = await POST(makeRequest({ refreshToken: 'valid-refresh' }))

    expect(res.status).toBe(401)
    expect(mintTabAccessTokenMock).not.toHaveBeenCalled()
  })

  it('expired/invalid token: returns 401', async () => {
    verifyTabTokenMock.mockResolvedValue(null)

    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const res = await POST(makeRequest({ refreshToken: 'garbage' }))

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Invalid refresh token')
    expect(mintTabAccessTokenMock).not.toHaveBeenCalled()
  })

  it('a typ="access" token presented as a refresh token: returns 401 (cross-typ rejection)', async () => {
    verifyTabTokenMock.mockResolvedValue({ sub: 'user-1', role: 'factory_pm', typ: 'access' })

    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const res = await POST(makeRequest({ refreshToken: 'an-access-token' }))

    expect(res.status).toBe(401)
    expect(mintTabAccessTokenMock).not.toHaveBeenCalled()
  })

  it('malformed body (not JSON): returns 400', async () => {
    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const res = await POST(makeRequest('not json'))

    expect(res.status).toBe(400)
    expect(verifyTabTokenMock).not.toHaveBeenCalled()
  })

  it('malformed body (missing refreshToken field): returns 400', async () => {
    const { POST } = await import('@/app/api/auth/tab-refresh/route')
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(verifyTabTokenMock).not.toHaveBeenCalled()
  })
})
