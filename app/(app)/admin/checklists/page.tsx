import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { checklistDefinitions, checklistTemplateItems } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { Roles } from '@/lib/workflow'

const TARGET_LABEL: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  both: 'Both PMs',
}
import ChecklistEditor, { type EditableItem } from '@/app/_components/checklist-editor'

export const dynamic = 'force-dynamic'

// Super-admin entry point to author checklist questions (REQ-G01) without needing
// to navigate into a specific project's step.
export default async function AdminChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{ def?: string }>
}) {
  const { role } = await verifySession()
  const { def: selectedSlug } = await searchParams

  if (role !== Roles.SuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Checklists</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Only a super admin can edit checklists.
        </p>
      </div>
    )
  }

  const defs = await db
    .select()
    .from(checklistDefinitions)
    .orderBy(asc(checklistDefinitions.name))

  const selected = selectedSlug ? defs.find((d) => d.slug === selectedSlug) : undefined

  let items: EditableItem[] = []
  if (selected) {
    items = await db
      .select({
        id: checklistTemplateItems.id,
        label: checklistTemplateItems.label,
        helpText: checklistTemplateItems.helpText,
      })
      .from(checklistTemplateItems)
      .where(
        and(
          eq(checklistTemplateItems.definitionId, selected.id),
          eq(checklistTemplateItems.isActive, true),
        ),
      )
      .orderBy(asc(checklistTemplateItems.step), asc(checklistTemplateItems.sortOrder))
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Checklists</h1>
      <p className="mb-6 text-sm text-gray-500">
        Pick a checklist to edit its questions. Only super admins can author checklists.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {defs.map((d) => (
          <a
            key={d.id}
            href={`/admin/checklists?def=${d.slug}`}
            className={`flex items-center justify-between rounded-lg border p-3 text-sm shadow-sm transition hover:shadow-md ${
              selected?.id === d.id ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
            }`}
          >
            <span className="font-semibold text-gray-900">{d.name}</span>
            <span className="text-xs text-gray-400">
              {TARGET_LABEL[d.targetRole] ?? d.targetRole}
            </span>
          </a>
        ))}
      </div>

      {selected ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-gray-900">{selected.name}</h2>
          <p className="mb-3 text-xs text-gray-400">Edit the questions on this checklist.</p>
          <ChecklistEditor definitionId={selected.id} items={items} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Select a checklist above to edit its questions.
        </p>
      )}
    </div>
  )
}
