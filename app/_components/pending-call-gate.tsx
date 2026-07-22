'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { markNotificationsReadAction } from '@/actions/notifications'
import { getTabToken } from '@/lib/use-tab-token'
import { createRingtone, type Ringtone } from '@/lib/ringtone'

type Item = {
  id: string
  type: string
  title: string
  body: string | null
  callId: string | null
  read: boolean
  createdAt: string
}
type Feed = { items: Item[]; unread: number }

const POLL_MS = 4000

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// A prominent forcing modal — not just the passive bell badge — for an
// incoming/ongoing video call the viewer hasn't opened yet. Mirrors
// PendingStepGate's shape (fixed overlay, per-session dismiss-by-id so it
// doesn't nag every poll, suppressed while already on the destination route)
// but keyed off unread 'video_call' notifications instead of workflow steps.
export default function PendingCallGate() {
  const pathname = usePathname()
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 })
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) setFeed((await res.json()) as Feed)
    } catch {
      // transient — keep last known
    }
  }, [])

  useEffect(() => {
    const kickoff = setTimeout(refresh, 0)
    pollRef.current = setInterval(refresh, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(kickoff)
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  // Never stack this on top of the call room / list itself — the user is
  // already exactly where the modal would send them.
  const onCallRoute = pathname.startsWith('/calls')

  const pending = onCallRoute
    ? undefined
    : feed.items.find((i) => i.type === 'video_call' && !i.read && i.callId && !dismissed.has(i.id))

  // Teams/Zoom-style ringing while this modal is up — rings until the callee
  // picks up (Join) or dismisses it, not on a timer. Keyed off pending?.id
  // (not the whole `pending` object, which is a fresh reference every poll)
  // so the ring cycle doesn't restart from beep one every 4s while the SAME
  // call is still ringing.
  const ringtoneRef = useRef<Ringtone | null>(null)
  useEffect(() => {
    ringtoneRef.current = createRingtone()
    return () => ringtoneRef.current?.stop()
  }, [])
  useEffect(() => {
    if (pending) ringtoneRef.current?.start()
    else ringtoneRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id])

  if (!pending) return null

  function close() {
    setDismissed((prev) => new Set(prev).add(pending!.id))
  }

  async function join() {
    await markNotificationsReadAction(getTabToken(), pending!.id)
    // A hard navigation, not router.push — the sidebar's unread badge
    // (getVideoCallUnreadCount) is computed in the shared (app) layout,
    // which client-side push navigation does NOT re-run; racing push()
    // against a same-tick router.refresh() also proved unreliable (observed
    // the navigation get dropped entirely). A full page load re-renders the
    // layout fresh every time — simple and correct, and this is a one-off
    // "join a call" click, not a case where SPA smoothness matters.
    window.location.href = `/calls/${pending!.callId}`
  }

  return (
    <div
      // z-[70], one above PendingStepGate's z-[60] — a live call is
      // time-sensitive (someone is waiting right now) in a way an async
      // workflow step isn't, so it should win if both happen to be pending
      // at once.
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="absolute right-3 top-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined animate-pulse text-2xl text-primary">videocam</span>
          <h2 className="text-lg font-bold text-gray-900">Video call</h2>
        </div>

        <div className="my-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-gray-900">{pending.title}</p>
          {pending.body && <p className="mt-1 text-sm text-gray-600">{pending.body}</p>}
          <p className="mt-1 text-xs text-gray-500">{ago(pending.createdAt)}</p>
        </div>

        <button
          type="button"
          onClick={join}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Join call
          <span className="material-symbols-outlined text-base">videocam</span>
        </button>
      </div>
    </div>
  )
}
