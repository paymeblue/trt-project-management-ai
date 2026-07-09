import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { stepBypassRequests, projects, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { findStep, lastStepN, workflowRoleLabel, Roles } from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'
import ApprovalActions from '@/app/_components/approval-actions'

export const dynamic = 'force-dynamic'

// Higher-authority approval queue (REQ-G09) — super admin only.
export default async function ApprovalsPage() {
  const { role } = await verifySession()

  if (role !== Roles.SuperAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Only a super admin can review bypass requests.
        </p>
      </div>
    )
  }

  const rows = await db
    .select({
      id: stepBypassRequests.id,
      stepN: stepBypassRequests.stepN,
      reason: stepBypassRequests.reason,
      createdAt: stepBypassRequests.createdAt,
      projectName: projects.name,
      requesterName: users.name,
    })
    .from(stepBypassRequests)
    .leftJoin(projects, eq(stepBypassRequests.projectId, projects.id))
    .leftJoin(users, eq(stepBypassRequests.requestedBy, users.id))
    .where(eq(stepBypassRequests.status, 'pending'))
    .orderBy(desc(stepBypassRequests.createdAt))

  const steps = await getLiveWorkflowSteps()
  const lastStep = lastStepN(steps)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Approvals</h1>
      <p className="mb-6 text-sm text-gray-500">
        Requests to advance a step without completing its checklist. Approving advances the step
        and records who approved it and why.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          No pending approval requests.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const step = findStep(steps, r.stepN)
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{r.projectName ?? 'Unknown project'}</p>
                  <p className="text-xs text-gray-500">
                    Step {r.stepN}/{lastStep}: {step?.label ?? '—'}
                    {step ? ` · ${workflowRoleLabel(step.role)}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {r.reason || <span className="text-gray-400">No reason given</span>}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Requested by {r.requesterName ?? 'unknown'} ·{' '}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <ApprovalActions requestId={r.id} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
