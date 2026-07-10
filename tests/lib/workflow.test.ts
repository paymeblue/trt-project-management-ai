import { describe, it, expect } from 'vitest'
import {
  FIRST_ACTION_STEP,
  REQUIRED_PHOTOS,
  Roles,
  findStep,
  lastStepN,
  projectComplete,
  isAdminRole,
  canEditChecklist,
  canRoleActOnStep,
  stepHref,
  workflowRoleLabel,
  userRoleLabel,
  roleDashboard,
} from '@/lib/workflow'
import { LIVE_WORKFLOW_STEPS } from '@/db/workflow-live-steps'

describe('findStep / lastStepN / projectComplete', () => {
  it('resolves steps and rejects out-of-range', () => {
    expect(findStep(LIVE_WORKFLOW_STEPS, 2)?.key).toBe('payment_confirmation')
    expect(findStep(LIVE_WORKFLOW_STEPS, 99)).toBeUndefined()
  })

  it('FIRST_ACTION_STEP is 2 (Payment Confirmation & Timeline)', () => {
    expect(FIRST_ACTION_STEP).toBe(2)
  })

  it('lastStepN resolves the last step number', () => {
    expect(lastStepN(LIVE_WORKFLOW_STEPS)).toBe(26)
  })

  it('is complete only once currentStep passes the last step', () => {
    const lastN = lastStepN(LIVE_WORKFLOW_STEPS)
    expect(projectComplete(lastN, lastN)).toBe(false)
    expect(projectComplete(lastN + 1, lastN)).toBe(true)
    expect(projectComplete(2, lastN)).toBe(false)
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
    const confirmation = LIVE_WORKFLOW_STEPS.find((s) => s.key === 'confirmation')!
    expect(stepHref(confirmation, 'p1')).toBe(`/checklists/confirmation?projectId=p1&step=${confirmation.n}`)
  })

  it('builds the readiness link for the materials step', () => {
    const readiness = LIVE_WORKFLOW_STEPS.find((s) => s.key === 'materials_readiness')!
    expect(stepHref(readiness, 'p1')).toBe(`/factory-pm/readiness?projectId=p1&step=${readiness.n}`)
  })

  it('returns null for the creation step (no destination)', () => {
    const newProject = findStep(LIVE_WORKFLOW_STEPS, 1)!
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

  it('completion boundary is past Sign-Off: last step pending, last+1 complete', () => {
    const lastN = lastStepN(LIVE_WORKFLOW_STEPS)
    expect(projectComplete(lastN - 1, lastN)).toBe(false) // Close Out done, awaiting Sign Off
    expect(projectComplete(lastN, lastN)).toBe(false) // at Sign Off
    expect(projectComplete(lastN + 1, lastN)).toBe(true) // signed off → delivered
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
})
