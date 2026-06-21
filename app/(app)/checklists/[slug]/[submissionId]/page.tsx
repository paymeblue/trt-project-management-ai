import { and, asc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklistResponses,
  checklists,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

function valueLabel(v: string | null): string {
  if (v === 'yes') return 'Yes'
  if (v === 'no') return 'No'
  if (v === 'na') return 'N/A'
  return '—'
}

export default async function SubmissionViewPage({
  params,
}: {
  params: Promise<{ slug: string; submissionId: string }>
}) {
  const { slug, submissionId } = await params
  const { userId } = await verifySession()

  const [def] = await db
    .select()
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, slug))
    .limit(1)

  const [submission] = def
    ? await db
        .select()
        .from(checklists)
        .where(and(eq(checklists.id, submissionId), eq(checklists.createdBy, userId)))
        .limit(1)
    : []

  if (!def || !submission) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href={`/checklists/${slug}`} className="text-sm text-primary hover:underline">
          ← Back
        </Link>
        <p className="mt-6 text-gray-500">Submission not found.</p>
      </div>
    )
  }

  const rows = await db
    .select({
      sectionTitle: checklistTemplateItems.sectionTitle,
      step: checklistTemplateItems.step,
      label: checklistTemplateItems.label,
      value: checklistResponses.value,
      textValue: checklistResponses.textValue,
      notes: checklistResponses.notes,
    })
    .from(checklistResponses)
    .innerJoin(
      checklistTemplateItems,
      eq(checklistResponses.templateItemId, checklistTemplateItems.id),
    )
    .where(eq(checklistResponses.checklistId, submissionId))
    .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder))

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/checklists/${slug}`} className="text-sm text-primary hover:underline">
        ← {def.name}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">{def.name} — submission</h1>
      <p className="mb-6 text-xs text-gray-400">
        {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : 'Draft'}
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {rows.map((r, i) => (
          <div key={i} className="border-b border-gray-100 px-4 py-3 last:border-0">
            {r.sectionTitle && (
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                {r.sectionTitle}
              </p>
            )}
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-gray-800">{r.label}</p>
              <span className="shrink-0 text-sm font-semibold text-gray-900">
                {r.textValue ? r.textValue : valueLabel(r.value)}
              </span>
            </div>
            {r.notes && <p className="mt-1 text-xs text-gray-400">Note: {r.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
