import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { attachments } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { addProductFileAction } from '@/actions/product-readiness'

export const dynamic = 'force-dynamic'

export default async function ProductReadinessPage() {
  const { userId } = await verifySession()
  const files = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.uploadedBy, userId), isNull(attachments.responseId)))
    .orderBy(desc(attachments.createdAt))

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/factory-pm/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-2 mt-2 text-2xl font-bold text-gray-900">Product Readiness Checklist</h1>
      <p className="mb-6 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
        Direct file upload arrives with S3 storage. For now, track readiness documents by name + link.
      </p>

      <form
        action={addProductFileAction}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">File name</label>
          <input
            name="filename"
            required
            placeholder="e.g. Unit-A-spec.pdf"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex-1">
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
            No files yet.
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
