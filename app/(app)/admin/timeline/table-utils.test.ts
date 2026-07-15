import { describe, it, expect } from 'vitest'
import { filterRows, groupRows, type TimelineFilters, type TimelineRow } from './table-utils'

function row(overrides: Partial<TimelineRow> = {}): TimelineRow {
  return {
    id: overrides.id ?? 'p1',
    name: 'Acme Kitchen',
    location: 'Lagos',
    client: 'Jane Doe',
    currentStep: 3,
    lastStep: 21,
    stepLabel: 'Design Stage · 3/21',
    statusLabel: 'In progress',
    tone: 'amber',
    status: 'not_delivered',
    paymentStatus: 'unpaid',
    deliveryDate: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-06-15T10:00:00.000Z',
    updatedAt: '2026-06-15T10:00:00.000Z',
    complete: false,
    waitingLabel: 'Waiting on Design',
    actHref: null,
    auditHref: null,
    history: [],
    ...overrides,
  }
}

const emptyFilters: TimelineFilters = {
  search: '',
  step: null,
  status: null,
  paymentStatus: null,
  createdFrom: null,
  createdTo: null,
  deadlineFrom: null,
  deadlineTo: null,
}

describe('filterRows', () => {
  it('matches search case-insensitively across name/location/client', () => {
    const rows = [
      row({ id: 'a', name: 'Acme Kitchen' }),
      row({ id: 'b', name: 'Other', location: 'Abuja' }),
      row({ id: 'c', name: 'Other', client: 'ACME Client' }),
      row({ id: 'd', name: 'Nomatch', location: 'Nowhere', client: 'Nobody' }),
    ]
    const result = filterRows(rows, { ...emptyFilters, search: 'acme' })
    expect(result.map((r) => r.id).sort()).toEqual(['a', 'c'])
  })

  it('filters by exact currentStep', () => {
    const rows = [row({ id: 'a', currentStep: 3 }), row({ id: 'b', currentStep: 5 })]
    const result = filterRows(rows, { ...emptyFilters, step: 5 })
    expect(result.map((r) => r.id)).toEqual(['b'])
  })

  it('filters by status and paymentStatus', () => {
    const rows = [
      row({ id: 'a', status: 'delivered', paymentStatus: 'paid' }),
      row({ id: 'b', status: 'not_delivered', paymentStatus: 'unpaid' }),
    ]
    expect(filterRows(rows, { ...emptyFilters, status: 'delivered' }).map((r) => r.id)).toEqual(['a'])
    expect(filterRows(rows, { ...emptyFilters, paymentStatus: 'unpaid' }).map((r) => r.id)).toEqual(['b'])
  })

  it('filters createdAt within [from,to] inclusive by date-portion', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-06-01T00:00:00.000Z' }),
      row({ id: 'b', createdAt: '2026-06-15T23:59:00.000Z' }),
      row({ id: 'c', createdAt: '2026-07-01T00:00:00.000Z' }),
    ]
    const result = filterRows(rows, { ...emptyFilters, createdFrom: '2026-06-01', createdTo: '2026-06-15' })
    expect(result.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('filters deliveryDate within [from,to] inclusive and excludes null deliveryDate when a deadline range is set', () => {
    const rows = [
      row({ id: 'a', deliveryDate: '2026-08-01T00:00:00.000Z' }),
      row({ id: 'b', deliveryDate: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'c', deliveryDate: null }),
    ]
    const result = filterRows(rows, { ...emptyFilters, deadlineFrom: '2026-08-01', deadlineTo: '2026-08-31' })
    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  it('returns input unchanged when all filters are empty', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const result = filterRows(rows, emptyFilters)
    expect(result).toEqual(rows)
  })
})

describe('groupRows', () => {
  it('buckets by createdAt month+year label, newest bucket first', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-05-01T00:00:00.000Z' }),
      row({ id: 'b', createdAt: '2026-06-10T00:00:00.000Z' }),
      row({ id: 'c', createdAt: '2026-06-20T00:00:00.000Z' }),
    ]
    const groups = groupRows(rows, 'month')
    expect(groups.map((g) => g.key)).toEqual(['June 2026', 'May 2026'])
    expect(groups[0].rows.map((r) => r.id).sort()).toEqual(['b', 'c'])
  })

  it('buckets by createdAt year, newest first', () => {
    const rows = [
      row({ id: 'a', createdAt: '2025-12-01T00:00:00.000Z' }),
      row({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const groups = groupRows(rows, 'year')
    expect(groups.map((g) => g.key)).toEqual(['2026', '2025'])
  })

  it('buckets by currentStep ascending, with complete rows in a single Delivered bucket', () => {
    const rows = [
      row({ id: 'a', currentStep: 5, complete: false }),
      row({ id: 'b', currentStep: 2, complete: false }),
      row({ id: 'c', currentStep: 22, complete: true }),
      row({ id: 'd', currentStep: 22, complete: true }),
    ]
    const groups = groupRows(rows, 'step')
    expect(groups.map((g) => g.key)).toEqual(['Step 2', 'Step 5', 'Delivered'])
    expect(groups.find((g) => g.key === 'Delivered')?.rows.map((r) => r.id).sort()).toEqual(['c', 'd'])
  })
})
