import { describe, it, expect } from 'vitest'
import {
  WORKFLOW_STEPS,
  FIRST_ACTION_STEP,
  LAST_STEP,
  REQUIRED_PHOTOS,
  Roles,
  stepByN,
  isProjectComplete,
  isAdminRole,
  canEditChecklist,
  canRoleActOnStep,
  stepHref,
  workflowRoleLabel,
  userRoleLabel,
  roleDashboard,
} from '@/lib/workflow'

describe('workflow definition', () => {
  it('has 11 steps numbered 1..11 in order (incl. Sign Off)', () => {
    expect(WORKFLOW_STEPS).toHaveLength(11)
    WORKFLOW_STEPS.forEach((s, i) => expect(s.n).toBe(i + 1))
    expect(LAST_STEP).toBe(11)
    expect(FIRST_ACTION_STEP).toBe(2)
  })

  it('does NOT contain the removed "Factory Floor Projects" step', () => {
    expect(WORKFLOW_STEPS.some((s) => s.key === 'factory_floor')).toBe(false)
  })

  it('orders the roles correctly: Operations → Site PM → Factory PM … → Sign Off', () => {
    const order = WORKFLOW_STEPS.map((s) => [s.key, s.role])
    expect(order).toEqual([
      ['new_project', 'operations'],
      ['confirmation', 'site_pm'],
      ['materials_readiness', 'factory_pm'],
      ['delivery_readiness', 'site_pm'],
      ['delivery_project', 'factory_pm'],
      ['project_check_report', 'factory_pm'],
      ['approval_installation', 'operations'],
      ['installation_readiness', 'site_pm'],
      ['sorting', 'site_pm'],
      ['close_out', 'site_pm'],
      ['sign_off', 'super_admin'],
    ])
  })

  it('final step is a super_admin Sign-Off ack step (REQ-G04)', () => {
    const last = WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1]
    expect(last).toMatchObject({ n: 11, key: 'sign_off', role: 'super_admin', kind: 'ack' })
  })

  it("the Factory PM's first step is Materials / Accessories Readiness", () => {
    const firstFactory = WORKFLOW_STEPS.find((s) => s.role === 'factory_pm')
    expect(firstFactory?.key).toBe('materials_readiness')
    expect(firstFactory?.kind).toBe('readiness')
  })
})

describe('stepByN / isProjectComplete', () => {
  it('resolves steps and rejects out-of-range', () => {
    expect(stepByN(2)?.key).toBe('confirmation')
    expect(stepByN(99)).toBeUndefined()
  })

  it('is complete only once currentStep passes the last step', () => {
    expect(isProjectComplete(LAST_STEP)).toBe(false)
    expect(isProjectComplete(LAST_STEP + 1)).toBe(true)
    expect(isProjectComplete(2)).toBe(false)
  })
})

describe('role gating', () => {
  it('isAdminRole covers super_admin and operations only', () => {
    expect(isAdminRole(Roles.SuperAdmin)).toBe(true)
    expect(isAdminRole(Roles.Operations)).toBe(true)
    expect(isAdminRole(Roles.SitePm)).toBe(false)
    expect(isAdminRole(Roles.FactoryPm)).toBe(false)
  })

  it('operations steps are actionable by operations and super_admin', () => {
    expect(canRoleActOnStep('operations', Roles.Operations)).toBe(true)
    expect(canRoleActOnStep('operations', Roles.SuperAdmin)).toBe(true)
    expect(canRoleActOnStep('operations', Roles.SitePm)).toBe(false)
  })

  it('PM steps are actionable only by the matching PM role', () => {
    expect(canRoleActOnStep('site_pm', Roles.SitePm)).toBe(true)
    expect(canRoleActOnStep('site_pm', Roles.FactoryPm)).toBe(false)
    expect(canRoleActOnStep('factory_pm', Roles.FactoryPm)).toBe(true)
    expect(canRoleActOnStep('factory_pm', Roles.SitePm)).toBe(false)
    // admins do not auto-own PM steps
    expect(canRoleActOnStep('site_pm', Roles.SuperAdmin)).toBe(false)
  })
})

