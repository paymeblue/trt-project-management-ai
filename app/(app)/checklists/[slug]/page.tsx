import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ChecklistWizard, { type WizardItem } from '@/app/_components/checklist-wizard'

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
    .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder))

  const past = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.definitionId, def.id), eq(checklists.createdBy, userId)))
    .orderBy(desc(checklists.createdAt))

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{def.name}</h1>

      <ChecklistWizard
        definitionId={def.id}
        slug={def.slug}
        items={items.map(
          (i): WizardItem => ({
            id: i.id,
            label: i.label,
            helpText: i.helpText,
            itemType: i.itemType,
            responseOptions: i.responseOptions,
            step: i.step,
            sectionTitle: i.sectionTitle,
          }),
        )}
      />

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
