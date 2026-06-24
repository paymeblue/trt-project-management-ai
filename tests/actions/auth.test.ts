import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

// Prevent `import 'server-only'` from throwing in the test environment
vi.mock('server-only', () => ({}))

// Mock next/navigation so redirect() throws (like Next does) and we can assert it.
// Mock next/headers cookies() used by signoutAction to clear session cookies.
const { redirectMock, cookieStore } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
  cookieStore: { get: vi.fn(() => undefined), delete: vi.fn() },
}))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }))

// Capture bcrypt.hash calls without doing real hashing
const bcryptHashMock = vi.fn()
vi.mock('bcryptjs', () => ({
  default: {
    hash: bcryptHashMock,
    compare: vi.fn(),
  },
}))

// Capture db.insert(...).values(...).returning(...) chain
const dbReturningMock = vi.fn()
const dbValuesMock = vi.fn()
const dbInsertMock = vi.fn()

vi.mock('@/db', () => ({
  db: {
    insert: dbInsertMock,
  },
}))

// Mock NextAuth signIn / signOut
const signInMock = vi.fn()
const signOutMock = vi.fn()

vi.mock('@/auth', () => ({
  signIn: signInMock,
  signOut: signOutMock,
}))

// Mock next-auth top-level so importing the action doesn't pull in next/server.
// Provides a minimal AuthError compatible with `instanceof` checks in signinAction.
vi.mock('next-auth', () => ({
  AuthError: class AuthError extends Error {
    type: string
    constructor(type = 'CredentialsSignin') {
      super(type)
      this.type = type
      this.name = 'AuthError'
    }
  },
}))

// Mock sendVerificationEmail
const sendVerificationEmailMock = vi.fn()

vi.mock('@/lib/auth/email-flows', () => ({
  sendVerificationEmail: sendVerificationEmailMock,
}))

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()

  // Default hash mock returns a plausible bcrypt hash
  bcryptHashMock.mockResolvedValue('$2b$10$hashedpassword')

  // Default insert chain: db.insert(users).values({}).returning({ id }) => [{ id: 'new-user-id' }]
  dbReturningMock.mockResolvedValue([{ id: 'new-user-id' }])
  dbValuesMock.mockReturnValue({ returning: dbReturningMock })
  dbInsertMock.mockReturnValue({ values: dbValuesMock })

  // Default email mock resolves successfully
  sendVerificationEmailMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })

  // Default signIn mock: resolves (redirect happens inside the action after signIn)
  signInMock.mockResolvedValue(undefined)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignupFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.append('name', overrides.name ?? 'Test User')
  fd.append('email', overrides.email ?? 'test@example.com')
  fd.append('password', overrides.password ?? 'securepass1')
  fd.append('role', overrides.role ?? 'factory_pm')
  return fd
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('auth actions (NextAuth Credentials)', () => {

  // ── AUTH-01 ───────────────────────────────────────────────────────────────

  describe('AUTH-01: signUpAction — public sign-up is disabled', () => {
    it('returns the disabled message and performs NO side-effects (no hash/insert/email/signIn)', async () => {
      const { signUpAction } = await import('@/actions/auth')
      const fd = makeSignupFormData({ role: 'factory_pm' })

      const result = await signUpAction({}, fd)

      expect(result).toHaveProperty('message')
      expect(result.message).toMatch(/disabled/i)

      // No account is created by self sign-up anymore.
      expect(bcryptHashMock).not.toHaveBeenCalled()
      expect(dbInsertMock).not.toHaveBeenCalled()
      expect(sendVerificationEmailMock).not.toHaveBeenCalled()
      expect(signInMock).not.toHaveBeenCalled()
    })

    it('stays disabled regardless of the requested role', async () => {
      const { signUpAction } = await import('@/actions/auth')

      for (const role of ['site_pm', 'super_admin', 'operations']) {
        const result = await signUpAction({}, makeSignupFormData({ role }))
        expect(result).toHaveProperty('message')
      }

      expect(dbInsertMock).not.toHaveBeenCalled()
      expect(signInMock).not.toHaveBeenCalled()
    })
  })

  // ── AUTH-04 ───────────────────────────────────────────────────────────────

  describe('AUTH-04: signinAction and signoutAction wrap NextAuth', () => {
    it('signinAction calls signIn(credentials) with the provided email and password', async () => {
      // signIn with redirectTo causes Next to redirect — mock it to throw REDIRECT
      signInMock.mockRejectedValue(new Error('REDIRECT'))

      const { signinAction } = await import('@/actions/auth')

      const fd = new FormData()
      fd.append('email', 'login@example.com')
      fd.append('password', 'mypass1234')

      await signinAction({}, fd).catch(() => {})

      expect(signInMock).toHaveBeenCalledOnce()
      expect(signInMock).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({
          email: 'login@example.com',
          password: 'mypass1234',
          redirectTo: '/dashboard',
        }),
      )
    })

    it('signinAction returns { message } on AuthError (wrong credentials)', async () => {
      // Simulate NextAuth CredentialsSignin error
      const { AuthError } = await import('next-auth')
      signInMock.mockRejectedValue(new AuthError('CredentialsSignin'))

      const { signinAction } = await import('@/actions/auth')

      const fd = new FormData()
      fd.append('email', 'bad@example.com')
      fd.append('password', 'wrongpassword')

      const result = await signinAction({}, fd)

      expect(result).toHaveProperty('message', 'Invalid email or password.')
    })

    it('signoutAction signs out (redirect:false), clears cookies, then redirects to /sign-in', async () => {
      signOutMock.mockResolvedValue(undefined)

      const { signoutAction } = await import('@/actions/auth')
      // signoutAction ends with redirect('/sign-in'), which throws in the mock.
      await signoutAction().catch(() => {})

      expect(signOutMock).toHaveBeenCalledOnce()
      expect(signOutMock).toHaveBeenCalledWith(expect.objectContaining({ redirect: false }))
      expect(redirectMock).toHaveBeenCalledWith('/sign-in')
    })
  })
})
