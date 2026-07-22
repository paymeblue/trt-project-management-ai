import { describe, it, expect, beforeEach, vi } from 'vitest'

// Coverage for submitAdditionalRequirementAction (quick task
// readiness-ack-sync) — fulfills a single 'ack'/'readiness' requirement
// stacked as an ADDITIONAL kind on a step (e.g. confirmation_correction's
// yes_no_upload + ack + readiness), distinct from completeAckStepAction
// (actions/workflow.ts) which only applies when 'ack' is the step's SOLE
// kind. Mocks the same dependency surface as
// submit-yes-no-upload-required.test.ts: authorizeStep's DB reads, plus the
// two lib/workflow-graph.ts write functions this action calls.

const {
  verifyMock,
  getStepByIdMock,
  recordAdditionalRequirementMock,
  completeGraphStepMock,
  selectLimitMock,
} = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  getStepByIdMock: vi.fn(),
  recordAdditionalRequirementMock: vi.fn(),
  completeGraphStepMock: vi.fn(),
  selectLimitMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: verifyMock, verifySessionForAction: verifyMock }))
vi.mock('@/lib/notifications', () => ({ notifyUser: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimitMock }),
      }),
    }),
  },
}))
vi.mock('@/lib/workflow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workflow')>()
  return { ...actual, canRoleActOnStep: vi.fn(() => true) }
})
vi.mock('@/lib/workflow-graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workflow-graph')>()
  return {
    ...actual,
    getStepById: getStepByIdMock,
    recordAdditionalRequirement: recordAdditionalRequirementMock,
    completeGraphStep: completeGraphStepMock,
    getStepAssigneeGate: vi.fn().mockResolvedValue(null),
  }
})

const { submitAdditionalRequirementAction } = await import('@/actions/workflow-graph')

const CONFIRMATION_CORRECTION_STEP = {
  id: 'step-cc',
  key: 'confirmation_correction',
  role: 'design',
  kind: 'yes_no_upload',
  additionalKinds: ['ack', 'readiness'],
  requiredPosition: null,
  receiverRequiredPosition: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ userId: 'user-1', role: 'design' })
  selectLimitMock.mockResolvedValue([{ position: null }])
  getStepByIdMock.mockResolvedValue(CONFIRMATION_CORRECTION_STEP)
  recordAdditionalRequirementMock.mockResolvedValue(undefined)
})

describe('submitAdditionalRequirementAction', () => {
  it('rejects a kind the step does not require at all', async () => {
    getStepByIdMock.mockResolvedValue({ ...CONFIRMATION_CORRECTION_STEP, additionalKinds: ['readiness'] })

    const res = await submitAdditionalRequirementAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-cc',
      kind: 'ack',
    })

    expect(res.ok).toBe(false)
    expect(recordAdditionalRequirementMock).not.toHaveBeenCalled()
  })

  it('rejects a kind that is the step\'s PRIMARY kind, not an additional one', async () => {
    getStepByIdMock.mockResolvedValue({ ...CONFIRMATION_CORRECTION_STEP, kind: 'ack', additionalKinds: [] })
    const res = await submitAdditionalRequirementAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-cc',
      kind: 'ack',
    })
    expect(res.ok).toBe(false)
    expect(recordAdditionalRequirementMock).not.toHaveBeenCalled()
  })

  it('records the requirement and reports completion when every other kind is already fulfilled', async () => {
    completeGraphStepMock.mockResolvedValue({ ok: true, actionable: [] })

    const res = await submitAdditionalRequirementAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-cc',
      kind: 'ack',
    })

    expect(recordAdditionalRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1', stepDefId: 'step-cc', kind: 'ack' }),
    )
    expect(completeGraphStepMock).toHaveBeenCalledOnce()
    expect(res.ok).toBe(true)
    expect(res.message).toMatch(/step completed/i)
  })

  it('records the requirement but reports it as pending when other kinds are still outstanding', async () => {
    completeGraphStepMock.mockRejectedValue(new Error('step-not-fulfilled'))

    const res = await submitAdditionalRequirementAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-cc',
      kind: 'readiness',
    })

    expect(recordAdditionalRequirementMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'readiness' }),
    )
    // The recording itself always succeeds even though the step as a whole isn't done yet.
    expect(res.ok).toBe(true)
    expect(res.message).toMatch(/still pending/i)
  })

  it('rejects when the step cannot be found', async () => {
    getStepByIdMock.mockResolvedValue(undefined)
    const res = await submitAdditionalRequirementAction(null, {
      projectId: 'proj-1',
      stepDefId: 'missing-step',
      kind: 'ack',
    })
    expect(res.ok).toBe(false)
    expect(recordAdditionalRequirementMock).not.toHaveBeenCalled()
  })
})
