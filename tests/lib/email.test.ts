import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only so tests can import server modules without the Next.js build guard
vi.mock('server-only', () => ({}))

beforeEach(() => {
  vi.resetModules()
  delete process.env.RESEND_API_KEY
  delete process.env.SENDGRID_API_KEY
  delete process.env.SENDGRID_APIKEY
  process.env.EMAIL_FROM = 'TRT PM <notifications@trtarredo.com>'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('email utility (SendGrid)', () => {
  it('reports whether SendGrid email delivery is configured', async () => {
    process.env.SENDGRID_API_KEY = 'sg-test-key'
    const { isEmailServiceActive } = await import('@/lib/email')
    expect(isEmailServiceActive()).toBe(true)

    delete process.env.SENDGRID_API_KEY
    expect(isEmailServiceActive()).toBe(false)
  })

  describe('sendEmail()', () => {
    it('EMAIL-01: POSTs to the v3 endpoint with the correct from/to/subject/html', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key'
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers({ 'x-message-id': 'msg-1' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.sendgrid.com/v3/mail/send')
      const body = JSON.parse(init.body as string)
      expect(body.from).toEqual({ email: 'notifications@trtarredo.com', name: 'TRT PM' })
      expect(body.personalizations).toEqual([{ to: [{ email: 'user@example.com' }] }])
      expect(body.subject).toBe('Hello')
      expect(body.content).toEqual([{ type: 'text/html', value: '<p>Hello</p>' }])
      expect(result).toEqual({ data: { id: 'msg-1' }, error: null })
    })

    it('EMAIL-01: an array of recipients produces one personalization EACH (not one shared `to`)', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key'
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers({ 'x-message-id': 'msg-2' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { sendEmail } = await import('@/lib/email')
      await sendEmail({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Multi',
        html: '<p>Multi</p>',
      })

      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body.personalizations).toEqual([
        { to: [{ email: 'a@example.com' }] },
        { to: [{ email: 'b@example.com' }] },
      ])
    })

    it('EMAIL-01: includes the optional text field as text/plain BEFORE text/html', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key'
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers({ 'x-message-id': 'msg-3' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { sendEmail } = await import('@/lib/email')
      await sendEmail({
        to: 'user@example.com',
        subject: 'With text',
        html: '<p>Hi</p>',
        text: 'Hi',
      })

      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body.content).toEqual([
        { type: 'text/plain', value: 'Hi' },
        { type: 'text/html', value: '<p>Hi</p>' },
      ])
    })

    it('EMAIL-01: omits the text part entirely when not supplied', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key'
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        headers: new Headers({ 'x-message-id': 'msg-4' }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { sendEmail } = await import('@/lib/email')
      await sendEmail({ to: 'user@example.com', subject: 'No text', html: '<p>Hi</p>' })

      const [, init] = fetchMock.mock.calls[0]
      const body = JSON.parse(init.body as string)
      expect(body.content).toEqual([{ type: 'text/html', value: '<p>Hi</p>' }])
    })

    it('EMAIL-02: RETURNS a provider error rather than throwing on send failure', async () => {
      process.env.SENDGRID_API_KEY = 'sg-test-key'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          headers: new Headers(),
          json: async () => ({ errors: [{ message: 'fail' }] }),
        }),
      )

      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({
        to: 'bad@example.com',
        subject: 'Fail',
        html: '<p>Fail</p>',
      })

      expect(result.data).toBeNull()
      expect(result.error?.name).toBe('sendgrid_error')
      expect(result.error?.message).toContain('fail')
      // must NOT throw — error is returned, not thrown
    })

    it('EMAIL-02: throws a clear error naming SENDGRID_API_KEY when no key is configured at all', async () => {
      const { sendEmail } = await import('@/lib/email')
      await expect(
        sendEmail({ to: 'user@example.com', subject: 'X', html: '<p>X</p>' })
      ).rejects.toThrow('SENDGRID_API_KEY')
    })

    it('never leaks the API key into the returned diagnostic', async () => {
      process.env.SENDGRID_API_KEY = 'sg-super-secret'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ errors: [{ message: 'Permission denied' }] }),
        }),
      )

      const { sendEmail } = await import('@/lib/email')
      const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' })
      expect(JSON.stringify(result)).not.toContain('sg-super-secret')
    })

    it('setting only RESEND_API_KEY leaves isEmailServiceActive FALSE (proves the fallback is gone)', async () => {
      process.env.RESEND_API_KEY = 'r-key'
      const { isEmailServiceActive } = await import('@/lib/email')
      expect(isEmailServiceActive()).toBe(false)
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
