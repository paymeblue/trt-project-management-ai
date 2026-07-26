'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createVideoCallAction } from '@/actions/video-calls'
import { getTabToken } from '@/lib/use-tab-token'
import ParticipantPicker, { type PersonOption } from '@/app/_components/participant-picker'

// Quick task 260726-dw4 (Task 8, BTN-01): the ONE dedicated, always-visible
// way to schedule a call going forward (admin-only) — replaces the buried
// inline checkbox removed from new-call-form.tsx in Task 7. Opens a MODAL
// (not an inline expand), reusing ParticipantPicker for the invitee list.
export default function ScheduleCallForm({ allUsers }: { allUsers: PersonOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function close() {
    setOpen(false)
    setTitle('')
    setDate('')
    setTime('')
    setPicked(new Set())
    setMessage(null)
  }

  function submit() {
    if (picked.size === 0) {
      setMessage('Pick at least one other person to call.')
      return
    }
    if (!date || !time) {
      setMessage('Pick a date and time.')
      return
    }
    const parsedDate = new Date(`${date}T${time}`)
    if (Number.isNaN(parsedDate.getTime())) {
      setMessage('Pick a date and time.')
      return
    }
    if (parsedDate.getTime() <= Date.now()) {
      setMessage('Pick a future date and time.')
      return
    }
    setMessage(null)
    startTransition(async () => {
      const res = await createVideoCallAction(getTabToken(), {
        title: title.trim() || undefined,
        participantUserIds: [...picked],
        scheduledFor: parsedDate.toISOString(),
      })
      if (res.status === 'success' && res.callId) {
        router.push(`/calls/${res.callId}`)
        return
      }
      setMessage(res.message ?? 'Could not schedule the call.')
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
      >
        <span className="material-symbols-outlined text-base">event</span>
        Schedule Call
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 flex items-center gap-1.5 text-lg font-bold text-gray-900">
          <span className="material-symbols-outlined text-primary">event</span>
          Schedule a video call
        </h3>

        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Title (optional)
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Design review"
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        <div className="mb-3 flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <ParticipantPicker allUsers={allUsers} picked={picked} onToggle={toggle} />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? 'Scheduling…' : 'Schedule call'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
        {message && <p className="mt-2 text-xs text-error">{message}</p>}
      </div>
    </div>
  )
}
