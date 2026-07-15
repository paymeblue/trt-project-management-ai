'use client'

import { useMemo, useState } from 'react'
import {
  filterRows,
  groupRows,
  type GroupMode,
  type TimelineFilters,
  type TimelineRow,
} from '@/app/(app)/admin/timeline/table-utils'

type StepOption = { n: number; label: string }

const STATUS_OPTIONS = [
  { value: 'not_delivered', label: 'Not delivered' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'paused', label: 'Paused' },
]

const PAYMENT_OPTIONS = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
]

const GROUP_MODES: { value: GroupMode; label: string }[] = [
  { value: 'month', label: 'By Month' },
  { value: 'year', label: 'By Year' },
  { value: 'step', label: 'By Step' },
]

const EMPTY_FILTERS: TimelineFilters = {
  search: '',
  step: null,
  status: null,
  paymentStatus: null,
  createdFrom: null,
  createdTo: null,
  deadlineFrom: null,
  deadlineTo: null,
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}

function toneCls(tone: TimelineRow['tone']) {
  return tone === 'green'
    ? 'bg-green-100 text-green-700'
    : tone === 'red'
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700'
}

export default function AdminTimelineTable({
  rows,
  steps,
}: {
  rows: TimelineRow[]
  steps: StepOption[]
}) {
  const [search, setSearch] = useState('')
  const [step, setStep] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null)
  const [createdFrom, setCreatedFrom] = useState<string | null>(null)
  const [createdTo, setCreatedTo] = useState<string | null>(null)
  const [deadlineFrom, setDeadlineFrom] = useState<string | null>(null)
  const [deadlineTo, setDeadlineTo] = useState<string | null>(null)
  const [groupMode, setGroupMode] = useState<GroupMode>('month')

  const filters: TimelineFilters = {
    search,
    step,
    status,
    paymentStatus,
    createdFrom,
    createdTo,
    deadlineFrom,
    deadlineTo,
  }

  const groups = useMemo(() => {
    const filtered = filterRows(rows, filters)
    return groupRows(filtered, groupMode)
  }, [rows, groupMode, search, step, status, paymentStatus, createdFrom, createdTo, deadlineFrom, deadlineTo])

  const totalVisible = groups.reduce((n, g) => n + g.rows.length, 0)

  function resetFilters() {
    setSearch('')
    setStep(null)
    setStatus(null)
    setPaymentStatus(null)
    setCreatedFrom(null)
    setCreatedTo(null)
    setDeadlineFrom(null)
    setDeadlineTo(null)
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Search
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, location, client…"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Step
          </label>
          <select
            value={step ?? ''}
            onChange={(e) => setStep(e.target.value === '' ? null : Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All steps</option>
            {steps.map((s) => (
              <option key={s.n} value={s.n}>
                {s.n} · {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Status
          </label>
          <select
            value={status ?? ''}
            onChange={(e) => setStatus(e.target.value || null)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Payment
          </label>
          <select
            value={paymentStatus ?? ''}
            onChange={(e) => setPaymentStatus(e.target.value || null)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All payments</option>
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Created
          </label>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={createdFrom ?? ''}
              onChange={(e) => setCreatedFrom(e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={createdTo ?? ''}
              onChange={(e) => setCreatedTo(e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Deadline
          </label>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={deadlineFrom ?? ''}
              onChange={(e) => setDeadlineFrom(e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={deadlineTo ?? ''}
              onChange={(e) => setDeadlineTo(e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
        >
          Reset filters
        </button>

        <div className="ml-auto flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Group by
          </label>
          <div className="flex rounded-md border border-gray-300 p-0.5">
            {GROUP_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setGroupMode(m.value)}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  groupMode === m.value
                    ? 'bg-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {totalVisible === 0 ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-8 text-center text-gray-400">
            {rows.length === 0
              ? 'No projects yet — create one from “New Project”.'
              : 'No projects match the current filters.'}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div
              key={group.key}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.key} <span className="font-normal normal-case text-gray-400">({group.rows.length})</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Current Step</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {group.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.location || 'No location'}</p>
                        {row.auditHref && (
                          <a
                            href={row.auditHref}
                            className="mt-1 inline-block text-xs text-primary hover:underline"
                          >
                            View →
                          </a>
                        )}
                        {row.history.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-primary">
                              History ({row.history.length})
                            </summary>
                            <ul className="mt-2 space-y-1 border-l border-gray-200 pl-3">
                              {row.history.map((h, i) => (
                                <li key={i} className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-700">{h.label}</span> —{' '}
                                  {h.actor} · {new Date(h.completedAt).toLocaleString()}
                                  {h.notes ? ` · “${h.notes}”` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.stepLabel}
                        {!row.complete && (row.actHref || row.waitingLabel) && (
                          <p className="text-xs text-gray-400">
                            {row.actHref ? (
                              <a
                                href={row.actHref}
                                className="font-semibold text-primary hover:underline"
                              >
                                Action needed →
                              </a>
                            ) : (
                              row.waitingLabel
                            )}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmt(row.deliveryDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmt(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneCls(row.tone)}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{row.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
