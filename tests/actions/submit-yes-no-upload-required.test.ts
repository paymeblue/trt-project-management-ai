import { describe, it, expect, beforeEach, vi } from 'vitest'

// Focused coverage for the sign_off mandatory-upload gate added to
// submitYesNoUploadAction (item #16: "sign off upload should not be
// optional"). Mocks the same dependency surface authorizeStep touches
// (verifySession, canRoleActOnStep, the assignee-gate/position lookups) so
// the action reaches the new upload-required check under realistic
// conditions, without hitting a real DB.

const { verifyMock, getStepByIdMock, submitYesNoUploadMock, selectLimitMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  getStepByIdMock: vi.fn(),
  submitYesNoUploadMock: vi.fn(),
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
    submitYesNoUpload: submitYesNoUploadMock,
    getStepAssigneeGate: vi.fn().mockResolvedValue(null),
  }
})

const { submitYesNoUploadAction } = await import('@/actions/workflow-graph')

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ userId: 'user-1', role: 'site_pm' })
  selectLimitMock.mockResolvedValue([{ position: null }])
  submitYesNoUploadMock.mockResolvedValue(undefined)
})

describe('submitYesNoUploadAction — mandatory upload on sign_off', () => {
  it('rejects sign_off submission with no uploadData', async () => {
    getStepByIdMock.mockResolvedValue({
      id: 'step-sign-off',
      key: 'sign_off',
      role: 'site_pm',
      requiredPosition: null,
      receiverRequiredPosition: null,
    })

    const res = await submitYesNoUploadAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-sign-off',
      answer: 'yes',
      uploadData: null,
      uploadName: null,
    })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/attach a photo or pdf/i)
    expect(submitYesNoUploadMock).not.toHaveBeenCalled()
  })

  it('allows sign_off submission when uploadData is present', async () => {
    getStepByIdMock.mockResolvedValue({
      id: 'step-sign-off',
      key: 'sign_off',
      role: 'site_pm',
      requiredPosition: null,
      receiverRequiredPosition: null,
    })

    const res = await submitYesNoUploadAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-sign-off',
      answer: 'yes',
      uploadData: 'data:image/png;base64,abc',
      uploadName: 'evidence.png',
    })

    expect(res.ok).toBe(true)
    expect(submitYesNoUploadMock).toHaveBeenCalledOnce()
  })

  it('does not require an upload for other yes_no_upload steps (e.g. brief_taking)', async () => {
    getStepByIdMock.mockResolvedValue({
      id: 'step-brief',
      key: 'brief_taking',
      role: 'design',
      requiredPosition: null,
      receiverRequiredPosition: null,
    })
    verifyMock.mockResolvedValue({ userId: 'user-1', role: 'design' })

    const res = await submitYesNoUploadAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-brief',
      answer: 'no',
      uploadData: null,
      uploadName: null,
    })

    expect(res.ok).toBe(true)
    expect(submitYesNoUploadMock).toHaveBeenCalledOnce()
  })
})

describe('submitYesNoUploadAction — upload size cap (item #2, 5MB)', () => {
  it('rejects uploadData over the 5MB-equivalent data-URL length', async () => {
    getStepByIdMock.mockResolvedValue({
      id: 'step-brief',
      key: 'brief_taking',
      role: 'design',
      requiredPosition: null,
      receiverRequiredPosition: null,
    })
    verifyMock.mockResolvedValue({ userId: 'user-1', role: 'design' })

    const res = await submitYesNoUploadAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-brief',
      answer: 'yes',
      uploadData: 'data:application/pdf;base64,' + 'A'.repeat(7_000_001),
      uploadName: 'big.pdf',
    })

    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/too large/i)
    expect(submitYesNoUploadMock).not.toHaveBeenCalled()
  })

  it('allows uploadData at or under the size cap', async () => {
    getStepByIdMock.mockResolvedValue({
      id: 'step-brief',
      key: 'brief_taking',
      role: 'design',
      requiredPosition: null,
      receiverRequiredPosition: null,
    })
    verifyMock.mockResolvedValue({ userId: 'user-1', role: 'design' })

    const res = await submitYesNoUploadAction(null, {
      projectId: 'proj-1',
      stepDefId: 'step-brief',
      answer: 'yes',
      uploadData: 'data:application/pdf;base64,' + 'A'.repeat(100),
      uploadName: 'small.pdf',
    })

    expect(res.ok).toBe(true)
    expect(submitYesNoUploadMock).toHaveBeenCalledOnce()
  })
})
