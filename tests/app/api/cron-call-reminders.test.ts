import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

const sendDueCallRemindersMock = vi.fn()
vi.mock('@/lib/video-calls', () => ({ sendDueCallReminders: sendDueCallRemindersMock }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete process.env.CRON_SECRET
  sendDueCallRemindersMock.mockResolvedValue({ remindedCallIds: ['call-1', 'call-2'] })
})

function makeRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/cron/call-reminders', {
    method: 'POST',
    headers,
  })
}

describe('POST /api/cron/call-reminders', () => {
  it('missing authorization header: returns 401 and never calls sendDueCallReminders', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/call-reminders/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(sendDueCallRemindersMock).not.toHaveBeenCalled()
  })

  it('authorization header present but not matching Bearer CRON_SECRET: returns 401', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/call-reminders/route')
    const res = await POST(makeRequest({ authorization: 'Bearer wrong-secret' }))

    expect(res.status).toBe(401)
    expect(sendDueCallRemindersMock).not.toHaveBeenCalled()
  })

  it('CRON_SECRET unset on the server: returns 401 even with a plausible-looking header', async () => {
    // process.env.CRON_SECRET intentionally left unset by beforeEach's delete.
    const { POST } = await import('@/app/api/cron/call-reminders/route')
    const res = await POST(makeRequest({ authorization: 'Bearer anything' }))

    expect(res.status).toBe(401)
    expect(sendDueCallRemindersMock).not.toHaveBeenCalled()
  })

  it('correct Bearer CRON_SECRET header: returns 200 with the reminded-calls summary, calls sendDueCallReminders exactly once', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/call-reminders/route')
    const res = await POST(makeRequest({ authorization: 'Bearer the-real-secret' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      ok: true,
      remindedCount: 2,
      remindedCallIds: ['call-1', 'call-2'],
    })
    expect(sendDueCallRemindersMock).toHaveBeenCalledOnce()
  })
})
