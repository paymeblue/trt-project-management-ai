import { describe, it, expect, vi } from 'vitest'

// lib/workflow-graph.ts starts with `import 'server-only'` and transitively
// imports `@/db` (which connects to Neon at module load time) — both are
// mocked here purely so the module can be imported; assigneeGoverningStepKey
// itself is pure and never touches either. The DB-touching getStepAssigneeGate
// is exercised by scripts/verify-assignee-gate.ts against the real live DB,
// not here.
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))

const { assigneeGoverningStepKey } = await import('@/lib/workflow-graph')
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
