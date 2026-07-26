'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createVideoCallAction } from '@/actions/video-calls'
import { getTabToken } from '@/lib/use-tab-token'
import ParticipantPicker, { type PersonOption } from '@/app/_components/participant-picker'

export default function NewCallForm({ allUsers }: { allUsers: PersonOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
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

  function submit() {
    if (picked.size === 0) {
      setMessage('Pick at least one other person to call.')
      return
    }
    setMessage(null)
    startTransition(async () => {
      const res = await createVideoCallAction(getTabToken(), {
        title: title.trim() || undefined,
        participantUserIds: [...picked],
      })
      if (res.status === 'success' && res.callId) {
        router.push(`/calls/${res.callId}`)
        return
      }
      setMessage(res.message ?? 'Could not start the call.')
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
      >
        <span className="material-symbols-outlined text-base">videocam</span>
        Start a call
      </button>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-base">videocam</span>
        Start a video call
      </p>

      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
        Title (optional)
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Design review"
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      <ParticipantPicker allUsers={allUsers} picked={picked} onToggle={toggle} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? 'Starting…' : `Start call${picked.size ? ` (${picked.size + 1})` : ''}`}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-error">{message}</p>}
    </div>
  )
}