describe('stepHref', () => {
  it('builds checklist links with project + step query', () => {
    const confirmation = stepByN(2)!
    expect(stepHref(confirmation, 'p1')).toBe('/checklists/confirmation?projectId=p1&step=2')
  })

  it('builds the readiness link for the materials step', () => {
    const readiness = stepByN(3)!
    expect(stepHref(readiness, 'p1')).toBe('/factory-pm/readiness?projectId=p1&step=3')
  })

  it('returns null for the creation step (no destination)', () => {
    const newProject = stepByN(1)!
    expect(stepHref(newProject, 'p1')).toBeNull()
  })
})

describe('misc helpers', () => {
  it('REQUIRED_PHOTOS no longer requires photos on the delivery checklist', () => {
    expect(REQUIRED_PHOTOS.delivery_project ?? 0).toBe(0)
  })

  it('workflowRoleLabel maps roles to labels', () => {
    expect(workflowRoleLabel('operations')).toBe('Operations')
    expect(workflowRoleLabel('site_pm')).toBe('Site PM')
    expect(workflowRoleLabel('factory_pm')).toBe('Factory PM')
    expect(workflowRoleLabel('super_admin')).toBe('Super Admin')
  })
})

describe('v1.1 governance (REQ-G01, G04, G07)', () => {
  it('canEditChecklist allows super_admin and operations, not PM roles', () => {
    expect(canEditChecklist(Roles.SuperAdmin)).toBe(true)
    expect(canEditChecklist(Roles.Operations)).toBe(true)
    expect(canEditChecklist(Roles.FactoryPm)).toBe(false)
    expect(canEditChecklist(Roles.SitePm)).toBe(false)
  })

  it('Sign-Off (step 11) is actionable only by super_admin', () => {
    expect(canRoleActOnStep('super_admin', Roles.SuperAdmin)).toBe(true)
    expect(canRoleActOnStep('super_admin', Roles.Operations)).toBe(false)
    expect(canRoleActOnStep('super_admin', Roles.FactoryPm)).toBe(false)
  })

  it('completion boundary is past Sign-Off: step 11 pending, 12 complete', () => {
    expect(isProjectComplete(10)).toBe(false) // Close Out done, awaiting Sign Off
    expect(isProjectComplete(11)).toBe(false) // at Sign Off
    expect(isProjectComplete(12)).toBe(true) // signed off → delivered
  })
})

describe('#7 multi-department extensibility', () => {
  it('recognises design + production as roles', () => {
    expect(Roles.Design).toBe('design')
    expect(Roles.Production).toBe('production')
  })

  it('userRoleLabel covers every role with a safe fallback', () => {
    expect(userRoleLabel('factory_pm')).toBe('Factory PM')
    expect(userRoleLabel('site_pm')).toBe('Site PM')
    expect(userRoleLabel('super_admin')).toBe('Super Admin')
    expect(userRoleLabel('operations')).toBe('Operations')
    expect(userRoleLabel('design')).toBe('Design')
    expect(userRoleLabel('production')).toBe('Production')
    expect(userRoleLabel('something_new')).toBe('User')
  })

  it('roleDashboard routes every role to its home', () => {
    expect(roleDashboard('factory_pm')).toBe('/factory-pm/dashboard')
    expect(roleDashboard('site_pm')).toBe('/site-pm/dashboard')
    expect(roleDashboard('super_admin')).toBe('/admin/dashboard')
    expect(roleDashboard('operations')).toBe('/admin/dashboard')
    expect(roleDashboard('design')).toBe('/design/dashboard')
    expect(roleDashboard('production')).toBe('/production/dashboard')
    expect(roleDashboard('unknown')).toBe('/dashboard')
  })

  it('new departments own no workflow steps yet (added additively later)', () => {
    expect(WORKFLOW_STEPS.some((s) => s.role === ('design' as never))).toBe(false)
    expect(WORKFLOW_STEPS.some((s) => s.role === ('production' as never))).toBe(false)
  })
})
