'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addVideoCallParticipantsAction } from '@/actions/video-calls'
import { getTabToken } from '@/lib/use-tab-token'

type PersonOption = { id: string; name: string; role: string }

export default function AddCallParticipants({
  callId,
  existing,
  allUsers,
}: {
  callId: string
  existing: { userId: string; name: string }[]
  allUsers: PersonOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const existingIds = useMemo(() => new Set(existing.map((p) => p.userId)), [existing])
  const candidates = useMemo(
    () =>
      allUsers
        .filter((u) => !existingIds.has(u.id))
        .filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase())),
    [allUsers, existingIds, query],
  )

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    if (picked.size === 0) return
    setMessage(null)
    startTransition(async () => {
      const res = await addVideoCallParticipantsAction(getTabToken(), {
        callId,
        userIds: [...picked],
      })
      setOk(res.status === 'success')
      setMessage(
        res.status === 'success'
          ? `Added ${picked.size} ${picked.size === 1 ? 'person' : 'people'}.`
          : (res.message ?? 'Could not add participants.'),
      )
      if (res.status === 'success') {
        setPicked(new Set())
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {existing.map((p) => (
            <span
              key={p.userId}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
            >
              {p.name}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-base">person_add</span>
          Add people
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          />
          <div className="max-h-48 space-y-1 overflow-y-auto">
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
                  onChange={() => toggle(u.id)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                {u.name}
                <span className="text-xs font-normal text-gray-400">{u.role.replace(/_/g, ' ')}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={pending || picked.size === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? 'Adding…' : `Add ${picked.size || ''}`}
          </button>
          {message && <p className={`text-xs ${ok ? 'text-green-700' : 'text-error'}`}>{message}</p>}
        </div>
      )}
    </div>
  )
}
