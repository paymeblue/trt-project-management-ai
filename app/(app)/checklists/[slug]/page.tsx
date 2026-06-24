import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  checklistDefinitions,
  checklistTemplateItems,
  checklists,
  projects,
} from '@/db/schema'
import { verifySession } from '@/lib/dal'
import ChecklistWizard, { type WizardItem } from '@/app/_components/checklist-wizard'
import { stepByN, canRoleActOnStep, type UserRole } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
  operations: '/admin/dashboard',
}

const BOARD: Record<string, string> = {
  factory_pm: '/factory-pm/projects',
  site_pm: '/site-pm/projects',
  super_admin: '/admin/timeline',
  operations: '/admin/timeline',
}

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ projectId?: string; step?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const { userId, role } = await verifySession()

  // Optional project workflow context (when launched from the project board).
  const projectId = typeof sp.projectId === 'string' ? sp.projectId : null
  const stepN = sp.step ? Number(sp.step) : null
  const returnTo = BOARD[role] ?? null

  let workflowProjectId: string | null = null
  let workflowStepN: number | null = null
  let workflowNotice: string | null = null

  if (projectId && stepN) {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    const step = stepByN(stepN)
    if (!proj || !step) {
      workflowNotice = 'This project step could not be found.'
    } else if (step.slug !== slug) {
      workflowNotice = 'This checklist does not match the requested project step.'
    } else if (proj.currentStep !== stepN) {
      workflowNotice =
        proj.currentStep > stepN
          ? 'This step has already been completed for this project.'
          : 'This step is not active yet for this project.'
    } else if (!canRoleActOnStep(step.role, role as UserRole)) {
      workflowNotice = 'It is not your turn to act on this step.'
    } else {
      workflowProjectId = projectId
      workflowStepN = stepN
    }
  } else if (projectId) {
    // Optional, non-blocking checklist tied to a project (e.g. Change Request):
    // recorded against the project but never advances the workflow.
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    if (proj) workflowProjectId = projectId
  }

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
      <a href={workflowProjectId ? returnTo ?? DASH[role] : DASH[role]} className="text-sm text-primary hover:underline">
        ← {workflowProjectId ? 'Back to projects' : 'Dashboard'}
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{def.name}</h1>

      {workflowNotice && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {workflowNotice}{' '}
          {returnTo && (
            <a href={returnTo} className="font-semibold underline">
              Back to projects
            </a>
          )}
        </div>
      )}

      {workflowProjectId && workflowStepN && (
        <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary">
          Completing this checklist will advance the project to its next step.
        </div>
      )}

      {workflowProjectId && !workflowStepN && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
          Optional checklist — recorded against this project but it does not change the step order.
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Create new
      </h2>
      <ChecklistWizard
        definitionId={def.id}
        slug={def.slug}
        projectId={workflowProjectId}
        expectedStepN={workflowStepN}
        returnTo={returnTo}
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

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        View submissions
      </h2>
      <div className="space-y-2">
        {past.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        {past.map((c) => (
          <a
            key={c.id}
            href={`/checklists/${def.slug}/${c.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-primary hover:shadow-md"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">description</span>
              <span className="capitalize text-gray-700">{c.status}</span>
            </span>
            <span className="text-xs text-gray-400">
              {c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
