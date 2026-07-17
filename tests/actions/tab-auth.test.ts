import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

// Prevent `import 'server-only'` from throwing in the test environment
vi.mock('server-only', () => ({}))

// Mock next/navigation so redirect() throws (like Next does) and we can assert
// it is never called by this action (D-20.1-02-B).
const redirectMock = vi.fn(() => {
  throw new Error('REDIRECT')
})
vi.mock('next/navigation', () => ({ redirect: redirectMock }))

// Mock next-auth's signIn so we can assert it is never called (D-20.1-02-C).
const signInMock = vi.fn()
vi.mock('@/auth', () => ({
  signIn: signInMock,
  signOut: vi.fn(),
}))

// Mock the shared credential-verification helper from Wave 0.
const verifyCredentialsMock = vi.fn()
vi.mock('@/lib/auth/verify-credentials', () => ({
  verifyCredentials: verifyCredentialsMock,
}))

// Mock the per-tab token-minting primitives from Wave 0.
const mintTabAccessTokenMock = vi.fn()
const mintTabRefreshTokenMock = vi.fn()
vi.mock('@/lib/tab-session', () => ({
  mintTabAccessToken: mintTabAccessTokenMock,
  mintTabRefreshToken: mintTabRefreshTokenMock,
  ACCESS_TTL_S: 20 * 60,
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()

  mintTabAccessTokenMock.mockResolvedValue('mock-access-token')
  mintTabRefreshTokenMock.mockResolvedValue('mock-refresh-token')
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSigninFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.append('email', overrides.email ?? 'user@example.com')
  fd.append('password', overrides.password ?? 'securepass1')
  return fd
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tabSigninAction (per-tab sign-in Server Action)', () => {
  it('valid credentials: returns { accessToken, refreshToken, expiresAt } and calls verifyCredentials/mint with the right args', async () => {
    verifyCredentialsMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      role: 'factory_pm',
    })

    const { tabSigninAction } = await import('@/actions/tab-auth')
    const before = Date.now()
    const result = await tabSigninAction({}, makeSigninFormData())
    const after = Date.now()

    expect(verifyCredentialsMock).toHaveBeenCalledWith(
      'user@example.com',
      'securepass1',
    )
    expect(mintTabAccessTokenMock).toHaveBeenCalledWith('user-1', 'factory_pm')
    expect(mintTabRefreshTokenMock).toHaveBeenCalledWith('user-1')

    expect(result.accessToken).toBe('mock-access-token')
    expect(result.refreshToken).toBe('mock-refresh-token')
    expect(typeof result.expiresAt).toBe('number')
    expect(result.expiresAt as number).toBeGreaterThanOrEqual(before + 20 * 60 * 1000)
    expect(result.expiresAt as number).toBeLessThanOrEqual(after + 20 * 60 * 1000)

    expect(redirectMock).not.toHaveBeenCalled()
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('invalid credentials: returns { message: "Invalid email or password." }, mint functions NOT called', async () => {
    verifyCredentialsMock.mockResolvedValue(null)

    const { tabSigninAction } = await import('@/actions/tab-auth')
    const result = await tabSigninAction({}, makeSigninFormData())

    expect(result).toEqual({ message: 'Invalid email or password.' })
    expect(mintTabAccessTokenMock).not.toHaveBeenCalled()
    expect(mintTabRefreshTokenMock).not.toHaveBeenCalled()

    expect(redirectMock).not.toHaveBeenCalled()
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('invalid form input (empty email): returns a validation { message }, verifyCredentials NOT called', async () => {
    const { tabSigninAction } = await import('@/actions/tab-auth')
    const result = await tabSigninAction({}, makeSigninFormData({ email: '' }))

    expect(result).toHaveProperty('message')
    expect(verifyCredentialsMock).not.toHaveBeenCalled()
    expect(mintTabAccessTokenMock).not.toHaveBeenCalled()
    expect(mintTabRefreshTokenMock).not.toHaveBeenCalled()

    expect(redirectMock).not.toHaveBeenCalled()
    expect(signInMock).not.toHaveBeenCalled()
  })
})
