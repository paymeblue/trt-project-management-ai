import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { submitChecklistAction } from '@/actions/checklists'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function ChecklistPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { userId, role } = await verifySession()

  const [def] = await db
    .select()
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.slug, slug))
    .limit(1)

  if (!def) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <a href={DASH[role]} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <p className="mt-6 text-gray-500">Checklist “{slug}” not found.</p>
      </div>
    )
  }

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(
      and(
        eq(checklistTemplateItems.definitionId, def.id),
        eq(checklistTemplateItems.isActive, true),
      ),
    )
    .orderBy(asc(checklistTemplateItems.sortOrder))

  const past = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.definitionId, def.id), eq(checklists.createdBy, userId)))
    .orderBy(desc(checklists.createdAt))

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{def.name}</h1>

      <form
        action={submitChecklistAction}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="definitionId" value={def.id} />
        <input type="hidden" name="slug" value={def.slug} />

        {items.map((item) => (
          <fieldset key={item.id} className="border-b border-gray-100 pb-4 last:border-0">
            <legend className="mb-2 text-sm font-medium text-gray-900">{item.label}</legend>
            {item.helpText && <p className="mb-2 text-xs text-gray-400">{item.helpText}</p>}

            {item.itemType === 'text' ? (
              <input
                name={`text_${item.id}`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="Your answer"
              />
            ) : (
              <div className="flex flex-wrap gap-4">
                {(['yes', 'no', ...(item.responseOptions === 'yes_no_na' ? ['na'] : [])] as const).map(
                  (opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name={`item_${item.id}`} value={opt} />
                      {opt === 'na' ? 'N/A' : opt === 'yes' ? 'Yes' : 'No'}
                    </label>
                  ),
                )}
              </div>
            )}

            <input
              name={`notes_${item.id}`}
              className="mt-2 w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
              placeholder="Notes (optional)"
            />
          </fieldset>
        ))}

        {items.length === 0 && (
          <p className="text-sm text-gray-400">No items configured yet for this checklist.</p>
        )}

        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Submit checklist
        </button>
      </form>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-gray-900">Your submissions</h2>
      <div className="space-y-2">
        {past.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        {past.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
          >
            <span className="capitalize text-gray-700">{c.status}</span>
            <span className="text-xs text-gray-400">
              {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
