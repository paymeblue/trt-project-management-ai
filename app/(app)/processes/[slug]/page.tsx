import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { processes } from '@/db/schema'
import { verifySession, isAdminRole } from '@/lib/dal'
import ProcessAdminControls from '@/app/_components/process-admin-controls'

export const dynamic = 'force-dynamic'

export default async function ProcessDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { role } = await verifySession()
  const admin = isAdminRole(role)

  const [proc] = await db.select().from(processes).where(eq(processes.slug, slug)).limit(1)

  if (!proc) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link href="/processes" className="text-sm text-primary hover:underline">
          ← Processes
        </Link>
        <p className="mt-6 text-gray-500">Process “{slug}” not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/processes" className="text-sm text-primary hover:underline">
        ← Processes
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{proc.title}</h1>

      {admin && <ProcessAdminControls slug={proc.slug} title={proc.title} />}

      {proc.imageData ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proc.imageData} alt={proc.title} className="mx-auto h-auto w-full max-w-full" />
        </div>
      ) : proc.body ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
          <p className="whitespace-pre-wrap">{proc.body}</p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No process flow image has been uploaded yet.
        </p>
      )}
    </div>
  )
}
