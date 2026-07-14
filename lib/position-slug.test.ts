import { describe, it, expect } from 'vitest'
import { slugifyPosition } from './position-slug'

describe('slugifyPosition', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(slugifyPosition('Operations admin head')).toBe('operations_admin_head')
    expect(slugifyPosition('Head of Operations')).toBe('head_of_operations')
  })

  it('trims, collapses whitespace + non-alphanumeric runs to a single underscore, strips leading/trailing underscores', () => {
    expect(slugifyPosition('  Head  of   Design!! ')).toBe('head_of_design')
  })

  it('collapses runs of mixed separators into one underscore', () => {
    expect(slugifyPosition('R&D / QA')).toBe('r_d_qa')
  })

  it('is stable / idempotent on an already-slug value', () => {
    expect(slugifyPosition('head_designer')).toBe('head_designer')
    expect(slugifyPosition(slugifyPosition('head_designer'))).toBe(slugifyPosition('head_designer'))
  })

  it('is idempotent in general: slugifyPosition(x) === slugifyPosition(slugifyPosition(x))', () => {
    for (const x of ['Operations admin head', '  Head  of   Design!! ', 'R&D / QA', 'cafe!']) {
      expect(slugifyPosition(slugifyPosition(x))).toBe(slugifyPosition(x))
    }
  })

  it('keeps only ASCII [a-z0-9], other characters become separators', () => {
    expect(slugifyPosition('cafe!')).toBe('cafe')
  })
})
