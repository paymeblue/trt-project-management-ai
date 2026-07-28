import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────────────────────

const sweepStaleCallsMock = vi.fn()
vi.mock('@/lib/video-calls', () => ({ sweepStaleCalls: sweepStaleCallsMock }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete process.env.CRON_SECRET
  sweepStaleCallsMock.mockResolvedValue({
    examined: 3,
    endedCallIds: ['call-1', 'call-2'],
    skipped: [{ callId: 'call-3', reason: 'within-grace' }],
  })
})

function makeRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/cron/end-stale-calls', {
    method: 'POST',
    headers,
  })
}

describe('POST /api/cron/end-stale-calls', () => {
  it('missing authorization header: returns 401 and never calls sweepStaleCalls', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/end-stale-calls/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(sweepStaleCallsMock).not.toHaveBeenCalled()
  })

  it('authorization header present but not matching Bearer CRON_SECRET: returns 401', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/end-stale-calls/route')
    const res = await POST(makeRequest({ authorization: 'Bearer wrong-secret' }))

    expect(res.status).toBe(401)
    expect(sweepStaleCallsMock).not.toHaveBeenCalled()
  })

  it('CRON_SECRET unset on the server: returns 401 even with a plausible-looking header', async () => {
    // process.env.CRON_SECRET intentionally left unset by beforeEach's delete.
    const { POST } = await import('@/app/api/cron/end-stale-calls/route')
    const res = await POST(makeRequest({ authorization: 'Bearer anything' }))

    expect(res.status).toBe(401)
    expect(sweepStaleCallsMock).not.toHaveBeenCalled()
  })

  it('correct Bearer CRON_SECRET header: returns 200 with the counts from the mocked lib function', async () => {
    process.env.CRON_SECRET = 'the-real-secret'

    const { POST } = await import('@/app/api/cron/end-stale-calls/route')
    const res = await POST(makeRequest({ authorization: 'Bearer the-real-secret' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      ok: true,
      endedCount: 2,
      endedCallIds: ['call-1', 'call-2'],
      skippedCount: 1,
    })
    expect(sweepStaleCallsMock).toHaveBeenCalledOnce()
  })
})
