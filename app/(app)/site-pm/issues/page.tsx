import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues, projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { createIssueAction, toggleIssueAction, escalateIssueAction } from '@/actions/issues'

export const dynamic = 'force-dynamic'

export default async function IssueLogPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const { userId } = await verifySession()
  const { project: filterProject = '' } = await searchParams

  const projectList = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(desc(projects.createdAt))

  const rows = await db
    .select({
      id: issues.id,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      escalatedAt: issues.escalatedAt,
      projectId: issues.projectId,
      createdAt: issues.createdAt,
      projectName: projects.name,
    })
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(
      filterProject
        ? and(eq(issues.createdBy, userId), eq(issues.projectId, filterProject))
        : eq(issues.createdBy, userId),
    )
    .orderBy(desc(issues.createdAt))

  const noProjects = projectList.length === 0

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/site-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Issue Log</h1>

      <form
        action={createIssueAction}
        className="mb-8 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-gray-900">Log a new issue</h2>
        <select
          name="projectId"
          required
          defaultValue=""
          disabled={noProjects}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
        >
          <option value="" disabled>
            {noProjects ? 'No projects available' : 'Select a project…'}
          </option>
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          name="title"
          required
          minLength={2}
          placeholder="Issue title (e.g. Wrong hinge delivered)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <textarea
          name="description"
          rows={2}
          placeholder="Description (optional)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={noProjects}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          Log issue
        </button>
      </form>

      {/* Filter by project (server-side via GET query param) */}
      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-600">Filter by project</label>
        <select
          name="project"
          defaultValue={filterProject}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">All projects</option>
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Apply
        </button>
        {filterProject && (
          <a href="/site-pm/issues" className="text-xs text-primary hover:underline">
            Clear
          </a>
        )}
      </form>

      {/* Spreadsheet-style grid */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No issues logged.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="w-10 px-3 py-2 text-right">#</th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-28 px-3 py-2">Logged</th>
                <th className="w-24 px-3 py-2 text-center">Status</th>
                <th className="w-40 px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i, idx) => {
                const open = i.status === 'open'
                return (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{i.title}</td>
                    <td className="px-3 py-2 text-gray-600">{i.projectName || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{i.description || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {new Date(i.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <form action={toggleIssueAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            open
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                          title="Click to toggle open/closed"
                        >
                          {open ? 'Open' : 'Closed'}
                        </button>
                      </form>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-2">
                        {i.escalatedAt ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                            Escalated
                          </span>
                        ) : (
                          <form action={escalateIssueAction}>
                            <input type="hidden" name="id" value={i.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
                              title="Notify all super admins about this issue"
                            >
                              Escalate
                            </button>
                          </form>
                        )}
                        <a
                          href={`/disputes/${i.projectId}`}
                          className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Discuss
                        </a>
                      </div>
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
