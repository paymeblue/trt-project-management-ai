import 'server-only'
import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepDeadlines } from '@/db/schema'
import {
  canActOnGraphStep,
  findStep,
  lastStepN,
  projectComplete,
  type UserRole,
  type MyWork,
} from '@/lib/workflow'
import { getLiveWorkflowSteps, getStepAssigneeGate, assigneeGoverningStepKey } from '@/lib/workflow-graph'

// Computes the in-progress projects (for the header switcher) and the subset
// awaiting THIS user's action (for the forcing gate). Shared by the app layout
// (initial render) and the /api/my-work polling endpoint.
//
// `userId` (quick task 260713-ekr, security fix): needed to resolve each
// active project's assignee gate (getStepAssigneeGate) and to exclude a
// gated project from `pending` when the caller isn't its assignee.
export async function getMyWork(role: UserRole, userId: string): Promise<MyWork> {
  const steps = await getLiveWorkflowSteps()
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      currentStep: projects.currentStep,
      deliveryDate: projects.deliveryDate,
      status: projects.status,
    })
    .from(projects)

  // Paused projects are excluded from active work: no forced gate, no header
  // "Act" until a super admin resumes them (REQ-G07).
  const active = rows.filter(
    (p) => !projectComplete(p.currentStep, lastStepN(steps)) && p.status !== 'paused',
  )

  // Per-step deadlines (REQ-G05): the deadline shown for a project is the one
  // set for its CURRENT step, falling back to the project-wide delivery date.
  const activeIds = active.map((p) => p.id)
  const deadlineRows = activeIds.length
    ? await db
        .select({
          projectId: projectStepDeadlines.projectId,
          stepN: projectStepDeadlines.stepN,
          deadline: projectStepDeadlines.deadline,
        })
        .from(projectStepDeadlines)
        .where(inArray(projectStepDeadlines.projectId, activeIds))
    : []
  const stepDeadline = new Map<string, Date>()
  for (const d of deadlineRows) stepDeadline.set(`${d.projectId}:${d.stepN}`, d.deadline)
  const currentDeadline = (p: { id: string; currentStep: number; deliveryDate: Date | null }) =>
    stepDeadline.get(`${p.id}:${p.currentStep}`) ?? p.deliveryDate

  // Quick task 260713-ekr (security fix): resolve each active project's
  // assignee gate ONCE (reused for both activeProjects.gatedToUserId and the
  // pending filter below). The DB lookup only runs for projects whose
  // current step is actually one of the assignee-gated design steps — most
  // active projects skip it entirely (assigneeGoverningStepKey returns null).
  const gateByProjectId = new Map<string, string | null>()
  for (const p of active) {
    const step = findStep(steps, p.currentStep)
    const gate =
      step && assigneeGoverningStepKey(step.key) !== null
        ? await getStepAssigneeGate('live', p.id, step.key)
        : null
    gateByProjectId.set(p.id, gate)
  }

  const activeProjects = active.map((p) => ({
    id: p.id,
    name: p.name,
    stepN: p.currentStep,
    deadline: currentDeadline(p)?.toISOString() ?? null,
    gatedToUserId: gateByProjectId.get(p.id) ?? null,
  }))

  const pending = active
    .filter((p) => {
      const step = findStep(steps, p.currentStep)
      if (!step || !canActOnGraphStep(step, role)) return false
      const gate = gateByProjectId.get(p.id) ?? null
      if (gate && gate !== userId) return false
      return true
    })
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      stepN: p.currentStep,
      deadline: currentDeadline(p)?.toISOString() ?? null,
    }))
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    })

  return { activeProjects, pending }
}
