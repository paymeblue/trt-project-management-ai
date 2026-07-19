import { describe, it, expect, beforeEach, vi } from 'vitest'

const { selectMock, sendEmailMock, isActiveMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendEmailMock: vi.fn(),
  isActiveMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: { select: selectMock } }))
vi.mock('@/lib/email', () => ({ sendEmail: sendEmailMock, isEmailServiceActive: isActiveMock }))

const { emailStepTurn, emailSuperAdminsProjectClosedOut } = await import(
  '@/lib/notify-super-admins-email'
)

function usersQuery(rows: { email: string }[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('emailStepTurn (position-scoped, 2026-07-19 — replaces the all-super-admin step broadcast)', () => {
  it('does nothing when the email service is not configured', async () => {
    isActiveMock.mockReturnValue(false)
    await emailStepTurn(['officer@x.com'], { projectName: 'P', stepLabel: 'S' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('emails exactly the resolved officers — never queries for super admins itself', async () => {
    isActiveMock.mockReturnValue(true)
    await emailStepTurn(['officer1@x.com', 'officer2@x.com'], { projectName: 'P', stepLabel: 'S' })
    expect(selectMock).not.toHaveBeenCalled()
    expect(sendEmailMock).toHaveBeenCalledOnce()
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['officer1@x.com', 'officer2@x.com'] }),
    )
  })

  it('never throws even if sendEmail rejects (best-effort)', async () => {
    isActiveMock.mockReturnValue(true)
    sendEmailMock.mockRejectedValue(new Error('resend down'))
    await expect(
      emailStepTurn(['officer@x.com'], { projectName: 'P', stepLabel: 'S' }),
    ).resolves.toBeUndefined()
  })

  it('skips sending for an empty recipient list', async () => {
    isActiveMock.mockReturnValue(true)
    await emailStepTurn([], { projectName: 'P', stepLabel: 'S' })
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('emailSuperAdminsProjectClosedOut (project-level oversight digest — still every super admin)', () => {
  it('emails every super admin with the deadline status', async () => {
    isActiveMock.mockReturnValue(true)
    selectMock.mockReturnValue(usersQuery([{ email: 'admin1@x.com' }]))
    await emailSuperAdminsProjectClosedOut({ projectName: 'P', metDeadline: true })
    expect(sendEmailMock).toHaveBeenCalledOnce()
  })
})
