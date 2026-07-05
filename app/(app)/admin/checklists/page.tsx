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
import {
  CreateChecklistForm,
  RestoreChecklistButton,
} from '@/app/_components/checklist-admin-controls'

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

  const activeDefs = defs.filter((d) => d.isActive)
  const inactiveDefs = defs.filter((d) => !d.isActive)
  const selected = selectedSlug ? defs.find((d) => d.slug === selectedSlug) : undefined

  let items: EditableItem[] = []
  if (selected) {
    items = await db
      .select({
        id: checklistTemplateItems.id,
        label: checklistTemplateItems.label,
        helpText: checklistTemplateItems.helpText,
        itemType: checklistTemplateItems.itemType,
        responseOptions: checklistTemplateItems.responseOptions,
        isPhotoRequired: checklistTemplateItems.isPhotoRequired,
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
        Create a checklist, or pick one to edit its questions. Only super admins can author
        checklists.
      </p>

      <CreateChecklistForm />

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {activeDefs.map((d) => (
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

      {inactiveDefs.length > 0 && (
        <details className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
            Deactivated checklists ({inactiveDefs.length})
          </summary>
          <div className="mt-3 space-y-2">
            {inactiveDefs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <a
                    href={`/admin/checklists?def=${d.slug}`}
                    className="font-medium text-gray-600 hover:text-primary hover:underline"
                  >
                    {d.name}
                  </a>
                  <span className="text-xs text-gray-400">
                    {TARGET_LABEL[d.targetRole] ?? d.targetRole}
                  </span>
                </span>
                <RestoreChecklistButton definitionId={d.id} />
              </div>
            ))}
          </div>
        </details>
      )}

      {selected ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-gray-900">
            {selected.name}
            {!selected.isActive && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Deactivated
              </span>
            )}
          </h2>
          <p className="mb-3 text-xs text-gray-400">Edit the questions on this checklist.</p>
          <ChecklistEditor
            definition={{
              id: selected.id,
              name: selected.name,
              slug: selected.slug,
              targetRole: selected.targetRole,
              isActive: selected.isActive,
            }}
            items={items}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Select a checklist above to edit its questions.
        </p>
      )}
    </div>
  )
}
