import { describe, it, expect, beforeEach, vi } from 'vitest'

const {
  dbMock,
  verifyMock,
  insertValuesMock,
  advanceMock,
  getLiveStepsMock,
  assigneeGatedRolesMock,
  getStepAssigneeGateMock,
} = vi.hoisted(() => {
  const insertValuesMock = vi.fn()
  const dbMock = { insert: () => ({ values: insertValuesMock }) }
  return {
    dbMock,
    verifyMock: vi.fn(),
    insertValuesMock,
    advanceMock: vi.fn(),
    getLiveStepsMock: vi.fn(),
    assigneeGatedRolesMock: vi.fn(),
    getStepAssigneeGateMock: vi.fn(),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock }))
vi.mock('@/actions/workflow', () => ({ advanceOrConfirmDualRole: advanceMock }))
vi.mock('@/lib/workflow-graph', () => ({
  getLiveWorkflowSteps: getLiveStepsMock,
  assigneeGatedRoles: assigneeGatedRolesMock,
  getStepAssigneeGate: getStepAssigneeGateMock,
}))
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
  // Default: no assignee gate applies (matches the existing tests' role/step
  // combos, none of which are gated).
  assigneeGatedRolesMock.mockReturnValue([])
  getStepAssigneeGateMock.mockResolvedValue(null)
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

  // Quick task 260716-h0i: real server-side assignee-gate enforcement.
  describe('assignee gate (quick task 260716-h0i)', () => {
    it('allows the assigned site_pm to submit a gated step', async () => {
      verifyMock.mockResolvedValue({ userId: 's1', role: 'site_pm' })
      getLiveStepsMock.mockResolvedValue([
        { n: 3, key: 'materials_readiness', label: 'Materials Readiness', role: 'site_pm', kind: 'readiness', slug: undefined, stepDefId: 'stepdef-3', dualRoles: null },
      ])
      assigneeGatedRolesMock.mockReturnValue(['site_pm'])
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { submitReadinessAction } = await import('@/actions/readiness')
      const res = await submitReadinessAction(
        { status: 'idle' },
        { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
      )
      expect(res.status).toBe('success')
      expect(insertValuesMock).toHaveBeenCalledOnce()
      expect(getStepAssigneeGateMock).toHaveBeenCalledWith('live', 'p1', 'materials_readiness')
    })

    it('rejects an unassigned site_pm on a gated step, before any DB write', async () => {
      verifyMock.mockResolvedValue({ userId: 's2', role: 'site_pm' })
      getLiveStepsMock.mockResolvedValue([
        { n: 3, key: 'materials_readiness', label: 'Materials Readiness', role: 'site_pm', kind: 'readiness', slug: undefined, stepDefId: 'stepdef-3', dualRoles: null },
      ])
      assigneeGatedRolesMock.mockReturnValue(['site_pm'])
      // Gate is held by a DIFFERENT user ('s1') than the caller ('s2').
      getStepAssigneeGateMock.mockResolvedValue('s1')

      const { submitReadinessAction } = await import('@/actions/readiness')
      const res = await submitReadinessAction(
        { status: 'idle' },
        { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
      )
      expect(res.status).toBe('error')
      expect(insertValuesMock).not.toHaveBeenCalled()
    })

    it('DUAL-ROLE SAFETY: a factory_pm acting on their own half of dual-role materials_readiness is unaffected by the site_pm gate', async () => {
      verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
      getLiveStepsMock.mockResolvedValue([
        {
          n: 3,
          key: 'materials_readiness',
          label: 'Materials Readiness',
          role: 'factory_pm',
          kind: 'readiness',
          slug: undefined,
          stepDefId: 'stepdef-3',
          dualRoles: ['factory_pm', 'site_pm'],
        },
      ])
      // The step IS site_pm-gated, but the caller's role ('factory_pm')
      // never appears in assigneeGatedRoles('materials_readiness') (['site_pm']),
      // so submitReadinessAction must never even consult the gate — even
      // though, if it did, getStepAssigneeGateMock would resolve a userId
      // that differs from the caller and would otherwise reject them.
      assigneeGatedRolesMock.mockReturnValue(['site_pm'])
      getStepAssigneeGateMock.mockResolvedValue('some-other-site-pm-id')

      const { submitReadinessAction } = await import('@/actions/readiness')
      const res = await submitReadinessAction(
        { status: 'idle' },
        { mode: 'upload', project: 'P', photos: [PHOTO, PHOTO], projectId: 'p1', expectedStepN: 3 },
      )
      expect(res.status).toBe('success')
      expect(insertValuesMock).toHaveBeenCalledOnce()
      expect(getStepAssigneeGateMock).not.toHaveBeenCalled()
    })
  })
})
