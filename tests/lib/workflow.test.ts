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
  canRoleActOnStep,
  stepHref,
  workflowRoleLabel,
} from '@/lib/workflow'

describe('workflow definition', () => {
  it('has 10 steps numbered 1..10 in order', () => {
    expect(WORKFLOW_STEPS).toHaveLength(10)
    WORKFLOW_STEPS.forEach((s, i) => expect(s.n).toBe(i + 1))
    expect(LAST_STEP).toBe(10)
    expect(FIRST_ACTION_STEP).toBe(2)
  })

  it('does NOT contain the removed "Factory Floor Projects" step', () => {
    expect(WORKFLOW_STEPS.some((s) => s.key === 'factory_floor')).toBe(false)
  })

  it('orders the roles correctly: Operations → Site PM → Factory PM …', () => {
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
    ])
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
  })
})
