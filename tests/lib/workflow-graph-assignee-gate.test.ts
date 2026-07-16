import { describe, it, expect, vi } from 'vitest'

// lib/workflow-graph.ts starts with `import 'server-only'` and transitively
// imports `@/db` (which connects to Neon at module load time) — both are
// mocked here purely so the module can be imported; assigneeGoverningStepKey
// itself is pure and never touches either. The DB-touching getStepAssigneeGate
// is exercised by scripts/verify-assignee-gate.ts against the real live DB,
// not here.
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))

const { assigneeGoverningStepKey, assigneeGatedRoles } = await import('@/lib/workflow-graph')
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
