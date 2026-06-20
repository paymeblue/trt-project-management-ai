import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only so tests can import server modules without the Next.js build guard
vi.mock('server-only', () => ({}))

const sendMock = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return { emails: { send: sendMock } }
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.EMAIL_FROM = 'TRT PM <onboarding@resend.dev>'
})

describe('email utility (Resend)', () => {
  describe('sendEmail()', () => {
    it('EMAIL-01: calls resend.emails.send with correct from/to/subject/html', async () => {
      sendMock.mockResolvedValue({ data: { id: 'msg-1' }, error: null })

      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })

      expect(sendMock).toHaveBeenCalledOnce()
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: process.env.EMAIL_FROM,
          to: 'user@example.com',
          subject: 'Hello',
          html: '<p>Hello</p>',
        })
      )
      expect(result).toEqual({ data: { id: 'msg-1' }, error: null })
    })

    it('EMAIL-01: accepts an array of recipients', async () => {
      sendMock.mockResolvedValue({ data: { id: 'msg-2' }, error: null })

      const { sendEmail } = await import('@/lib/email')
      await sendEmail({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Multi',
        html: '<p>Multi</p>',
      })

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['a@example.com', 'b@example.com'] })
      )
    })

    it('EMAIL-01: passes optional text field when provided', async () => {
      sendMock.mockResolvedValue({ data: { id: 'msg-3' }, error: null })

      const { sendEmail } = await import('@/lib/email')
      await sendEmail({
        to: 'user@example.com',
        subject: 'With text',
        html: '<p>Hi</p>',
        text: 'Hi',
      })

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Hi' })
      )
    })

    it('EMAIL-02: returns the SDK error object without throwing on provider failure', async () => {
      sendMock.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'fail' } })

      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({
        to: 'bad@example.com',
        subject: 'Fail',
        html: '<p>Fail</p>',
      })

      expect(result).toEqual({ data: null, error: { name: 'validation_error', message: 'fail' } })
      // must NOT throw — error is returned, not thrown
    })

    it('EMAIL-02: throws a clear error when RESEND_API_KEY is missing', async () => {
      delete process.env.RESEND_API_KEY

      const { sendEmail } = await import('@/lib/email')
      await expect(
        sendEmail({ to: 'user@example.com', subject: 'X', html: '<p>X</p>' })
      ).rejects.toThrow('RESEND_API_KEY')
    })
  })

  describe('verificationEmail()', () => {
    it('EMAIL-01: returns a non-empty subject and html containing the verifyUrl', async () => {
      const { verificationEmail } = await import('@/lib/email-templates')
      const verifyUrl = 'https://example.com/verify?token=abc123'
      const result = verificationEmail({ name: 'Alice', verifyUrl })

      expect(result.subject).toBeTruthy()
      expect(result.html).toContain(verifyUrl)
      expect(result.text).toContain(verifyUrl)
    })

    it('EMAIL-01: subject mentions verification intent', async () => {
      const { verificationEmail } = await import('@/lib/email-templates')
      const result = verificationEmail({ name: 'Bob', verifyUrl: 'https://example.com/v' })

      expect(result.subject.toLowerCase()).toMatch(/verify/)
    })
  })

  describe('passwordResetEmail()', () => {
    it('EMAIL-01: returns a non-empty subject and html containing the resetUrl', async () => {
      const { passwordResetEmail } = await import('@/lib/email-templates')
      const resetUrl = 'https://example.com/reset?token=xyz789'
      const result = passwordResetEmail({ name: 'Carol', resetUrl })

      expect(result.subject).toBeTruthy()
      expect(result.html).toContain(resetUrl)
      expect(result.text).toContain(resetUrl)
    })

    it('EMAIL-01: subject mentions reset intent', async () => {
      const { passwordResetEmail } = await import('@/lib/email-templates')
      const result = passwordResetEmail({ name: 'Dave', resetUrl: 'https://example.com/r' })

      expect(result.subject.toLowerCase()).toMatch(/reset/)
    })
  })
})
