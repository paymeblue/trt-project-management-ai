import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepCompletions, users } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import {
  findStep,
  lastStepN,
  projectComplete,
  canActOnGraphStep,
  stepHref,
  workflowRoleLabel,
  type UserRole,
} from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'
import AdminTimelineTable from '@/app/_components/admin-timeline-table'
import type { TimelineRow } from './table-utils'

export const dynamic = 'force-dynamic'

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

  const timelineRows: TimelineRow[] = rows.map((p) => {
    const complete = projectComplete(p.currentStep, lastStep)
    const overdue = !complete && !!p.deliveryDate && now > p.deliveryDate
    const deliveredLate = complete && !!p.deliveryDate && p.updatedAt > p.deliveryDate

    const tone: TimelineRow['tone'] = complete ? (deliveredLate ? 'red' : 'green') : overdue ? 'red' : 'amber'
    const statusLabel = complete
      ? deliveredLate
        ? 'Delivered (late)'
        : 'Delivered'
      : overdue
        ? 'Overdue'
        : 'In progress'

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
      canActOnGraphStep(step, role as UserRole)
    const actHref = canAct && step ? stepHref(step, p.id, role as UserRole) : null
    const waitingLabel = !complete && step && !actHref ? `Waiting on ${workflowRoleLabel(step.role)}` : null

    const history = byProject.get(p.id) ?? []

    return {
      id: p.id,
      name: p.name,
      location: p.location ?? 'No location',
      client: p.customerName ?? '',
      currentStep: p.currentStep,
      lastStep,
      stepLabel,
      statusLabel,
      tone,
      status: p.status,
      paymentStatus: p.paymentStatus,
      deliveryDate: p.deliveryDate ? new Date(p.deliveryDate).toISOString() : null,
      createdAt: new Date(p.createdAt).toISOString(),
      updatedAt: new Date(p.updatedAt).toISOString(),
      complete,
      waitingLabel,
      actHref,
      auditHref: role === 'super_admin' ? `/admin/projects/${p.id}/audit` : null,
      history: history.map((h) => {
        const s = findStep(steps, h.stepN)
        return {
          label: s ? s.label : h.stepKey,
          actor: h.actor ?? 'Unknown',
          completedAt: new Date(h.completedAt).toISOString(),
          notes: h.notes ?? null,
        }
      }),
    }
  })

  const stepOptions = steps.map((s) => ({ n: s.n, label: s.label }))

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

      <AdminTimelineTable rows={timelineRows} steps={stepOptions} />
    </div>
  )
}
