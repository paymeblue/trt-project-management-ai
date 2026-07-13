import { eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { projects, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { getStepByKey, getStepAssigneeGate } from '@/lib/workflow-graph'
import { canRoleActOnStep, roleDashboard, stepRequiredKinds, type UserRole, type StepKind } from '@/lib/workflow'
import YesNoUploadStep from '@/app/_components/workflow-kinds/yes-no-upload-step'
import ApprovalStep from '@/app/_components/workflow-kinds/approval-step'
import AssignmentStep from '@/app/_components/workflow-kinds/assignment-step'

export const dynamic = 'force-dynamic'

// Minimal server route (WF-03, plan 05): resolves a graph step by
// projectId + step key and dispatches to the matching kind renderer.
// Not hardcoded to a single graph — 'graph' defaults to 'test' since this
// route currently only serves the test graph built in plan 04; Phase 17
// will point real project steps at 'live' once migrated.
export default async function WorkflowStepPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; step?: string; graph?: string }>
}) {
  const sp = await searchParams
  const { userId, role } = await verifySession()

  const projectId = typeof sp.projectId === 'string' ? sp.projectId : null
  const stepKey = typeof sp.step === 'string' ? sp.step : null
  const graph = typeof sp.graph === 'string' ? sp.graph : 'live'
  const dashboard = roleDashboard(role)

  if (!projectId || !stepKey) {
    redirect(dashboard)
  }

  // Fetched once here (not passed down as a prop from elsewhere) so
  // AssignmentStep's post-assignment confirmation can name the project.
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId!)).limit(1)
  const projectName = proj?.name ?? null

  const step = await getStepByKey(graph, stepKey)

  if (!step) {
    redirect(dashboard)
  }

  function denied(message: string) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step!.label}</h1>
        <p className="text-sm text-error">{message}</p>
      </div>
    )
  }

  if (!canRoleActOnStep(step.role, role as UserRole)) {
    return denied('Not your step.')
  }

  // v2.0 Phase 19: a step may additionally be narrowed to one exact
  // users.position value (e.g. only the Head Designer, not any Design/
  // Architect user). Fetched fresh, not from the session, since position
  // can change post-signup via the self-service profile flow.
  if (step.requiredPosition) {
    const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actingUser?.position !== step.requiredPosition) {
      return denied('This step is restricted to a specific title, and your account is not set to it.')
    }
  }

  // Quick task 260713-ekr (security fix, defense-in-depth): a design/architect
  // user who is not the assignee chosen at this step's governing assignment
  // step never even sees the form — clean denial, mirroring authorizeStep's
  // server-action boundary check.
  const gateUserId = await getStepAssigneeGate(graph, projectId!, step.key)
  if (gateUserId && gateUserId !== userId) {
    return denied('This step is assigned to a specific person — only they can act on it.')
  }

  // v2.0 Phase 18.1: a step may require MORE than one fulfillment kind
  // (primary + additionalKinds) — render one sub-form per required kind.
  // Each sub-form's own "Complete step" button calls the same
  // completeStepAction; the server only accepts it once every required
  // kind has been fulfilled (lib/workflow-graph.ts completeGraphStep), so
  // clicking any one of them once everything is done is enough.
  const requiredKinds = stepRequiredKinds(step)
  const multi = requiredKinds.length > 1

  async function renderKind(kind: StepKind): Promise<React.ReactNode> {
    switch (kind) {
      case 'yes_no_upload':
        return <YesNoUploadStep projectId={projectId!} stepDefId={step!.id} redirectTo={dashboard} />
      case 'approval':
        return <ApprovalStep projectId={projectId!} stepDefId={step!.id} redirectTo={dashboard} />
      case 'assignment': {
        const candidates = step!.targetRoles?.length
          ? await db
              .select({ id: users.id, name: users.name, role: users.role })
              .from(users)
              .where(inArray(users.role, step!.targetRoles))
          : []
        return (
          <AssignmentStep
            projectId={projectId!}
            stepDefId={step!.id}
            targetRoles={step!.targetRoles}
            candidates={candidates}
            stepLabel={step!.label}
            projectName={projectName}
            redirectTo={dashboard}
          />
        )
      }
      default:
        return (
          <p className="text-sm text-gray-500">
            The &ldquo;{kind}&rdquo; requirement on this step uses its own existing route — not
            supported inside this minimal combined view. Complete it from its usual page.
          </p>
        )
    }
  }

  const sections = await Promise.all(
    requiredKinds.map(async (kind) => ({ kind, node: await renderKind(kind) })),
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={dashboard} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step.label}</h1>
      {multi && (
        <p className="mb-4 text-xs text-gray-500">
          This step needs ALL {requiredKinds.length} of the following before it&rsquo;s complete.
        </p>
      )}
      <div className="space-y-6">
        {sections.map(({ kind, node }, i) => (
          <div key={kind}>
            {multi && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Requirement {i + 1} of {requiredKinds.length}: {kind.replace(/_/g, ' ')}
              </p>
            )}
            {node}
          </div>
        ))}
      </div>
    </div>
  )
}
