import 'server-only'
import { desc, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepDeadlines } from '@/db/schema'
import type { BoardProject } from '@/app/_components/project-steps-board'

// Shared loader for the projects board (both PM pages + the /api/projects poll).
// Returns every project newest-first, each with its per-step deadline map (REQ-G05).
export async function getBoardProjects(): Promise<BoardProject[]> {
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt))

  const ids = rows.map((r) => r.id)
  const deadlineRows = ids.length
    ? await db
        .select({
          projectId: projectStepDeadlines.projectId,
          stepN: projectStepDeadlines.stepN,
          deadline: projectStepDeadlines.deadline,
        })
        .from(projectStepDeadlines)
        .where(inArray(projectStepDeadlines.projectId, ids))
    : []

  const byProject = new Map<string, Record<string, string>>()
  for (const d of deadlineRows) {
    const m = byProject.get(d.projectId) ?? {}
    m[String(d.stepN)] = d.deadline.toISOString()
    byProject.set(d.projectId, m)
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    currentStep: p.currentStep,
    status: p.status,
    stepDeadlines: byProject.get(p.id) ?? {},
  }))
}
