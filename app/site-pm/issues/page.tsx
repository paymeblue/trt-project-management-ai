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
      <a href="/site-pm/dashboard" className="text-sm text-blue-600 hover:underline">
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <textarea
          name="description"
          rows={2}
          placeholder="Description (optional)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Log issue
        </button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            No issues logged.
          </p>
        )}
        {rows.map((i) => {
          const open = i.status === 'open'
          return (
            <div
              key={i.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-medium text-gray-900">{i.title}</p>
                {i.description && <p className="text-sm text-gray-500">{i.description}</p>}
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(i.createdAt).toLocaleDateString()}
                </p>
              </div>
              <form action={toggleIssueAction}>
                <input type="hidden" name="id" value={i.id} />
                <button
                  type="submit"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    open
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                  title="Click to toggle"
                >
                  {open ? 'Open' : 'Closed'}
                </button>
              </form>
            </div>
          )
        })}
      </div>
    </div>
  )
}
