import { describe, it, expect, beforeEach, vi } from 'vitest'

const { selectMock, sendEmailMock, isActiveMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendEmailMock: vi.fn(),
  isActiveMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: { select: selectMock } }))
vi.mock('@/lib/email', () => ({ sendEmail: sendEmailMock, isEmailServiceActive: isActiveMock }))

const { emailVideoCallScheduled } = await import('@/lib/notify-video-call-email')

function usersQuery(rows: { id: string; name: string; email: string }[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emailVideoCallScheduled', () => {
  const base = {
    callId: 'call-1',
    title: 'Kickoff',
    scheduledFor: new Date('2026-08-01T10:00:00Z'),
    schedulerName: 'Alice Admin',
  }

  it('does nothing when the email service is not configured', async () => {
    isActiveMock.mockReturnValue(false)
    await emailVideoCallScheduled({ ...base, inviteeIds: ['u1'] })
    expect(selectMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('does nothing when the invitee list is empty', async () => {
    isActiveMock.mockReturnValue(true)
    await emailVideoCallScheduled({ ...base, inviteeIds: [] })
    expect(selectMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('sends a single email carrying every invitee address', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(
      usersQuery([
        { id: 'u1', name: 'Bob Officer', email: 'bob@x.com' },
        { id: 'u2', name: 'Cara Officer', email: 'cara@x.com' },
      ]),
    )
    await emailVideoCallScheduled({ ...base, inviteeIds: ['u1', 'u2'] })
    expect(sendEmailMock).toHaveBeenCalledOnce()
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['bob@x.com', 'cara@x.com'] }),
    )
  })

  it('never throws even if sendEmail rejects (best-effort)', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([{ id: 'u1', name: 'Bob Officer', email: 'bob@x.com' }]))
    sendEmailMock.mockRejectedValue(new Error('resend down'))
    await expect(
      emailVideoCallScheduled({ ...base, inviteeIds: ['u1'] }),
    ).resolves.toBeUndefined()
  })

  it('never throws when the db select rejects (best-effort)', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue({
      from: () => ({ where: () => Promise.reject(new Error('db down')) }),
    })
    await expect(
      emailVideoCallScheduled({ ...base, inviteeIds: ['u1'] }),
    ).resolves.toBeUndefined()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
