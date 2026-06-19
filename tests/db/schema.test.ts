import { describe, it, expect } from 'vitest'
import * as schema from '@/db/schema'

describe('Drizzle schema exports (CHK-01)', () => {
  it('schema exports checklistDefinitions table', () => {
    expect(schema.checklistDefinitions).toBeDefined()
  })

  it('schema exports checklistTemplateItems table', () => {
    expect(schema.checklistTemplateItems).toBeDefined()
  })

  it('schema exports users table', () => {
    expect(schema.users).toBeDefined()
  })

  it.todo('CHK-01: checklists are template-driven, no hardcoded line items')
})
