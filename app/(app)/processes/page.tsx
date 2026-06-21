import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ProcessExcalidraw from '@/app/_components/process-excalidraw'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function ProcessesPage() {
  const { role } = await verifySession()

  const rows = await db
    .select({
      id: processes.id,
      title: processes.title,
      slug: processes.slug,
      diagram: processes.diagram,
      updatedAt: processes.updatedAt,
    })
    .from(processes)
    .orderBy(desc(processes.updatedAt))

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        &larr; Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Processes &amp; Flow Charts</h1>
      <p className="mb-6 text-sm text-gray-500">
        Draw a flow chart below, then hit <span className="font-medium">Save as new</span> and name
        it. Saved processes appear as cards.
      </p>

      {/* Draw first; name on save */}
      <ProcessExcalidraw initial={null} height={520} />

      {/* Saved processes */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Saved processes
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No processes yet — draw one above and save it.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => {
            const count =
              p.diagram && Array.isArray(p.diagram.elements) ? p.diagram.elements.length : 0
            return (
              <a
                key={p.id}
                href={`/processes/${p.slug}`}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-primary hover:shadow-md"
              >
                <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-primary/5 to-primary/10">
                  <span className="material-symbols-outlined text-3xl text-primary/70">
                    account_tree
                  </span>
                </div>
                <p className="font-semibold text-gray-900 group-hover:text-primary">{p.title}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {count > 0 ? `${count} element${count === 1 ? '' : 's'}` : 'Empty'} ·{' '}
                  {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
