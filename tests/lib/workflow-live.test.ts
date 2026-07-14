import { describe, it, expect } from 'vitest'
import { LIVE_WORKFLOW_STEPS } from '@/db/workflow-live-steps'

describe('LIVE_WORKFLOW_STEPS structure', () => {
  // quick task 260714-qe4 (workflow restructure batch 2): 22 -> 21 steps.
  it('has 21 steps numbered 1..21 in order (incl. Sign Off)', () => {
    expect(LIVE_WORKFLOW_STEPS).toHaveLength(21)
    LIVE_WORKFLOW_STEPS.forEach((s, i) => expect(s.n).toBe(i + 1))
  })

  it('does NOT contain the removed "Factory Floor Projects" step', () => {
    expect(LIVE_WORKFLOW_STEPS.some((s) => s.key === 'factory_floor')).toBe(false)
  })

  // quick task 260714-qe4: invoice_upload un-merges into Invoicing
  // (customer_care) + a new standalone set_delivery_timeline (operations);
  // ops_design_confirmation becomes the Assign Site PM step (super_admin);
  // confirmation moves right after it; installation_readiness is removed;
  // sorting+close_out merge into installation_process; sign_off is site_pm.
  it('orders the roles correctly: Customer Care → Design → Operations … → Sign Off', () => {
    const order = LIVE_WORKFLOW_STEPS.map((s) => [s.key, s.role])
    expect(order).toEqual([
      ['new_project', 'customer_care'],
      ['assign_designer_brief', 'design'],
      ['brief_taking', 'design'],
      ['invoice_upload', 'customer_care'],
      ['set_delivery_timeline', 'operations'],
      ['design_initiation', 'design'],
      ['kickoff_meeting', 'design'],
      ['design_stage', 'design'],
      ['ops_design_confirmation', 'super_admin'],
      ['confirmation', 'site_pm'],
      ['confirmation_correction', 'design'],
      ['internal_approval', 'operations'],
      ['send_for_production', 'operations'],
      ['project_review_authorisation', 'operations'],
      ['production_process', 'factory_operations'],
      ['factory_manager_readiness', 'factory_manager'],
      ['materials_readiness', 'factory_pm'],
      ['delivery_project_check', 'factory_pm'],
      ['approval_installation', 'operations'],
      ['installation_process', 'site_pm'],
      ['sign_off', 'site_pm'],
    ])
  })

  it('final step is a site_pm Sign-Off yes_no_upload step (quick task 260714-qe4)', () => {
    const last = LIVE_WORKFLOW_STEPS[LIVE_WORKFLOW_STEPS.length - 1]
    expect(last).toMatchObject({ n: 21, key: 'sign_off', role: 'site_pm', kind: 'yes_no_upload' })
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
