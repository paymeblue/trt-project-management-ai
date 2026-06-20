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

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
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

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Activity
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Projects" value={totalProjects} />
          <StatCard label="Checklists Submitted" value={totalChecklists} />
          <StatCard label="Total Issues" value={totalIssues} />
        </div>
      </section>
    </div>
  )
}
