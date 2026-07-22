import Link from 'next/link'
import { verifySession } from '@/lib/dal'
import { getDisputeList } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  escalation: 'Escalation',
  bypass_request: 'Bypass request',
  pause_flag: 'Pause / flag',
}

// Every project this viewer has ever been notified about via an
// escalation/bypass/pause_flag — the supervisor-facing "action required"
// list. Deliberately independent of workflow step gating (getMyWork): a
// dispute never blocks or appears in the escalating user's own
// step-completion flow; this is a separate tracking surface only.
export default async function DisputesListPage() {
  const { userId } = await verifySession()
  const items = await getDisputeList(userId)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Escalations &amp; Disputes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Every project you&apos;ve been alerted about — escalations, bypass requests, and pause/flag
        events. Opening a thread marks it attended to.
      </p>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.projectId}
              href={`/disputes/${it.projectId}`}
              className={`flex items-start justify-between gap-3 rounded-xl border p-4 shadow-sm transition-colors hover:bg-gray-50 ${
                it.unreadCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{it.projectName}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    {TYPE_LABEL[it.latestType] ?? it.latestType}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-gray-600">{it.latestTitle}</p>
                {it.latestBody && (
                  <p className="mt-0.5 truncate text-xs text-gray-400">{it.latestBody}</p>
                )}
              </div>
              {it.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  {it.unreadCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
