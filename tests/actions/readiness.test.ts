import { describe, it, expect, beforeEach, vi } from 'vitest'

const { dbMock, verifyMock, insertValuesMock, advanceMock, getLiveStepsMock } = vi.hoisted(() => {
  const insertValuesMock = vi.fn()
  const dbMock = { insert: () => ({ values: insertValuesMock }) }
  return {
    dbMock,
    verifyMock: vi.fn(),
    insertValuesMock,
    advanceMock: vi.fn(),
    getLiveStepsMock: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock }))
vi.mock('@/actions/workflow', () => ({ advanceOrConfirmDualRole: advanceMock }))
vi.mock('@/lib/workflow-graph', () => ({ getLiveWorkflowSteps: getLiveStepsMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const PHOTO = 'data:image/png;base64,AAAA'

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
  insertValuesMock.mockResolvedValue(undefined)
  advanceMock.mockResolvedValue(false)
  getLiveStepsMock.mockResolvedValue([
    { n: 3, key: 'test_step', label: 'Test', role: 'factory_pm', kind: 'readiness', slug: undefined, stepDefId: 'stepdef-3', dualRoles: null },
  ])
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

  it('rejects a step-linked submission from a role not authorized for the live step', async () => {
    getLiveStepsMock.mockResolvedValue([
      { n: 3, key: 'test_step', label: 'Test', role: 'factory_manager', kind: 'readiness', slug: undefined, stepDefId: 'stepdef-3', dualRoles: null },
    ])
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
    )
    expect(res.status).toBe('error')
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('allows a dualRoles-authorized non-primary role to submit a step-linked form', async () => {
    verifyMock.mockResolvedValue({ userId: 's1', role: 'site_pm' })
    getLiveStepsMock.mockResolvedValue([
      { n: 3, key: 'test_step', label: 'Test', role: 'factory_pm', kind: 'readiness', slug: undefined, stepDefId: 'stepdef-3', dualRoles: ['factory_pm', 'site_pm'] },
    ])
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
    )
    expect(res.status).toBe('success')
  })

  it('skips the authorization gate for non-step-linked submissions', async () => {
    const { submitReadinessAction } = await import('@/actions/readiness')
    const res = await submitReadinessAction(
      { status: 'idle' },
      { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO] },
    )
    expect(res.status).toBe('success')
    expect(getLiveStepsMock).not.toHaveBeenCalled()
  })
})
