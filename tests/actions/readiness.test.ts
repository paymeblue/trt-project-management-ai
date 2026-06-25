import { describe, it, expect, beforeEach, vi } from 'vitest'

const { dbMock, verifyMock, insertValuesMock, advanceMock } = vi.hoisted(() => {
  const insertValuesMock = vi.fn()
  const dbMock = { insert: () => ({ values: insertValuesMock }) }
  return { dbMock, verifyMock: vi.fn(), insertValuesMock, advanceMock: vi.fn() }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock }))
vi.mock('@/actions/workflow', () => ({ advanceProjectStep: advanceMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const PHOTO = 'data:image/png;base64,AAAA'

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
  insertValuesMock.mockResolvedValue(undefined)
  advanceMock.mockResolvedValue(false)
})

describe('submitReadinessAction — requires 2 photos', () => {
  it('rejects with fewer than 2 photos (upload mode)', async () => {
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO] },
    )
    expect(res.status).toBe('error')
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('rejects digital mode without a signature even with 2 photos', async () => {
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'digital', project: 'P', confirmedBy: 'Me', photos: [PHOTO, PHOTO] },
    )
    expect(res.status).toBe('error')
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('saves an upload-mode form with 2 photos', async () => {
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO] },
    )
    expect(res.status).toBe('success')
    expect(insertValuesMock).toHaveBeenCalledOnce()
    const values = insertValuesMock.mock.calls[0][0]
    expect(values.photoData).toHaveLength(2)
  })

  it('advances the workflow step when launched from a project', async () => {
    advanceMock.mockResolvedValue(true)
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
    )
    expect(res.status).toBe('success')
    expect(res.advanced).toBe(true)
    expect(advanceMock).toHaveBeenCalledWith({ projectId: 'p1', expectedStepN: 3 })
  })

  it('ignores non-image strings when counting photos', async () => {
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, 'not-an-image'] },
    )
    expect(res.status).toBe('error')
    expect(insertValuesMock).not.toHaveBeenCalled()
  })
})
