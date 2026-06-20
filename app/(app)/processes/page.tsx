import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { createProcessAction } from '@/actions/processes'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function ProcessesPage() {
  const { role } = await verifySession()

  const rows = await db
    .select()
    .from(processes)
    .orderBy(desc(processes.createdAt))

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        &larr; Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Processes &amp; Flow Charts</h1>

      {/* New process form */}
      <form
        action={createProcessAction}
        className="mb-10 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-gray-800">New Process</h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Title</label>
          <input
            name="title"
            required
            minLength={2}
            placeholder="e.g. Order Fulfillment"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Slug <span className="text-gray-400">(URL-friendly, unique)</span>
          </label>
          <input
            name="slug"
            required
            minLength={2}
            placeholder="e.g. order-fulfillment"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Lowercase letters, numbers and hyphens only"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Body</label>
          <textarea
            name="body"
            required
            rows={8}
            placeholder="Describe the process here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Tip: include a fenced <code className="rounded bg-gray-100 px-1">```mermaid</code> code block in the body to render a flow chart.
          </p>
        </div>

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Add process
        </button>
      </form>

      {/* Process list */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-gray-400">No processes yet — add one above.</p>
        )}
        {rows.map((p) => (
          <a
            key={p.id}
            href={`/processes/${p.slug}`}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm shadow-sm hover:border-primary hover:shadow-md transition"
          >
            <span className="font-medium text-gray-900">{p.title}</span>
            <span className="text-primary">&rarr;</span>
          </a>
        ))}
      </div>
    </div>
  )
}
