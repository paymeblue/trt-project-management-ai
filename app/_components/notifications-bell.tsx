'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { markNotificationsReadAction } from '@/actions/notifications'
import { getTabToken } from '@/lib/use-tab-token'

type Item = {
  id: string
  type: string
  title: string
  body: string | null
  projectId: string | null
  callId: string | null
  read: boolean
  createdAt: string
}
type Feed = { items: Item[]; unread: number }

const POLL_MS = 4000

// Notification types that just mark-read + refresh in place (no navigation)
// rather than routing to /disputes/{projectId} — that destination is
// super-admin-only and wrong for these. 'assignment' was the original
// exception; quick task 260714-iuj adds the two approval-flow types
// (approval_request/approval_rejected) fired by the reworked approval-kind
// step UI. Prefer this allowlist over stacking `type !== '...'` checks so a
// future non-dispute notification type is an explicit, one-line addition.
const NO_NAVIGATE_TYPES = new Set(['assignment', 'approval_request', 'approval_rejected', 'step_turn'])

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

// In-app alerts: polls /api/notifications (per-user, session-scoped) and shows
// an unread badge with a dropdown panel. Mounted for every authenticated role —
// super admins get escalation/flag/bypass alerts (REQ-G10), any role can get
// 'assignment' alerts when picked from a workflow assignment step's target pool.
export default function NotificationsBell() {
  const router = useRouter()
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    const id = setInterval(refresh, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(kickoff)
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function markOne(item: Item) {
    setFeed((f) => {
      const wasUnread = f.items.some((i) => i.id === item.id && !i.read)
      return {
        items: f.items.map((i) => (i.id === item.id ? { ...i, read: true } : i)),
        unread: Math.max(0, f.unread - (wasUnread ? 1 : 0)),
      }
    })
    await markNotificationsReadAction(getTabToken(), item.id)
    // A video_call notification always carries a callId — takes priority
    // over the dispute-routing branch below (mutually exclusive in practice:
    // a call notification never carries a projectId).
    if (item.callId) {
      setOpen(false)
      router.push(`/calls/${item.callId}`)
      return
    }
    // Escalations/flags/bypasses carry a project — land the admin on its
    // discussion thread so they can act (REQ-G10). /disputes is a
    // super-admin-only destination, so NO_NAVIGATE_TYPES (any role) must
    // never route there — just mark read and refresh.
    if (item.projectId && !NO_NAVIGATE_TYPES.has(item.type)) {
      setOpen(false)
      router.push(`/disputes/${item.projectId}`)
    } else {
      refresh()
    }
  }

  async function markAll() {
    setFeed((f) => ({ items: f.items.map((i) => ({ ...i, read: true })), unread: 0 }))
    await markNotificationsReadAction(getTabToken())
    refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-[20px]">notifications</span>
        {feed.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low shadow-lg">
          <div className="flex items-center justify-between border-b border-outline-variant px-3 py-2">
            <span className="text-sm font-semibold text-on-surface">Alerts</span>
            {feed.unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {feed.items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-on-surface-variant">No alerts.</p>
            ) : (
              feed.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markOne(n)}
                  className={`flex w-full items-start gap-2 border-b border-outline-variant px-3 py-2.5 text-left last:border-0 hover:bg-surface-container-high ${
                    n.read ? '' : 'bg-primary/5'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read ? 'bg-transparent' : 'bg-primary'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-on-surface">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-xs leading-snug text-on-surface-variant">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-on-surface-variant">
                      {ago(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
