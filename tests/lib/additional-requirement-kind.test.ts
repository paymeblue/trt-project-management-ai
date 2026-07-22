import { describe, it, expect } from 'vitest'
import { additionalRequirementKindFor, stepRequiredKinds, type StepKind } from '@/lib/workflow'

// quick task readiness-ack-sync: additionalRequirementKindFor picks which
// fulfilled-kind name a linked checklist submission should record when the
// checklist is only ONE of several requirements on a step (actions/
// checklists.ts's partial-fulfillment branch) — 'readiness' whenever it's
// present (primary or additional), 'checklist' otherwise.
describe('additionalRequirementKindFor', () => {
  it('prefers readiness when it is the additional kind alongside a different primary kind', () => {
    const step = { kind: 'yes_no_upload' as const, additionalKinds: ['ack', 'readiness'] as StepKind[] }
    expect(additionalRequirementKindFor(step)).toBe('readiness')
  })

  it('prefers readiness when it is the primary kind (with other additional kinds)', () => {
    const step = { kind: 'readiness' as const, additionalKinds: ['ack'] as StepKind[] }
    expect(additionalRequirementKindFor(step)).toBe('readiness')
  })

  it('falls back to checklist when readiness is not involved', () => {
    const step = { kind: 'yes_no_upload' as const, additionalKinds: ['checklist'] as StepKind[] }
    expect(additionalRequirementKindFor(step)).toBe('checklist')
  })

  it('falls back to checklist when there are no additional kinds at all', () => {
    const step = { kind: 'checklist' as const, additionalKinds: null }
    expect(additionalRequirementKindFor(step)).toBe('checklist')
  })
})

// Regression guard for the confirmation_correction misconfiguration this
// fix addresses: a yes_no_upload step with ack+readiness stacked on top must
// report all 3 as required (previously only yes_no_upload was ever actually
// gated — see STATE_GATED_KINDS in lib/workflow-graph.ts).
describe('stepRequiredKinds — multi-kind steps', () => {
  it('includes additional ack/readiness kinds alongside the primary kind', () => {
    const step = { kind: 'yes_no_upload' as const, additionalKinds: ['ack', 'readiness'] as StepKind[] }
    expect(stepRequiredKinds(step)).toEqual(['yes_no_upload', 'ack', 'readiness'])
  })
})
