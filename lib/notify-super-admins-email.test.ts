import { describe, it, expect, beforeEach, vi } from 'vitest'

const { selectMock, sendEmailMock, isActiveMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendEmailMock: vi.fn(),
  isActiveMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: { select: selectMock } }))
vi.mock('@/lib/email', () => ({ sendEmail: sendEmailMock, isEmailServiceActive: isActiveMock }))

const { emailSuperAdminsTaskCompleted, emailSuperAdminsProjectClosedOut } = await import(
  '@/lib/notify-super-admins-email'
)

function usersQuery(rows: { email: string }[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emailSuperAdminsTaskCompleted', () => {
  it('does nothing when the email service is not configured', async () => {
    isActiveMock.mockReturnValue(false)
    await emailSuperAdminsTaskCompleted({ projectName: 'P', stepLabel: 'S', actorName: 'A' })
    expect(selectMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('emails every super admin when the service is active', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([{ email: 'admin1@x.com' }, { email: 'admin2@x.com' }]))
    await emailSuperAdminsTaskCompleted({ projectName: 'P', stepLabel: 'S', actorName: 'A' })
    expect(sendEmailMock).toHaveBeenCalledOnce()
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['admin1@x.com', 'admin2@x.com'] }),
    )
  })

  it('never throws even if sendEmail rejects (best-effort)', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([{ email: 'admin1@x.com' }]))
    sendEmailMock.mockRejectedValue(new Error('resend down'))
    await expect(
      emailSuperAdminsTaskCompleted({ projectName: 'P', stepLabel: 'S', actorName: 'A' }),
    ).resolves.toBeUndefined()
  })

  it('skips sending when there are no super admins', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([]))
    await emailSuperAdminsTaskCompleted({ projectName: 'P', stepLabel: 'S', actorName: 'A' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('emailSuperAdminsProjectClosedOut', () => {
  it('emails every super admin with the deadline status', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([{ email: 'admin1@x.com' }]))
    await emailSuperAdminsProjectClosedOut({ projectName: 'P', metDeadline: true })
    expect(sendEmailMock).toHaveBeenCalledOnce()
  })
})
