import { db } from '@/db'
import { videoCalls } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'

export const dynamic = 'force-dynamic'

const HOUR_MS = 60 * 60 * 1000

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default async function CallAnalyticsPage() {
  await requireAdmin()

  const rows = await db.select().from(videoCalls)

  const now = new Date().getTime()
  const durationsMs = rows.map((r) =>
    r.status === 'active' ? now - r.createdAt.getTime() : (r.endedAt ?? r.createdAt).getTime() - r.createdAt.getTime(),
  )

  const totalCalls = rows.length
  const totalMs = durationsMs.reduce((sum, ms) => sum + ms, 0)
  const totalHours = totalMs / HOUR_MS
  const avgDurationMinutes = totalCalls ? (totalHours * 60) / totalCalls : 0
  const activeCount = rows.filter((r) => r.status === 'active').length

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Call Analytics</h1>
      <p className="mb-6 text-sm text-gray-500">
        Usage across every video call, derived from this app&rsquo;s own call records.
      </p>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total calls" value={totalCalls.toLocaleString()} />
        <StatCard label="Total hours used" value={`${totalHours.toFixed(1)}h`} />
        <StatCard label="Avg call duration" value={`${avgDurationMinutes.toFixed(1)} min`} />
        <StatCard label="Active now" value={activeCount.toLocaleString()} />
      </section>
    </div>
  )
}
