import { count, eq } from 'drizzle-orm'
import { db } from '@/db'
import { users, projects, checklists, issues } from '@/db/schema'
import { requireRole } from '@/lib/dal'

export const dynamic = 'force-dynamic'

type StatCardProps = {
  label: string
  value: number | string
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-gray-600">{d.label}</span>
            <span className="font-semibold text-gray-900">{d.value}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function AdminOverviewPage() {
  await requireRole('super_admin')

  const [
    [{ totalUsers }],
    [{ factoryPmCount }],
    [{ sitePmCount }],
    [{ superAdminCount }],
    [{ totalProjects }],
    [{ totalChecklists }],
    [{ totalIssues }],
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(users),
    db
      .select({ factoryPmCount: count() })
      .from(users)
      .where(eq(users.role, 'factory_pm')),
    db
      .select({ sitePmCount: count() })
      .from(users)
      .where(eq(users.role, 'site_pm')),
    db
      .select({ superAdminCount: count() })
      .from(users)
      .where(eq(users.role, 'super_admin')),
    db.select({ totalProjects: count() }).from(projects),
    db
      .select({ totalChecklists: count() })
      .from(checklists)
      .where(eq(checklists.status, 'submitted')),
    db.select({ totalIssues: count() }).from(issues),
  ])

  const [[{ delivered }], [{ notDelivered }], [{ openIssues }]] = await Promise.all([
    db.select({ delivered: count() }).from(projects).where(eq(projects.status, 'delivered')),
    db.select({ notDelivered: count() }).from(projects).where(eq(projects.status, 'not_delivered')),
    db.select({ openIssues: count() }).from(issues).where(eq(issues.status, 'open')),
  ])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        &larr; Dashboard
      </a>
      <h1 className="mb-2 mt-2 text-2xl font-bold text-gray-900">Platform Overview</h1>
      <p className="mb-8 text-sm text-gray-500">Read-only aggregate across all system data.</p>

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Users
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Users" value={totalUsers} />
          <StatCard label="Factory PMs" value={factoryPmCount} />
          <StatCard label="Site PMs" value={sitePmCount} />
          <StatCard label="Super Admins" value={superAdminCount} />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Activity
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Projects" value={totalProjects} />
          <StatCard label="Checklists Submitted" value={totalChecklists} />
          <StatCard label="Total Issues" value={totalIssues} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          At a glance
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Users by role</p>
            <BarChart
              data={[
                { label: 'Factory PM', value: factoryPmCount, color: '#f97316' },
                { label: 'Site PM', value: sitePmCount, color: '#006591' },
                { label: 'Super Admin', value: superAdminCount, color: '#595e6d' },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Projects &amp; issues</p>
            <BarChart
              data={[
                { label: 'Delivered', value: delivered, color: '#16a34a' },
                { label: 'Not delivered', value: notDelivered, color: '#f97316' },
                { label: 'Open issues', value: openIssues, color: '#ba1a1a' },
              ]}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
