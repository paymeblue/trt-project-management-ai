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
