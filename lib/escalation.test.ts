import { describe, it, expect } from 'vitest'
import { escalationTargetPosition } from '@/lib/escalation'
import { Roles } from '@/lib/workflow'

describe('escalationTargetPosition (items #9, #14)', () => {
  it('routes factory_pm to Chief Production Officer', () => {
    expect(escalationTargetPosition(Roles.FactoryPm)).toBe('chief_production_officer')
  })

  it('routes factory_manager to Chief Production Officer', () => {
    expect(escalationTargetPosition(Roles.FactoryManager)).toBe('chief_production_officer')
  })

  it('routes factory_operations (step 15) to Chief Production Officer', () => {
    expect(escalationTargetPosition(Roles.FactoryOperations)).toBe('chief_production_officer')
  })

  it('routes site_pm to Head of Projects', () => {
    expect(escalationTargetPosition(Roles.SitePm)).toBe('head_of_projects')
  })

  it('routes design to Head of Design', () => {
    expect(escalationTargetPosition(Roles.Design)).toBe('head_of_design')
  })

  it('routes architect to Head of Design', () => {
    expect(escalationTargetPosition(Roles.Architect)).toBe('head_of_design')
  })

  it('routes customer_care to Operations Admin', () => {
    expect(escalationTargetPosition(Roles.CustomerCare)).toBe('operations_manager_admin')
  })

  it('returns null for roles with no configured escalation target', () => {
    expect(escalationTargetPosition(Roles.SuperAdmin)).toBeNull()
    expect(escalationTargetPosition(Roles.Operations)).toBeNull()
    expect(escalationTargetPosition(Roles.Production)).toBeNull()
  })
})
