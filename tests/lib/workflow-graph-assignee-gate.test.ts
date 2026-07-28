import { describe, it, expect, vi, beforeEach } from 'vitest'

// lib/workflow-graph.ts starts with `import 'server-only'` and transitively
// imports `@/db` (which connects to Neon at module load time) — both are
// mocked here purely so the module can be imported; assigneeGoverningStepKey
// itself is pure and never touches either. The DB-touching getStepAssigneeGate
// is exercised by scripts/verify-assignee-gate.ts against the real live DB,
// not here.
//
// Quick task 260728-cfn: replaced the flat `{}` db stub with a chainable mock
// (same shape as tests/actions/workflow.test.ts) so stepAssigneeMismatch's
// two sequential single-row reads (getStepByKey, then the workflow_step_states
// row) can be exercised, including the zero-queries fast path assertion.
const { selectLimitMock } = vi.hoisted(() => ({ selectLimitMock: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: selectLimitMock }),
      }),
    }),
  },
}))

const { assigneeGoverningStepKey, assigneeGatedRoles, stepAssigneeMismatch } =
  await import('@/lib/workflow-graph')
describe('assigneeGoverningStepKey (quick task 260713-ekr)', () => {
  it('maps brief_taking to assign_designer_brief', () => {
    expect(assigneeGoverningStepKey('brief_taking')).toBe('assign_designer_brief')
  })

  it('maps kickoff_meeting to design_initiation', () => {
    expect(assigneeGoverningStepKey('kickoff_meeting')).toBe('design_initiation')
  })

  it('maps design_stage to design_initiation', () => {
    expect(assigneeGoverningStepKey('design_stage')).toBe('design_initiation')
  })

  it('returns null for assign_designer_brief itself (the assignment step is not gated)', () => {
    expect(assigneeGoverningStepKey('assign_designer_brief')).toBeNull()
  })

  it('returns null for design_initiation itself (the assignment step is not gated)', () => {
    expect(assigneeGoverningStepKey('design_initiation')).toBeNull()
  })

  it('returns null for an unrelated step key', () => {
    expect(assigneeGoverningStepKey('invoice_upload')).toBeNull()
  })
})

describe('assigneeGoverningStepKey (quick task 260716-h0i — site_pm gating)', () => {
  it('maps confirmation to ops_design_confirmation', () => {
    expect(assigneeGoverningStepKey('confirmation')).toBe('ops_design_confirmation')
  })

  it('maps materials_readiness to ops_design_confirmation', () => {
    expect(assigneeGoverningStepKey('materials_readiness')).toBe('ops_design_confirmation')
  })

  it('maps installation_process to ops_design_confirmation', () => {
    expect(assigneeGoverningStepKey('installation_process')).toBe('ops_design_confirmation')
  })

  it('maps sign_off to ops_design_confirmation', () => {
    expect(assigneeGoverningStepKey('sign_off')).toBe('ops_design_confirmation')
  })

  it('returns null for ops_design_confirmation itself (the assignment step is not gated)', () => {
    expect(assigneeGoverningStepKey('ops_design_confirmation')).toBeNull()
  })
})

describe('assigneeGatedRoles (quick task 260716-h0i)', () => {
  it('returns [site_pm] for confirmation', () => {
    expect(assigneeGatedRoles('confirmation')).toEqual(['site_pm'])
  })

  it('returns [site_pm] for materials_readiness (the dual-role step — gate applies only to the site_pm party)', () => {
    expect(assigneeGatedRoles('materials_readiness')).toEqual(['site_pm'])
  })

  it('returns [design, architect] for brief_taking (Architects may also act on design-role steps)', () => {
    expect(assigneeGatedRoles('brief_taking')).toEqual(['design', 'architect'])
  })

  it('returns [] for an unrelated step key', () => {
    expect(assigneeGatedRoles('invoice_upload')).toEqual([])
  })
})

describe('stepAssigneeMismatch (quick task 260728-cfn)', () => {
  beforeEach(() => {
    selectLimitMock.mockReset()
  })

  it('returns true when the gate is held by a DIFFERENT user (gated role)', async () => {
    // First read: getStepByKey resolves the governing step's row (only `id`
    // matters downstream). Second read: the workflow_step_states row holding
    // the recorded assignee.
    selectLimitMock.mockResolvedValueOnce([{ id: 'stepdef-gov' }])
    selectLimitMock.mockResolvedValueOnce([{ assignedUserId: 's1' }])

    const mismatch = await stepAssigneeMismatch(
      's2',
      'p1',
      { key: 'materials_readiness' },
      'site_pm',
    )

    expect(mismatch).toBe(true)
  })

  it('returns false when the gate is held by the caller (gated role)', async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 'stepdef-gov' }])
    selectLimitMock.mockResolvedValueOnce([{ assignedUserId: 's1' }])

    const mismatch = await stepAssigneeMismatch(
      's1',
      'p1',
      { key: 'materials_readiness' },
      'site_pm',
    )

    expect(mismatch).toBe(false)
  })

  it('returns false when no assignment has been recorded yet (gate resolves null)', async () => {
    selectLimitMock.mockResolvedValueOnce([{ id: 'stepdef-gov' }])
    selectLimitMock.mockResolvedValueOnce([]) // no workflow_step_states row yet

    const mismatch = await stepAssigneeMismatch(
      's1',
      'p1',
      { key: 'materials_readiness' },
      'site_pm',
    )

    expect(mismatch).toBe(false)
  })

  it('returns false and issues ZERO db queries when role is not in assigneeGatedRoles(step.key) (factory_pm on the dual-role materials_readiness step)', async () => {
    const mismatch = await stepAssigneeMismatch(
      'f1',
      'p1',
      { key: 'materials_readiness' },
      'factory_pm',
    )

    expect(mismatch).toBe(false)
    expect(selectLimitMock).not.toHaveBeenCalled()
  })
})
