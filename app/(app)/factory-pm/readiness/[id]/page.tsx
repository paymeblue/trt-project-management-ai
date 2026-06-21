import { and, eq } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { readinessForms } from '@/db/schema'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-right text-sm text-gray-900">{value}</span>
    </div>
  )
}

export default async function ReadinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await verifySession()

  const [form] = await db
    .select()
    .from(readinessForms)
    .where(and(eq(readinessForms.id, id), eq(readinessForms.createdBy, userId)))
    .limit(1)

  if (!form) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/factory-pm/readiness" className="text-sm text-primary hover:underline">
          ← Readiness forms
        </Link>
        <p className="mt-6 text-gray-500">Form not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/factory-pm/readiness" className="text-sm text-primary hover:underline">
        ← Readiness forms
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Readiness Form</h1>
      <p className="mb-6 text-xs text-gray-400">
        {form.mode === 'upload' ? 'Uploaded scan' : 'Digital version'} ·{' '}
        {new Date(form.createdAt).toLocaleString()}
      </p>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <Row label="Project" value={form.project} />
        <Row label="Unit" value={form.unit} />
        <Row label="Material / Quality control" value={form.materialControl} />
        <Row label="Accessories" value={form.accessories} />
        <Row label="Upholstery" value={form.upholstery} />
        <Row label="Confirmed by" value={form.confirmedBy} />
        <Row label="Date" value={form.signedDate} />

        {form.mode === 'digital' && form.signatureData && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.signatureData}
              alt="Signature"
              className="h-28 w-auto rounded-md border border-gray-200 bg-white"
            />
          </div>
        )}

        {form.mode === 'upload' && form.uploadData && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
              Uploaded form {form.uploadName ? `(${form.uploadName})` : ''}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.uploadData}
              alt="Uploaded readiness form"
              className="w-full rounded-md border border-gray-200"
            />
          </div>
        )}
      </div>
    </div>
  )
}
