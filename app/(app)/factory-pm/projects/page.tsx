import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { createProjectAction, toggleProjectStatusAction } from '@/actions/projects'

export const dynamic = 'force-dynamic'

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

export default async function FactoryProjectsPage() {
  const { userId } = await verifySession()
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.createdBy, userId))
    .orderBy(desc(projects.createdAt))

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <a href="/factory-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Factory Floor Projects</h1>

      <form
        action={createProjectAction}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Project name</label>
          <input
            name="name"
            required
            minLength={2}
            placeholder="e.g. Lagos Showroom fit-out"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Delivery timeline</label>
          <input
            name="deliveryDate"
            type="date"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Add project
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Project Name</th>
              <th className="px-4 py-3">Delivery Timeline</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  No projects yet — add your first above.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const delivered = p.status === 'delivered'
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt(p.deliveryDate)}</td>
                  <td className="px-4 py-3">
                    <form action={toggleProjectStatusAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          delivered
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}
                        title="Click to toggle"
                      >
                        {delivered ? 'Delivered' : 'Not Delivered'}
                      </button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
