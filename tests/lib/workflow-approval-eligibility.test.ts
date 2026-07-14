import { describe, it, expect, vi } from 'vitest'

// lib/workflow-graph.ts starts with `import 'server-only'` and transitively
// imports `@/db` (which connects to Neon at module load time) — both are
// mocked here purely so the module can be imported; the helpers under test
// are pure and never touch either. Mirrors
// tests/lib/workflow-graph-assignee-gate.test.ts's pattern.
vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))

const { approvalSenderEligible, approvalReceiverEligible, pickApprovalDrawing } = await import(
  '@/lib/workflow-graph'
)

// send_for_production shape: role='operations', requiredPosition=null,
// receiverRequiredPosition='chief_production_officer', receiverRole=null —
// the exact step that deadlocked in the live incident this quick task fixes.
const sendForProductionStep = {
  role: 'operations' as const,
  requiredPosition: null,
  receiverRequiredPosition: 'chief_production_officer',
  receiverRole: null,
}

describe('approvalSenderEligible / approvalReceiverEligible (quick task 260714-iuj deadlock guard)', () => {
  it('CPO viewer (super_admin role, chief_production_officer position): senderEligible=false, receiverEligible=true', () => {
    expect(approvalSenderEligible(sendForProductionStep, 'super_admin', 'chief_production_officer')).toBe(false)
    expect(approvalReceiverEligible(sendForProductionStep, 'super_admin', 'chief_production_officer')).toBe(true)
  })

  it('CPO viewer (operations role, chief_production_officer position): senderEligible=false, receiverEligible=true', () => {
    expect(approvalSenderEligible(sendForProductionStep, 'operations', 'chief_production_officer')).toBe(false)
    expect(approvalReceiverEligible(sendForProductionStep, 'operations', 'chief_production_officer')).toBe(true)
  })

  it('Ops admin viewer (operations role, Operations manager admin position): senderEligible=true, receiverEligible=false', () => {
    expect(approvalSenderEligible(sendForProductionStep, 'operations', 'Operations manager admin')).toBe(true)
    expect(approvalReceiverEligible(sendForProductionStep, 'operations', 'Operations manager admin')).toBe(false)
  })

  it('a viewer with neither role never gets sender or receiver eligibility', () => {
    expect(approvalSenderEligible(sendForProductionStep, 'site_pm', 'chief_production_officer')).toBe(false)
    expect(approvalReceiverEligible(sendForProductionStep, 'site_pm', 'chief_production_officer')).toBe(false)
  })
})

describe('pickApprovalDrawing (drawing-fallback chain)', () => {
  it('prefers internal_approval when present', () => {
    const rows = [
      { stepKey: 'design_stage', uploadData: 'data:image/png;base64,AAA', uploadName: 'design.png' },
      { stepKey: 'confirmation_correction', uploadData: 'data:image/png;base64,BBB', uploadName: 'correction.png' },
      { stepKey: 'internal_approval', uploadData: 'data:image/png;base64,CCC', uploadName: 'internal.png' },
    ]
    expect(pickApprovalDrawing(rows)).toEqual({ uploadData: 'data:image/png;base64,CCC', uploadName: 'internal.png' })
  })

  it('falls back to confirmation_correction when internal_approval has no upload', () => {
    const rows = [
      { stepKey: 'design_stage', uploadData: 'data:image/png;base64,AAA', uploadName: 'design.png' },
      { stepKey: 'confirmation_correction', uploadData: 'data:image/png;base64,BBB', uploadName: 'correction.png' },
      { stepKey: 'internal_approval', uploadData: null, uploadName: null },
    ]
    expect(pickApprovalDrawing(rows)).toEqual({ uploadData: 'data:image/png;base64,BBB', uploadName: 'correction.png' })
  })

  it('falls back to design_stage when only it has an upload', () => {
    const rows = [
      { stepKey: 'design_stage', uploadData: 'data:image/png;base64,AAA', uploadName: 'design.png' },
      { stepKey: 'confirmation_correction', uploadData: null, uploadName: null },
      { stepKey: 'internal_approval', uploadData: null, uploadName: null },
    ]
    expect(pickApprovalDrawing(rows)).toEqual({ uploadData: 'data:image/png;base64,AAA', uploadName: 'design.png' })
  })

  it('returns null when all uploadData are null', () => {
    const rows = [
      { stepKey: 'design_stage', uploadData: null, uploadName: null },
      { stepKey: 'confirmation_correction', uploadData: null, uploadName: null },
      { stepKey: 'internal_approval', uploadData: null, uploadName: null },
    ]
    expect(pickApprovalDrawing(rows)).toBeNull()
  })

  it('returns null when rows are missing entirely', () => {
    expect(pickApprovalDrawing([])).toBeNull()
  })
})
