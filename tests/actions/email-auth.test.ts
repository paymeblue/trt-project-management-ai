import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────

// Prevent the `import 'server-only'` guard from throwing in the test environment
vi.mock('server-only', () => ({}))

// Mock the email-flows layer so we control token resolution without a real DB
const requestPasswordResetMock = vi.fn()
const consumeResetTokenMock = vi.fn()
const consumeVerificationTokenMock = vi.fn()

vi.mock('@/lib/auth/email-flows', () => ({
  requestPasswordReset: requestPasswordResetMock,
  consumeResetToken: consumeResetTokenMock,
  consumeVerificationToken: consumeVerificationTokenMock,
  sendVerificationEmail: vi.fn(),
}))

// Mock bcryptjs — avoid real bcrypt work in unit tests
const bcryptHashMock = vi.fn()

vi.mock('bcryptjs', () => ({
  default: {
    hash: bcryptHashMock,
    compare: vi.fn(),
  },
}))

// Mock the Drizzle db client and capture update calls
const dbUpdateMock = vi.fn()
const dbSetMock = vi.fn()
const dbWhereMock = vi.fn()

vi.mock('@/db', () => ({
  db: {
    update: dbUpdateMock,
  },
}))

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()

  // Default chained builder: db.update(users).set({}).where(...)
  dbWhereMock.mockResolvedValue(undefined)
  dbSetMock.mockReturnValue({ where: dbWhereMock })
  dbUpdateMock.mockReturnValue({ set: dbSetMock })
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('email-auth Server Actions', () => {

  // ── AUTH-03: requestPasswordResetAction ─────────────────────────────────

  describe('requestPasswordResetAction — AUTH-03 request', () => {
    it('calls requestPasswordReset with the provided email and returns the generic message', async () => {
      requestPasswordResetMock.mockResolvedValue({ data: { id: 'msg-1' }, error: null })

      const { requestPasswordResetAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('email', 'user@example.com')
      const result = await requestPasswordResetAction({ message: '' }, fd)

      expect(requestPasswordResetMock).toHaveBeenCalledOnce()
      expect(requestPasswordResetMock).toHaveBeenCalledWith('user@example.com')
      expect(result.message).toBe('If that email exists, a reset link has been sent.')
    })

    it('EMAIL-01: the request path reaches the email send (via requestPasswordReset mock)', async () => {
      // The send is inside requestPasswordReset — confirming it is called proves the
      // email path is invoked (EMAIL-01).
      requestPasswordResetMock.mockResolvedValue({ data: { id: 'msg-2' }, error: null })

      const { requestPasswordResetAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('email', 'another@example.com')
      await requestPasswordResetAction({ message: '' }, fd)

      expect(requestPasswordResetMock).toHaveBeenCalledOnce()
    })

    it('returns the same generic message when the email is unknown (no enumeration)', async () => {
      // requestPasswordReset returns the no-op shape when the user does not exist
      requestPasswordResetMock.mockResolvedValue({ data: null, error: null })

      const { requestPasswordResetAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('email', 'unknown@example.com')
      const result = await requestPasswordResetAction({ message: '' }, fd)

      // Response must be identical to the "user found" case — no enumeration
      expect(result.message).toBe('If that email exists, a reset link has been sent.')
    })

    it('returns the same generic message even when email is invalid (no enumeration)', async () => {
      const { requestPasswordResetAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('email', 'not-an-email')
      const result = await requestPasswordResetAction({ message: '' }, fd)

      // Parse failure: requestPasswordReset should NOT be called; message still generic
      expect(requestPasswordResetMock).not.toHaveBeenCalled()
      expect(result.message).toBe('If that email exists, a reset link has been sent.')
    })
  })

  // ── AUTH-03: resetPasswordAction — happy path ───────────────────────────

  describe('resetPasswordAction — AUTH-03 complete (happy path)', () => {
    it('calls bcrypt.hash and db.update(users) with the new hashedPassword', async () => {
      consumeResetTokenMock.mockResolvedValue('user-uuid-123')
      bcryptHashMock.mockResolvedValue('$2b$10$hashed_pw')

      const { resetPasswordAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('token', 'valid-raw-token')
      fd.append('password', 'newSecurePass1')
      const result = await resetPasswordAction({}, fd)

      // Must hash the new password
      expect(bcryptHashMock).toHaveBeenCalledOnce()
      expect(bcryptHashMock).toHaveBeenCalledWith('newSecurePass1', 10)

      // Must call db.update(users).set({ hashedPassword: ... })
      expect(dbUpdateMock).toHaveBeenCalledOnce()
      expect(dbSetMock).toHaveBeenCalledOnce()
      expect(dbSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ hashedPassword: '$2b$10$hashed_pw' }),
      )
      expect(dbWhereMock).toHaveBeenCalledOnce()

      expect(result.message).toBe('Password updated. You can now sign in.')
      expect(result.error).toBeUndefined()
    })
  })

  // ── AUTH-03: resetPasswordAction — bad/expired/used token ──────────────

  describe('resetPasswordAction — AUTH-03 complete (bad token)', () => {
    it('returns an error and does NOT call bcrypt.hash or db.update when token is invalid', async () => {
      consumeResetTokenMock.mockResolvedValue(null) // invalid / expired / used

      const { resetPasswordAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('token', 'bad-or-expired-token')
      fd.append('password', 'shouldNotMatter')
      const result = await resetPasswordAction({}, fd)

      // Security: no hash, no DB write when token is bad
      expect(bcryptHashMock).not.toHaveBeenCalled()
      expect(dbUpdateMock).not.toHaveBeenCalled()
      expect(dbSetMock).not.toHaveBeenCalled()

      expect(result.error).toBe('This reset link is invalid or has expired.')
      expect(result.message).toBeUndefined()
    })

    it('returns an error and does NOT update the password when token is missing', async () => {
      const { resetPasswordAction } = await import('@/actions/email-auth')

      const fd = new FormData()
      fd.append('token', '') // empty = fails zod min(1)
      fd.append('password', 'newpassword1')
      const result = await resetPasswordAction({}, fd)

      expect(consumeResetTokenMock).not.toHaveBeenCalled()
      expect(bcryptHashMock).not.toHaveBeenCalled()
      expect(dbUpdateMock).not.toHaveBeenCalled()

      expect(result.error).toBeTruthy()
    })
  })

  // ── verifyEmailAction ─────────────────────────────────────────────────

  describe('verifyEmailAction', () => {
    it('returns { ok: true } when the token is valid', async () => {
      consumeVerificationTokenMock.mockResolvedValue('user-uuid-456')

      const { verifyEmailAction } = await import('@/actions/email-auth')
      const result = await verifyEmailAction('valid-token')

      expect(result).toEqual({ ok: true })
      expect(consumeVerificationTokenMock).toHaveBeenCalledWith('valid-token')
    })

    it('returns { ok: false } when the token is invalid or expired', async () => {
      consumeVerificationTokenMock.mockResolvedValue(null)

      const { verifyEmailAction } = await import('@/actions/email-auth')
      const result = await verifyEmailAction('bad-token')

      expect(result).toEqual({ ok: false })
    })
  })
})
