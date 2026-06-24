import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySession, isAdminRole } from '@/lib/dal'
import ProcessFlowForm from '@/app/_components/process-flow-form'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
  operations: '/admin/dashboard',
}

export default async function ProcessesPage() {
  const { role } = await verifySession()
  const admin = isAdminRole(role)

  const rows = await db
    .select({
      id: processes.id,
      title: processes.title,
      slug: processes.slug,
      imageData: processes.imageData,
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
        {admin
          ? 'Upload process flow images. Everyone can view them; only administrators can edit or delete.'
          : 'Company process flows (view only).'}
      </p>

      {admin && <ProcessFlowForm />}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          {admin ? 'No process flows yet — add one above.' : 'No process flows have been published yet.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <a
              key={p.id}
              href={`/processes/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-primary hover:shadow-md"
            >
              <div className="flex h-32 items-center justify-center overflow-hidden bg-gray-50">
                {p.imageData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageData} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-primary/70">account_tree</span>
                )}
              </div>
              <div className="p-4">
                <p className="font-semibold text-gray-900 group-hover:text-primary">{p.title}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Updated {new Date(p.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
