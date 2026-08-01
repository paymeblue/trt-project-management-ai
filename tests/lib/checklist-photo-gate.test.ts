import { describe, it, expect } from 'vitest'
import {
  missingConditionalPhotos,
  missingRequiredAnswers,
  isOptionalFmReadinessItem,
  FM_READINESS_SLUG,
} from '@/lib/workflow'

const material = { id: 'material', label: 'Material control readiness form attached' }
const accessories = { id: 'accessories', label: 'Accessories readiness form attached' }
const upholstery = { id: 'upholstery', label: 'Upholstery readiness form attached' }
const items = [material, accessories, upholstery]

describe('missingConditionalPhotos', () => {
  it('Test 1: other slugs return [] regardless of answers/photos', () => {
    const answers = { material: { value: 'yes' } }
    const photosByItem = {}
    expect(missingConditionalPhotos('production_process', items, answers, photosByItem)).toEqual(
      [],
    )
    expect(missingConditionalPhotos('delivery_project', items, answers, photosByItem)).toEqual([])
  })

  it('Test 2: yes-answered item with 0 photos is returned', () => {
    const answers = { material: { value: 'yes' } }
    const photosByItem = {}
    expect(missingConditionalPhotos(FM_READINESS_SLUG, items, answers, photosByItem)).toEqual([
      'material',
    ])
  })

  it('Test 3: yes-answered item with >=1 photo is not returned', () => {
    const answers = { material: { value: 'yes' } }
    const photosByItem = { material: ['data:image/png;base64,abc'] }
    expect(missingConditionalPhotos(FM_READINESS_SLUG, items, answers, photosByItem)).toEqual([])
  })

  it('Test 4: "no" or unanswered items are not returned even with 0 photos', () => {
    const answers = { material: { value: 'no' } }
    const photosByItem = {}
    expect(missingConditionalPhotos(FM_READINESS_SLUG, items, answers, photosByItem)).toEqual([])
    // Upholstery left entirely unanswered.
    expect(
      missingConditionalPhotos(FM_READINESS_SLUG, items, { accessories: { value: 'no' } }, {}),
    ).toEqual([])
  })

  it('Test 5: multiple yes items missing photos all returned', () => {
    const answers = {
      material: { value: 'yes' },
      accessories: { value: 'yes' },
      upholstery: { value: 'no' },
    }
    const photosByItem = {}
    expect(missingConditionalPhotos(FM_READINESS_SLUG, items, answers, photosByItem)).toEqual([
      'material',
      'accessories',
    ])
  })
})

describe('missingRequiredAnswers', () => {
  it('Test 6: other slugs return [] regardless of answers', () => {
    expect(missingRequiredAnswers('production_process', items, {})).toEqual([])
    expect(missingRequiredAnswers('delivery_project', items, {})).toEqual([])
  })

  it('Test 7: Material unanswered is returned', () => {
    const answers = { accessories: { value: 'yes' }, upholstery: { value: 'yes' } }
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, answers)).toContain('material')
  })

  it('Test 8: Accessories unanswered is returned', () => {
    const answers = { material: { value: 'yes' }, upholstery: { value: 'yes' } }
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, answers)).toContain('accessories')
  })

  it('Test 9: Upholstery unanswered is NOT returned (optional)', () => {
    const answers = { material: { value: 'yes' }, accessories: { value: 'yes' } }
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, answers)).not.toContain('upholstery')
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, answers)).toEqual([])
  })

  it('Test 10: Material and Accessories answered, Upholstery unanswered -> []', () => {
    const answers = { material: { value: 'no' }, accessories: { value: 'yes' } }
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, answers)).toEqual([])
  })

  it('Test 11: present answer object with null/empty value counts as unanswered', () => {
    const answers = {
      material: { value: null },
      accessories: { value: '' },
    }
    const result = missingRequiredAnswers(FM_READINESS_SLUG, items, answers as never)
    expect(result).toContain('material')
    expect(result).toContain('accessories')
  })

  // The 2026-07-31 paper rewrite added the first 'text' items to this slug
  // (Project / Unit). The wizard's text input writes only `textValue`, so a
  // value-only rule left the whole form permanently gated shut.
  it('Test 12: a text item is answered by textValue, not value', () => {
    const textItems = [
      { id: 'project', label: 'Project', itemType: 'text' },
      { id: 'unit', label: 'Unit', itemType: 'text' },
    ]
    expect(
      missingRequiredAnswers(FM_READINESS_SLUG, textItems, {
        project: { textValue: 'Villa 12' },
        unit: { textValue: 'Kitchen island' },
      }),
    ).toEqual([])
  })

  it('Test 13: a text item with blank/whitespace/absent textValue is unanswered', () => {
    const textItems = [
      { id: 'project', label: 'Project', itemType: 'text' },
      { id: 'unit', label: 'Unit', itemType: 'text' },
      { id: 'other', label: 'Other', itemType: 'text' },
    ]
    const result = missingRequiredAnswers(FM_READINESS_SLUG, textItems, {
      project: { textValue: '' },
      unit: { textValue: '   ' },
    })
    expect(result).toEqual(['project', 'unit', 'other'])
  })

  it('Test 14: a text item is NOT satisfied by a radio value, and vice versa', () => {
    expect(
      missingRequiredAnswers(FM_READINESS_SLUG, [{ id: 'project', label: 'Project', itemType: 'text' }], {
        project: { value: 'yes' },
      }),
    ).toEqual(['project'])
    expect(
      missingRequiredAnswers(FM_READINESS_SLUG, [{ id: 'material', label: 'Material', itemType: 'radio' }], {
        material: { textValue: 'typed into the wrong field' },
      }),
    ).toEqual(['material'])
  })

  it('Test 15: items with no itemType keep the original radio behavior', () => {
    expect(missingRequiredAnswers(FM_READINESS_SLUG, items, { material: { value: 'yes' } })).toEqual(
      ['accessories'],
    )
  })
})

describe('isOptionalFmReadinessItem', () => {
  it('matches "upholstery" case-insensitively', () => {
    expect(isOptionalFmReadinessItem(upholstery)).toBe(true)
    expect(isOptionalFmReadinessItem({ label: 'UPHOLSTERY readiness form' })).toBe(true)
  })

  it('does not match Material or Accessories', () => {
    expect(isOptionalFmReadinessItem(material)).toBe(false)
    expect(isOptionalFmReadinessItem(accessories)).toBe(false)
  })
})
