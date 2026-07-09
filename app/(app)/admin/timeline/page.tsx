import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, users } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import {
  findStep,
  lastStepN,
  projectComplete,
  canRoleActOnStep,
  stepHref,
  workflowRoleLabel,
  type UserRole,
} from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'

export const dynamic = 'force-dynamic'

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleDateString() : '—'
}

export default async function AdminTimelinePage() {
  const { role } = await requireAdmin()

  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt))

  // All step completions (with the actor's name) for the per-project history.
  const completions = await db
    .select({
      projectId: projectStepCompletions.projectId,
      stepKey: projectStepCompletions.stepKey,
      stepN: projectStepCompletions.stepN,
      notes: projectStepCompletions.notes,
      completedAt: projectStepCompletions.completedAt,
      actor: users.name,
    })
    .from(projectStepCompletions)
    .leftJoin(users, eq(projectStepCompletions.completedBy, users.id))
    .orderBy(asc(projectStepCompletions.stepN))

  const byProject = new Map<string, typeof completions>()
  for (const c of completions) {
    const list = byProject.get(c.projectId) ?? []
    list.push(c)
    byProject.set(c.projectId, list)
  }

  const steps = await getLiveWorkflowSteps()
  const lastStep = lastStepN(steps)
  const now = new Date()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">Projects Timeline</h1>
      <p className="mb-6 text-sm text-gray-500">
        Every project, its current workflow step and deadline.
        <span className="ml-1 font-medium text-green-700">Green</span> = delivered on time,
        <span className="ml-1 font-medium text-red-700">red</span> = past deadline.
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Current Step</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No projects yet — create one from “New Project”.
                </td>
              </tr>
            )}
            {rows.map((p) => {
              const complete = projectComplete(p.currentStep, lastStep)
              const overdue = !complete && !!p.deliveryDate && now > p.deliveryDate
              const deliveredLate =
                complete && !!p.deliveryDate && p.updatedAt > p.deliveryDate

              const tone = complete
                ? deliveredLate
                  ? 'red'
                  : 'green'
                : overdue
                  ? 'red'
                  : 'amber'
              const toneCls =
                tone === 'green'
                  ? 'bg-green-100 text-green-700'
                  : tone === 'red'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'

              const step = findStep(steps, p.currentStep)
              const stepLabel = complete
                ? 'Delivered'
                : step
                  ? `${step.label} · ${p.currentStep}/${lastStep}`
                  : `Step ${p.currentStep}`

              // Operations / Super Admin can act directly on their own steps (e.g.
              // Approval to Commence Installation).
              const canAct =
                !complete &&
                !!step &&
                step.kind !== 'creation' &&
                step.role === 'operations' &&
                canRoleActOnStep(step.role, role as UserRole)
              const actHref = canAct && step ? stepHref(step, p.id) : null

              const history = byProject.get(p.id) ?? []

              return (
                <tr key={p.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.location ?? 'No location'}</p>
                    {history.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-primary">
                          History ({history.length})
                        </summary>
                        <ul className="mt-2 space-y-1 border-l border-gray-200 pl-3">
                          {history.map((h, i) => {
                            const s = findStep(steps, h.stepN)
                            return (
                              <li key={i} className="text-xs text-gray-500">
                                <span className="font-medium text-gray-700">
                                  {s ? s.label : h.stepKey}
                                </span>{' '}
                                — {h.actor ?? 'Unknown'} ·{' '}
                                {new Date(h.completedAt).toLocaleString()}
                                {h.notes ? ` · “${h.notes}”` : ''}
                              </li>
                            )
                          })}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {stepLabel}
                    {!complete && step && (
                      <p className="text-xs text-gray-400">
                        {actHref ? (
                          <a href={actHref} className="font-semibold text-primary hover:underline">
                            Action needed →
                          </a>
                        ) : (
                          `Waiting on ${workflowRoleLabel(step.role)}`
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmt(p.deliveryDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toneCls}`}>
                      {complete
                        ? deliveredLate
                          ? 'Delivered (late)'
                          : 'Delivered'
                        : overdue
                          ? 'Overdue'
                          : 'In progress'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
