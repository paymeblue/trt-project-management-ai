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
import EscalateButton from '@/app/_components/escalate-button'
import {
  REQUIRED_PHOTOS,
  findStep,
  canActOnGraphStep,
  stepRequiredKinds,
  dualRoleStatus,
  type UserRole,
} from '@/lib/workflow'
import {
  getLiveWorkflowSteps,
  getDualRoleConfirmations,
  stepPositionMismatch,
  POSITION_MISMATCH_MESSAGE,
  stepAssigneeMismatch,
  ASSIGNEE_MISMATCH_MESSAGE,
} from '@/lib/workflow-graph'

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
  // quick task readiness-ack-sync: true when this checklist is only ONE of
  // several requirements stacked on the step (e.g. 'readiness' as an
  // additional kind alongside a yes_no_upload primary) — a single
  // submission here fulfills its own requirement but does NOT necessarily
  // advance the project on its own (see actions/checklists.ts's
  // partial-fulfillment branch). Affects only the banner copy below.
  let workflowStepMulti = false
  // quick task 260727-pd3 (BUG-3/BUG-4): pre-submit progress copy for a
  // dual-role step (e.g. materials_readiness) — set only when the step is
  // dual-role, so the banner below can tell the truth ("submitting here
  // records only your half") instead of promising unconditional advancement.
  let workflowDualText: string | null = null
  let workflowDualRolesLabel = ''

  if (projectId && stepN) {
    const [proj] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
    const steps = await getLiveWorkflowSteps()
    const step = findStep(steps, stepN)
    if (!proj || !step) {
      workflowNotice = 'This project step could not be found.'
    } else if (step.slug !== slug) {
      workflowNotice = 'This checklist does not match the requested project step.'
    } else if (proj.currentStep !== stepN) {
      workflowNotice =
        proj.currentStep > stepN
          ? 'This step has already been completed for this project.'
          : 'This step is not active yet for this project.'
    } else if (!canActOnGraphStep(step, role as UserRole)) {
      workflowNotice = 'It is not your turn to act on this step.'
    } else if (await stepPositionMismatch(userId, step)) {
      // Quick task 260727-g7a: anti-stranding — the server gate in
      // actions/workflow.ts + actions/checklists.ts is authoritative; this
      // exists so a wrong-position caller is told BEFORE filling the form,
      // not after submitting a checklist that can never advance the step.
      workflowNotice = POSITION_MISMATCH_MESSAGE
    } else if (await stepAssigneeMismatch(userId, projectId, step, role as UserRole)) {
      // Quick task 260728-cfn: anti-stranding — the authoritative gate lives
      // in actions/checklists.ts / actions/readiness.ts / actions/workflow.ts
      // and is unchanged; this branch exists so a non-assigned officer is
      // told BEFORE filling a multi-step checklist, not after submitting one
      // that can never advance the step. Runs AFTER the role check above, so
      // stepAssigneeMismatch's role-scoped fast path means a factory_pm on
      // the dual-role materials_readiness step never triggers it.
      workflowNotice = ASSIGNEE_MISMATCH_MESSAGE
    } else {
      workflowProjectId = projectId
      workflowStepN = stepN
      workflowStepMulti = stepRequiredKinds(step).length > 1
      if (step.dualRoles?.length) {
        const confirmed = await getDualRoleConfirmations(projectId, step.stepDefId)
        const status = dualRoleStatus(step, confirmed)
        workflowDualText = status.progressText
        workflowDualRolesLabel = status.rolesLabel
      }
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

      {/* quick task 260727-pd3 (BUG-3/BUG-4): dual-role FIRST — a dual-role
          step (e.g. materials_readiness) is stepRequiredKinds.length === 1,
          so the OLD two-way branch fell through to the unconditional "will
          advance" promise below, which is false: submitting here records
          only the caller's half. Amber/caveat treatment (workflowNotice's
          palette) so it reads as a caveat, not a confirmation. */}
      {workflowProjectId && workflowStepN && workflowDualText ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This step needs BOTH {workflowDualRolesLabel} to confirm independently — submitting here records only
          your half. {workflowDualText}
        </div>
      ) : (
        workflowProjectId &&
        workflowStepN && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary">
            {workflowStepMulti
              ? 'Completing this checklist fulfills one requirement of this step — check the step page for anything else still needed.'
              : 'Completing this checklist will advance the project to its next step.'}
          </div>
        )
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
        requirePhotos={REQUIRED_PHOTOS[def.slug] ?? 0}
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

      {workflowProjectId && (
        <EscalateButton
          projectId={workflowProjectId}
          checklistLabel={def.name}
          viewerRole={role as UserRole}
          checklistSlug={def.slug}
          stepN={workflowStepN}
        />
      )}

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
