import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only so tests can import server modules without the Next.js build guard
vi.mock('server-only', () => ({}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete process.env.SENDGRID_API_KEY
  process.env.EMAIL_FROM = 'TRT PM <notifications@trtarredo.com>'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseEmailFrom (SendGrid needs discrete name/email)', () => {
  it('splits a display-name address', async () => {
    const { parseEmailFrom } = await import('@/lib/email')
    expect(parseEmailFrom('TRT PM <notifications@trtarredo.com>')).toEqual({
      email: 'notifications@trtarredo.com',
      name: 'TRT PM',
    })
  })

  it('strips surrounding quotes from a quoted display name', async () => {
    const { parseEmailFrom } = await import('@/lib/email')
    expect(parseEmailFrom('"TRT Arredo, Ltd" <ops@trtarredo.com>')).toEqual({
      email: 'ops@trtarredo.com',
      name: 'TRT Arredo, Ltd',
    })
  })

  it('passes a bare address through with no name', async () => {
    const { parseEmailFrom } = await import('@/lib/email')
    expect(parseEmailFrom('ops@trtarredo.com')).toEqual({ email: 'ops@trtarredo.com' })
  })
})

describe('buildSendGridPayload', () => {
  it('gives each recipient their OWN personalization so addresses are not disclosed', async () => {
    const { buildSendGridPayload } = await import('@/lib/email')
    const payload = buildSendGridPayload({
      from: 'TRT PM <notifications@trtarredo.com>',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Your turn',
      html: '<p>hi</p>',
    })
    expect(payload.personalizations).toEqual([
      { to: [{ email: 'a@example.com' }] },
      { to: [{ email: 'b@example.com' }] },
    ])
  })

  it('orders text/plain before text/html (SendGrid rejects the reverse)', async () => {
    const { buildSendGridPayload } = await import('@/lib/email')
    const payload = buildSendGridPayload({
      from: 'ops@trtarredo.com',
      to: 'a@example.com',
      subject: 's',
      html: '<p>h</p>',
      text: 'h',
    })
    expect(payload.content.map((c) => c.type)).toEqual(['text/plain', 'text/html'])
  })

  it('omits the text part entirely when not supplied', async () => {
    const { buildSendGridPayload } = await import('@/lib/email')
    const payload = buildSendGridPayload({ from: 'o@t.com', to: 'a@e.com', subject: 's', html: '<p>h</p>' })
    expect(payload.content).toEqual([{ type: 'text/html', value: '<p>h</p>' }])
  })

  it('drops blank recipients', async () => {
    const { buildSendGridPayload } = await import('@/lib/email')
    const payload = buildSendGridPayload({ from: 'o@t.com', to: ['a@e.com', '  ', ''], subject: 's', html: 'h' })
    expect(payload.personalizations).toHaveLength(1)
  })
})

describe('sendEmail via SendGrid', () => {
  it('POSTs to the v3 endpoint with a bearer token and returns the message id', async () => {
    process.env.SENDGRID_API_KEY = 'sg-test-key'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      headers: new Headers({ 'x-message-id': 'sg-msg-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { sendEmail } = await import('@/lib/email')
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sg-test-key')
    expect(result).toEqual({ data: { id: 'sg-msg-1' }, error: null })
  })

  it('RETURNS a provider error rather than throwing, so best-effort callers are unaffected', async () => {
    process.env.SENDGRID_API_KEY = 'sg-test-key'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ errors: [{ message: 'The from address does not match a verified Sender Identity.' }] }),
      }),
    )

    const { sendEmail } = await import('@/lib/email')
    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(result.data).toBeNull()
    expect(result.error?.name).toBe('sendgrid_error')
    expect(result.error?.message).toContain('403')
    expect(result.error?.message).toContain('verified Sender Identity')
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

  it('throws only when NO transport is configured at all', async () => {
    const { sendEmail } = await import('@/lib/email')
    await expect(sendEmail({ to: 'a@example.com', subject: 'x', html: 'y' })).rejects.toThrow(
      /SendGrid is not configured/,
    )
  })
})
