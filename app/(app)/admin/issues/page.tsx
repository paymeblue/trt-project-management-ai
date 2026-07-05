import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues, projects, users } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import { adminToggleIssueAction } from '@/actions/issues'

export const dynamic = 'force-dynamic'

// Super-admin / operations view of ALL issues across projects, with the ability
// to close/reopen them (REQ-G10 acting).
export default async function AdminIssuesPage() {
  await requireAdmin()

  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      escalatedAt: issues.escalatedAt,
      createdAt: issues.createdAt,
      projectId: issues.projectId,
      projectName: projects.name,
      loggedBy: users.name,
    })
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .leftJoin(users, eq(issues.createdBy, users.id))
    .orderBy(desc(issues.createdAt))

  const open = rows.filter((r) => r.status === 'open').length

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Issue Log</h1>
      <p className="mb-6 text-sm text-gray-500">
        All issues across every project. {open} open · {rows.length - open} closed.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No issues logged.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Logged by</th>
                <th className="w-28 px-3 py-2">Logged</th>
                <th className="w-24 px-3 py-2 text-center">Escalated</th>
                <th className="w-28 px-3 py-2 text-center">Status</th>
                <th className="w-24 px-3 py-2 text-center">Discuss</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => {
                const isOpen = i.status === 'open'
                return (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{i.title}</p>
                      {i.description && <p className="text-xs text-gray-500">{i.description}</p>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{i.projectName ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{i.loggedBy ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {new Date(i.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {i.escalatedAt ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <form action={adminToggleIssueAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isOpen
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                          title="Click to toggle open/closed"
                        >
                          {isOpen ? 'Open' : 'Closed'}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/disputes/${i.projectId}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
