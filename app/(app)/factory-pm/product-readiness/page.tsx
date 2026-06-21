import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { attachments, readinessForms } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { addProductFileAction } from '@/actions/product-readiness'
import ReadinessForm from '@/app/_components/readiness-form'

export const dynamic = 'force-dynamic'

export default async function ProductReadinessPage() {
  const { userId } = await verifySession()

  const submissions = await db
    .select({
      id: readinessForms.id,
      mode: readinessForms.mode,
      project: readinessForms.project,
      unit: readinessForms.unit,
      createdAt: readinessForms.createdAt,
    })
    .from(readinessForms)
    .where(eq(readinessForms.createdBy, userId))
    .orderBy(desc(readinessForms.createdAt))
    .limit(50)

  const files = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, userId), isNull(attachments.responseId)))
    .orderBy(desc(attachments.createdAt))

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <a href="/factory-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">
        Materials / Accessories Readiness
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a photo of the signed paper form, or create &amp; sign a digital version.
      </p>

      {/* Tabbed readiness form: Upload | Create Digital Version */}
      <ReadinessForm />

      {/* Submissions */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Submitted readiness forms
      </h2>
      <div className="space-y-2">
        {submissions.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        {submissions.map((s) => (
          <a
            key={s.id}
            href={`/factory-pm/readiness/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-primary hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  s.mode === 'upload' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                }`}
              >
                {s.mode === 'upload' ? 'Uploaded' : 'Digital'}
              </span>
              <span className="font-medium text-gray-900">{s.project || 'Untitled'}</span>
              {s.unit && <span className="text-gray-400">· {s.unit}</span>}
            </span>
            <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
          </a>
        ))}
      </div>

      {/* Reference documents (name + link) */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Reference documents
      </h2>
      <form
        action={addProductFileAction}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">File name</label>
          <input
            name="filename"
            required
            placeholder="e.g. Unit-A-spec.pdf"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Link (URL)</label>
          <input
            name="url"
            type="url"
            required
            placeholder="https://…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Add file
        </button>
      </form>

      <div className="space-y-2">
        {files.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
            No reference documents yet.
          </p>
        )}
        {files.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <a href={f.s3Key} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              {f.filename}
            </a>
            <span className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
