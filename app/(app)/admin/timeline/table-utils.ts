// Pure, server-safe row contract + filter/group helpers for the admin
// Projects Timeline advanced data table (quick task 260714-r7a). No React,
// no DB imports — the server page (page.tsx) precomputes TimelineRow[] and
// passes it to the client table (admin-timeline-table.tsx), which imports
// only from here.

export type TimelineHistoryEntry = {
  label: string
  actor: string
  completedAt: string // ISO
  notes: string | null
}

export type TimelineRow = {
  id: string
  name: string
  location: string
  client: string
  currentStep: number
  lastStep: number
  stepLabel: string
  statusLabel: string
  tone: 'green' | 'red' | 'amber'
  status: string
  paymentStatus: string
  deliveryDate: string | null // ISO
  createdAt: string // ISO
  updatedAt: string // ISO
  complete: boolean
  waitingLabel: string | null
  actHref: string | null
  auditHref: string | null
  history: TimelineHistoryEntry[]
}

export type TimelineFilters = {
  search: string
  step: number | null
  status: string | null
  paymentStatus: string | null
  createdFrom: string | null
  createdTo: string | null
  deadlineFrom: string | null
  deadlineTo: string | null
}

export type GroupMode = 'month' | 'year' | 'step'

export type TimelineGroup = { key: string; rows: TimelineRow[] }

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Date-portion (YYYY-MM-DD) comparison — ignores time-of-day so a
// `createdFrom`/`createdTo`/`deadlineFrom`/`deadlineTo` boundary is inclusive
// of the whole day.
function datePart(iso: string): string {
  return iso.slice(0, 10)
}

function withinRange(iso: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  if (!iso) return false
  const d = datePart(iso)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function filterRows(rows: TimelineRow[], filters: TimelineFilters): TimelineRow[] {
  const {
    search,
    step,
    status,
    paymentStatus,
    createdFrom,
    createdTo,
    deadlineFrom,
    deadlineTo,
  } = filters

  const hasCreatedRange = !!createdFrom || !!createdTo
  const hasDeadlineRange = !!deadlineFrom || !!deadlineTo
  const q = search.trim().toLowerCase()

  const isUnfiltered =
    !q &&
    step === null &&
    !status &&
    !paymentStatus &&
    !hasCreatedRange &&
    !hasDeadlineRange

  if (isUnfiltered) return rows

  return rows.filter((row) => {
    if (q) {
      const haystack = `${row.name} ${row.location} ${row.client}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (step !== null && row.currentStep !== step) return false
    if (status && row.status !== status) return false
    if (paymentStatus && row.paymentStatus !== paymentStatus) return false
    if (hasCreatedRange && !withinRange(row.createdAt, createdFrom, createdTo)) return false
    if (hasDeadlineRange && !withinRange(row.deliveryDate, deadlineFrom, deadlineTo)) return false
    return true
  })
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function yearKey(iso: string): string {
  return String(new Date(iso).getFullYear())
}

export function groupRows(rows: TimelineRow[], mode: GroupMode): TimelineGroup[] {
  if (mode === 'step') {
    const buckets = new Map<string, TimelineRow[]>()
    const DELIVERED = 'Delivered'
    for (const row of rows) {
      const key = row.complete ? DELIVERED : `Step ${row.currentStep}`
      const list = buckets.get(key) ?? []
      list.push(row)
      buckets.set(key, list)
    }
    const stepKeys = [...buckets.keys()]
      .filter((k) => k !== DELIVERED)
      .sort((a, b) => Number(a.replace('Step ', '')) - Number(b.replace('Step ', '')))
    const ordered = stepKeys.map((key) => ({ key, rows: buckets.get(key)! }))
    if (buckets.has(DELIVERED)) ordered.push({ key: DELIVERED, rows: buckets.get(DELIVERED)! })
    return ordered
  }

  const keyFn = mode === 'year' ? yearKey : monthKey
  const buckets = new Map<string, TimelineRow[]>()
  const order = new Map<string, number>() // key -> newest sort timestamp

  for (const row of rows) {
    const key = keyFn(row.createdAt)
    const list = buckets.get(key) ?? []
    list.push(row)
    buckets.set(key, list)
    const t = new Date(row.createdAt).getTime()
    const current = order.get(key)
    if (current === undefined || t > current) order.set(key, t)
  }

  return [...buckets.keys()]
    .sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0))
    .map((key) => ({ key, rows: buckets.get(key)! }))
}
