import 'server-only'
import { db } from '@/db'
import { projects } from '@/db/schema'
import {
  stepByN,
  canRoleActOnStep,
  isProjectComplete,
  type UserRole,
  type MyWork,
} from '@/lib/workflow'

// Computes the in-progress projects (for the header switcher) and the subset
// awaiting THIS user's action (for the forcing gate). Shared by the app layout
// (initial render) and the /api/my-work polling endpoint.
export async function getMyWork(role: UserRole): Promise<MyWork> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      currentStep: projects.currentStep,
      deliveryDate: projects.deliveryDate,
    })
    .from(projects)

  const active = rows.filter((p) => !isProjectComplete(p.currentStep))

  const activeProjects = active.map((p) => ({
    id: p.id,
    name: p.name,
    stepN: p.currentStep,
    deadline: p.deliveryDate ? p.deliveryDate.toISOString() : null,
  }))

  const pending = active
    .filter((p) => {
      const step = stepByN(p.currentStep)
      return step ? canRoleActOnStep(step.role, role) : false
    })
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      stepN: p.currentStep,
      deadline: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    }))
    .sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    })

  return { activeProjects, pending }
}
