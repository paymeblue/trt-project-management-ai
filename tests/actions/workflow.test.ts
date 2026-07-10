import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LIVE_WORKFLOW_STEPS } from '@/db/workflow-live-steps'

// Rows shaped like workflowStepDefinitions.$inferSelect, derived from the
// canonical LIVE_WORKFLOW_STEPS array — feeds getLiveWorkflowSteps()'s .orderBy()
// query (advanceProjectStep now resolves steps via the live graph, plan 17-02).
const liveStepDefRows = LIVE_WORKFLOW_STEPS.map((s) => ({
  id: `stepdef-${s.n}`,
  graph: 'live',
  stepKey: s.key,
  label: s.label,
  role: s.role,
  fulfillmentKind: s.kind,
  checklistSlug: s.slug ?? null,
  targetRole: null,
  isOptional: false,
  orderIndex: s.n,
}))

const {
  dbMock,
  verifyMock,
  selectLimitMock,
  selectOrderByMock,
  insertValuesMock,
  setMock,
  updateWhereMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const selectOrderByMock = vi.fn()
  const insertValuesMock = vi.fn()
  const updateWhereMock = vi.fn()
  const setMock = vi.fn(() => ({ where: updateWhereMock }))
  const dbMock = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimitMock, orderBy: selectOrderByMock }),
      }),
    }),
    insert: () => ({ values: insertValuesMock }),
    update: () => ({ set: setMock }),
  }
  return {
    dbMock,
    verifyMock: vi.fn(),
    selectLimitMock,
    selectOrderByMock,
    insertValuesMock,
    setMock,
    updateWhereMock,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: dbMock }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  insertValuesMock.mockResolvedValue(undefined)
  updateWhereMock.mockResolvedValue(undefined)
  selectOrderByMock.mockResolvedValue(liveStepDefRows)
})

describe('advanceProjectStep', () => {
  it('advances when the project is at the expected step and the role can act', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    // step 2 = assign_designer_brief (design)
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 2, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(true)
    expect(insertValuesMock).toHaveBeenCalledOnce()
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 3, status: 'not_delivered' }),
    )
  })

  it('is a no-op when the project is no longer at the expected step (idempotent)', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 5, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
    expect(setMock).not.toHaveBeenCalled()
  })

  it('refuses when the caller role cannot act on the step', async () => {
    // step 2 (assign_designer_brief) belongs to design; a factory_pm must be refused
    verifyMock.mockResolvedValue({ userId: 'f1', role: 'factory_pm' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 2, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 2 })

    expect(ok).toBe(false)
    expect(insertValuesMock).not.toHaveBeenCalled()
  })

  it('Close Out (step 25) advances to Sign Off (26) but is NOT yet delivered', async () => {
    // step 25 = close_out (site_pm); delivery only happens after Sign Off (REQ-G04)
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'site_pm' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 25, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 25 })

    expect(ok).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 26, status: 'not_delivered' }),
    )
  })

  it('marks the project delivered after Sign Off (step 26) completes', async () => {
    // step 26 = sign_off (super_admin) — the new final step
    verifyMock.mockResolvedValue({ userId: 'admin1', role: 'super_admin' })
    selectLimitMock.mockResolvedValue([{ id: 'p1', currentStep: 26, status: 'not_delivered' }])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'p1', expectedStepN: 26 })

    expect(ok).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ currentStep: 27, status: 'delivered' }),
    )
  })

  it('returns false when the project does not exist', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'site_pm' })
    selectLimitMock.mockResolvedValue([])

    const { advanceProjectStep } = await import('@/actions/workflow')
    const ok = await advanceProjectStep({ projectId: 'missing', expectedStepN: 2 })

    expect(ok).toBe(false)
  })
})
