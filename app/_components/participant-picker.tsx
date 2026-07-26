'use client'

import { useMemo, useState } from 'react'

export type PersonOption = { id: string; name: string; role: string }

// Quick task 260726-dw4 (Task 7): search + checkbox-list picker extracted
// byte-for-byte (markup/classes) from new-call-form.tsx's original inline
// implementation, parameterized by picked/onToggle instead of owning the
// picked state itself — each consumer (new-call-form.tsx, the new
// schedule-call-form.tsx) needs its own submit-time access to the picked set.
export default function ParticipantPicker({
  allUsers,
  picked,
  onToggle,
}: {
  allUsers: PersonOption[]
  picked: Set<string>
  onToggle: (id: string) => void
}) {
  const [query, setQuery] = useState('')

  const candidates = useMemo(
    () => allUsers.filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase())),
    [allUsers, query],
  )

  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Who&apos;s on the call?
      </label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <div className="mb-3 max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
        {candidates.length === 0 && (
          <p className="py-2 text-center text-xs text-gray-400">No matching people.</p>
        )}
        {candidates.map((u) => (
          <label
            key={u.id}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
              picked.has(u.id) ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={picked.has(u.id)}
              onChange={() => onToggle(u.id)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            {u.name}
            <span className="text-xs font-normal text-gray-400">{u.role.replace(/_/g, ' ')}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
