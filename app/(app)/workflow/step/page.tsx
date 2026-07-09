import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { getStepByKey } from '@/lib/workflow-graph'
import { canRoleActOnStep, roleDashboard, type UserRole } from '@/lib/workflow'
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
  const graph = typeof sp.graph === 'string' ? sp.graph : 'test'
  const dashboard = roleDashboard(role)

  if (!projectId || !stepKey) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <p className="mt-6 text-gray-500">Missing projectId or step.</p>
      </div>
    )
  }

  const step = await getStepByKey(graph, stepKey)

  if (!step) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <p className="mt-6 text-gray-500">This workflow step could not be found.</p>
      </div>
    )
  }

  if (!canRoleActOnStep(step.role, role as UserRole)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <p className="mt-6 text-gray-500">It is not your turn to act on this step.</p>
      </div>
    )
  }

  // v2.0 Phase 19: a step may additionally be narrowed to one exact
  // users.position value (e.g. only the Head Designer, not any Design/
  // Architect user). Fetched fresh, not from the session, since position
  // can change post-signup via the self-service profile flow.
  if (step.requiredPosition) {
    const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actingUser?.position !== step.requiredPosition) {
      return (
        <div className="mx-auto max-w-2xl px-6 py-8">
          <a href={dashboard} className="text-sm text-primary hover:underline">
            ← Dashboard
          </a>
          <p className="mt-6 text-gray-500">
            This step is restricted to a specific title, and your account is not set to it.
          </p>
        </div>
      )
    }
  }

  let body: React.ReactNode
  switch (step.kind) {
    case 'yes_no_upload':
      body = <YesNoUploadStep projectId={projectId} stepDefId={step.id} />
      break
    case 'approval':
      body = <ApprovalStep projectId={projectId} stepDefId={step.id} />
      break
    case 'assignment': {
      const candidates = step.targetRoles?.length
        ? await db
            .select({ id: users.id, name: users.name, role: users.role })
            .from(users)
            .where(inArray(users.role, step.targetRoles))
        : []
      body = (
        <AssignmentStep
          projectId={projectId}
          stepDefId={step.id}
          targetRoles={step.targetRoles}
          candidates={candidates}
        />
      )
      break
    }
    default:
      body = (
        <p className="text-sm text-gray-500">
          This step kind (“{step.kind}”) uses its existing route — not in scope for this minimal
          renderer.
        </p>
      )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={dashboard} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step.label}</h1>
      {body}
    </div>
  )
}
