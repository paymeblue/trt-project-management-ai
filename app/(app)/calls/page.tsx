import { ne } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { roleDashboard } from '@/lib/workflow'
import { getMyCalls } from '@/lib/video-calls'
import { toTitleCase } from '@/lib/text-case'
import NewCallForm from '@/app/_components/new-call-form'

export const dynamic = 'force-dynamic'

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function CallsPage() {
  const { userId, role } = await verifySession()
  const dashboard = roleDashboard(role)

  const [calls, rawUsers] = await Promise.all([
    getMyCalls(userId),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(ne(users.id, userId))
      .orderBy(users.name),
  ])
  const allUsers = rawUsers.map((u) => ({ ...u, name: toTitleCase(u.name) }))

  const active = calls.filter((c) => c.status === 'active')
  const ended = calls.filter((c) => c.status !== 'active')

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={dashboard} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Video Calls</h1>
      <p className="mb-6 text-sm text-gray-500">
        Start a call, invite people, and share the link with anyone else who needs to join.
      </p>

      <NewCallForm allUsers={allUsers} />

      {active.length > 0 && (
        <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Active</h2>
          <div className="mb-6 space-y-2">
            {active.map((c) => (
              <a
                key={c.id}
                href={`/calls/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm shadow-sm transition hover:shadow-md"
              >
                <span>
                  <span className="font-semibold text-gray-900">{c.title ?? 'Video call'}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {c.participants.map((p) => p.name).join(', ')}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  <span className="material-symbols-outlined text-base">videocam</span>
                  Join
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      {ended.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
            Past calls ({ended.length})
          </summary>
          <div className="mt-3 space-y-2">
            {ended.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-2 text-sm"
              >
                <span className="text-gray-600">{c.title ?? 'Video call'}</span>
                <span className="text-xs text-gray-400">{formatWhen(c.createdAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {calls.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No calls yet — start one above.
        </p>
      )}
    </div>
  )
}
