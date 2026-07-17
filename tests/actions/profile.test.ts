import { describe, it, expect, beforeEach, vi } from 'vitest'

const { dbMock, updateSetMock, whereMock, verifySessionForActionMock, positionExistsMock } = vi.hoisted(() => {
  const whereMock = vi.fn()
  const updateSetMock = vi.fn(() => ({ where: whereMock }))
  const dbMock = { update: () => ({ set: updateSetMock }) }
  return {
    dbMock,
    updateSetMock,
    whereMock,
    verifySessionForActionMock: vi.fn(),
    positionExistsMock: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySessionForAction: verifySessionForActionMock }))
vi.mock('@/lib/positions', () => ({ positionExists: positionExistsMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

function makeProfileFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.append('name', overrides.name ?? 'Jane Doe')
  fd.append('position', overrides.position ?? '')
  fd.append('bio', overrides.bio ?? 'Updated bio')
  fd.append('avatarData', overrides.avatarData ?? '')
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  whereMock.mockResolvedValue(undefined)
  positionExistsMock.mockResolvedValue(false)
})

describe('updateProfileAction (bound-argument per-tab pattern)', () => {
  it('valid tabToken + valid FormData: resolves userId via verifySessionForAction(tabToken) and updates that user\'s row', async () => {
    verifySessionForActionMock.mockResolvedValue({ userId: 'tab-user-1', role: 'operations' })

    const { updateProfileAction } = await import('@/actions/profile')
    await updateProfileAction('bound-tab-token', makeProfileFormData({ bio: 'New bio via tab' }))

    expect(verifySessionForActionMock).toHaveBeenCalledWith('bound-tab-token')
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jane Doe', bio: 'New bio via tab' }),
    )
    expect(whereMock).toHaveBeenCalled()
  })

  it('tabToken = null: falls back to the mocked cookie auth() path via verifySessionForAction(null) — unchanged default behavior', async () => {
    verifySessionForActionMock.mockResolvedValue({ userId: 'cookie-user-1', role: 'site_pm' })

    const { updateProfileAction } = await import('@/actions/profile')
    await updateProfileAction(null, makeProfileFormData())

    expect(verifySessionForActionMock).toHaveBeenCalledWith(null)
    expect(updateSetMock).toHaveBeenCalled()
    expect(whereMock).toHaveBeenCalled()
  })

  it('invalid/expired tabToken: throws REDIRECT, DB update NOT called', async () => {
    verifySessionForActionMock.mockImplementation(() => {
      throw new Error('REDIRECT')
    })

    const { updateProfileAction } = await import('@/actions/profile')
    await expect(updateProfileAction('expired-token', makeProfileFormData())).rejects.toThrow('REDIRECT')

    expect(updateSetMock).not.toHaveBeenCalled()
    expect(whereMock).not.toHaveBeenCalled()
  })
})
