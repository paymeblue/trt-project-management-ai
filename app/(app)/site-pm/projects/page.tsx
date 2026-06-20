import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { createProjectAction } from '@/actions/projects'

export const dynamic = 'force-dynamic'

export default async function SiteProjectsPage() {
  const { userId } = await verifySession()
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.createdBy, userId))
    .orderBy(desc(projects.createdAt))

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/site-pm/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Projects</h1>

      <form
        action={createProjectAction}
        className="mb-8 space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-gray-900">New Project</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Project name</label>
          <input
            name="name"
            required
            minLength={2}
            placeholder="e.g. Victoria Island Residence"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Location</label>
          <input
            name="location"
            placeholder="e.g. Lagos"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-gray-400">Project Manager: you (auto-filled)</p>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Create project
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold text-gray-900">Previous Projects</h2>
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            No projects yet.
          </p>
        )}
        {rows.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-medium text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-500">{p.location ?? 'No location'}</p>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(p.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
