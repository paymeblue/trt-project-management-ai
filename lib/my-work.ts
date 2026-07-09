import 'server-only'
import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepDeadlines } from '@/db/schema'
import {
  canRoleActOnStep,
  findStep,
  lastStepN,
  projectComplete,
  type UserRole,
  type MyWork,
} from '@/lib/workflow'
import { getLiveWorkflowSteps } from '@/lib/workflow-graph'

// Computes the in-progress projects (for the header switcher) and the subset
// awaiting THIS user's action (for the forcing gate). Shared by the app layout
// (initial render) and the /api/my-work polling endpoint.
export async function getMyWork(role: UserRole): Promise<MyWork> {
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

  const activeProjects = active.map((p) => ({
    id: p.id,
    name: p.name,
    stepN: p.currentStep,
    deadline: currentDeadline(p)?.toISOString() ?? null,
  }))

  const pending = active
    .filter((p) => {
      const step = findStep(steps, p.currentStep)
      return step ? canRoleActOnStep(step.role, role) : false
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
