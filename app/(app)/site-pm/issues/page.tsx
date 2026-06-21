import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { issues } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { createIssueAction, toggleIssueAction } from '@/actions/issues'

export const dynamic = 'force-dynamic'

export default async function IssueLogPage() {
  const { userId } = await verifySession()
  const rows = await db
    .select()
    .from(issues)
    .where(eq(issues.createdBy, userId))
    .orderBy(desc(issues.createdAt))

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
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Log issue
        </button>
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
                <th className="px-3 py-2">Description</th>
                <th className="w-28 px-3 py-2">Logged</th>
                <th className="w-24 px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i, idx) => {
                const open = i.status === 'open'
                return (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{i.title}</td>
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
