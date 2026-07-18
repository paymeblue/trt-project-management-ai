import { describe, it, expect, beforeEach, vi } from 'vitest'

const {
  dbMock,
  verifyMock,
  selectLimitMock,
  insertValuesMock,
  deleteWhereMock,
  setWhereMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const insertValuesMock = vi.fn()
  const deleteWhereMock = vi.fn()
  const setWhereMock = vi.fn()
  const dbMock = {
    select: () => ({ from: () => ({ where: () => ({ limit: selectLimitMock }) }) }),
    insert: () => ({ values: insertValuesMock }),
    update: () => ({ set: () => ({ where: setWhereMock }) }),
    delete: () => ({ where: deleteWhereMock }),
  }
  return { dbMock, verifyMock: vi.fn(), selectLimitMock, insertValuesMock, deleteWhereMock, setWhereMock }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({
  verifySession: verifyMock,
  verifySessionForAction: verifyMock,
  isAdminRole: (r: string) => r === 'super_admin' || r === 'operations',
}))

const IMAGE = 'data:image/png;base64,AAAA'

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  insertValuesMock.mockResolvedValue(undefined)
  deleteWhereMock.mockResolvedValue(undefined)
  setWhereMock.mockResolvedValue(undefined)
  selectLimitMock.mockResolvedValue([]) // slug is unique by default
})

describe('createProcessImageAction (admin upload)', () => {
  it('rejects non-admin users (Site PM)', async () => {
    verifyMock.mockResolvedValue({ userId: 's1', role: 'site_pm' })
    const { createProcessImageAction } = await import('@/actions/processes')
    const res = await createProcessImageAction(null, { title: 'Flow', imageData: IMAGE })
    expect(res.ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('requires an image', async () => {
    verifyMock.mockResolvedValue({ userId: 'a1', role: 'super_admin' })
    const { createProcessImageAction } = await import('@/actions/processes')
    const res = await createProcessImageAction(null, { title: 'Flow', imageData: '' })
    expect(res.ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('requires a title', async () => {
    verifyMock.mockResolvedValue({ userId: 'a1', role: 'super_admin' })
    const { createProcessImageAction } = await import('@/actions/processes')
    const res = await createProcessImageAction(null, { title: 'x', imageData: IMAGE })
    expect(res.ok).toBe(false)
  })

  it('creates the process flow for a super_admin', async () => {
    verifyMock.mockResolvedValue({ userId: 'a1', role: 'super_admin' })
    const { createProcessImageAction } = await import('@/actions/processes')
    const res = await createProcessImageAction(null, { title: 'Delivery Flow', imageData: IMAGE })
    expect(res.ok).toBe(true)
    expect(res.slug).toBe('delivery-flow')
    expect(insertValuesMock).toHaveBeenCalledOnce()
  })

  it('allows operations to upload too', async () => {
    verifyMock.mockResolvedValue({ userId: 'op1', role: 'operations' })
    const { createProcessImageAction } = await import('@/actions/processes')
    const res = await createProcessImageAction(null, { title: 'Ops Flow', imageData: IMAGE })
    expect(res.ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledOnce()
  })
})

describe('deleteProcessAction (admin only)', () => {
  it('rejects non-admin', async () => {
    verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
    const { deleteProcessAction } = await import('@/actions/processes')
    const res = await deleteProcessAction(null, 'some-flow')
    expect(res.ok).toBe(false)
    expect(deleteWhereMock).not.toHaveBeenCalled()
  })

  it('deletes for an admin', async () => {
    verifyMock.mockResolvedValue({ userId: 'a1', role: 'super_admin' })
    const { deleteProcessAction } = await import('@/actions/processes')
    const res = await deleteProcessAction(null, 'some-flow')
    expect(res.ok).toBe(true)
    expect(deleteWhereMock).toHaveBeenCalledOnce()
  })
})
