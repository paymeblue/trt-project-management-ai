import { asc, desc } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import { lastStepN, projectComplete } from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'
import AnalyticsChart, { type ProjectSpeed } from '@/app/_components/analytics-chart'

export const dynamic = 'force-dynamic'

const DAY = 1000 * 60 * 60 * 24

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

export default async function AdminAnalyticsPage() {
  await requireAdmin()

  const [rows, completions, steps] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.createdAt)),
    db
      .select({
        projectId: projectStepCompletions.projectId,
        completedAt: projectStepCompletions.completedAt,
      })
      .from(projectStepCompletions)
      .orderBy(asc(projectStepCompletions.completedAt)),
    getLiveWorkflowSteps(),
  ])

  // Latest step completion per project — the end of the delivery clock.
  const lastCompletion = new Map<string, Date>()
  for (const c of completions) {
    lastCompletion.set(c.projectId, c.completedAt)
  }

  const now = new Date().getTime()

  const data: ProjectSpeed[] = rows.map((p) => {
    const complete = projectComplete(p.currentStep, lastStepN(steps)) || p.status === 'delivered'
    const start = p.createdAt.getTime()
    // For completed projects the clock stops at the final step completion (or
    // updatedAt as a fallback); ongoing projects measure elapsed time so far.
    const end = complete
      ? (lastCompletion.get(p.id) ?? p.updatedAt).getTime()
      : now
    const days = Math.max(0, Math.round(((end - start) / DAY) * 10) / 10)
    const onTime =
      p.deliveryDate == null ? null : complete ? end <= p.deliveryDate.getTime() : now <= p.deliveryDate.getTime()
    return { name: p.name, days, complete, onTime }
  })

  const completed = data.filter((d) => d.complete)
  const avgCompleted = completed.length
    ? completed.reduce((s, d) => s + d.days, 0) / completed.length
    : 0
  const fastest = completed.length ? Math.min(...completed.map((d) => d.days)) : 0
  const slowest = completed.length ? Math.max(...completed.map((d) => d.days)) : 0
  const onTimeRate = completed.length
    ? Math.round(
        (completed.filter((d) => d.onTime !== false).length / completed.length) * 100,
      )
    : 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Delivery Analytics</h1>
      <p className="mb-6 text-sm text-gray-500">
        Compare how fast each project moves from creation to delivery. Switch the visualization to
        explore the data different ways.
      </p>

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Avg delivery"
          value={`${avgCompleted.toFixed(1)}d`}
          hint={`${completed.length} delivered`}
        />
        <StatCard label="Fastest" value={`${fastest.toFixed(1)}d`} hint="best delivery time" />
        <StatCard label="Slowest" value={`${slowest.toFixed(1)}d`} hint="longest delivery time" />
        <StatCard label="On-time rate" value={`${onTimeRate}%`} hint="of delivered projects" />
      </section>

      <AnalyticsChart data={data} />
    </div>
  )
}
