import { describe, it, expect } from 'vitest'
import { LIVE_WORKFLOW_STEPS } from '@/db/workflow-live-steps'

describe('LIVE_WORKFLOW_STEPS structure', () => {
  it('has 23 steps numbered 1..23 in order (incl. Sign Off)', () => {
    expect(LIVE_WORKFLOW_STEPS).toHaveLength(23)
    LIVE_WORKFLOW_STEPS.forEach((s, i) => expect(s.n).toBe(i + 1))
  })

  it('does NOT contain the removed "Factory Floor Projects" step', () => {
    expect(LIVE_WORKFLOW_STEPS.some((s) => s.key === 'factory_floor')).toBe(false)
  })

  it('orders the roles correctly: Customer Care → Design → Operations … → Sign Off', () => {
    const order = LIVE_WORKFLOW_STEPS.map((s) => [s.key, s.role])
    expect(order).toEqual([
      ['new_project', 'customer_care'],
      ['assign_designer_brief', 'design'],
      ['brief_taking', 'design'],
      ['invoice_upload', 'customer_care'],
      ['invoice_timeline', 'operations'],
      ['design_initiation', 'design'],
      ['kickoff_meeting', 'design'],
      ['design_stage', 'design'],
      ['ops_design_confirmation', 'operations'],
      ['confirmation_correction', 'design'],
      ['internal_approval', 'operations'],
      ['send_for_production', 'operations'],
      ['project_review_authorisation', 'operations'],
      ['production_process', 'factory_operations'],
      ['confirmation', 'site_pm'],
      ['factory_manager_readiness', 'factory_manager'],
      ['materials_readiness', 'factory_pm'],
      ['delivery_project_check', 'factory_pm'],
      ['approval_installation', 'operations'],
      ['installation_readiness', 'site_pm'],
      ['sorting', 'site_pm'],
      ['close_out', 'site_pm'],
      ['sign_off', 'super_admin'],
    ])
  })

  it('final step is a super_admin Sign-Off ack step (REQ-G04)', () => {
    const last = LIVE_WORKFLOW_STEPS[LIVE_WORKFLOW_STEPS.length - 1]
    expect(last).toMatchObject({ n: 23, key: 'sign_off', role: 'super_admin', kind: 'ack' })
  })

  it("the Factory PM's first step is Materials / Accessories Readiness", () => {
    const firstFactory = LIVE_WORKFLOW_STEPS.find((s) => s.role === 'factory_pm')
    expect(firstFactory?.key).toBe('materials_readiness')
    expect(firstFactory?.kind).toBe('readiness')
  })

  it('materials_readiness (v2.0 Phase 22e) carries the delivery checklist slug for its site_pm dualRole', () => {
    const materialsReadiness = LIVE_WORKFLOW_STEPS.find((s) => s.key === 'materials_readiness')
    expect(materialsReadiness?.slug).toBe('delivery_site_readiness')
  })

  it('production role owns no workflow steps (factory_operations/factory_manager are separate roles)', () => {
    expect(LIVE_WORKFLOW_STEPS.some((s) => s.role === ('production' as never))).toBe(false)
  })
})
