import 'server-only'
import { desc, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepDeadlines } from '@/db/schema'
import type { BoardProject } from '@/app/_components/project-steps-board'
import { findStep, lastStepN, projectComplete, type UserRole, type WorkflowRole } from '@/lib/workflow'
import { getLiveWorkflowSteps, assigneeGatedRoles, getStepAssigneeGate } from '@/lib/workflow-graph'

// Shared loader for the projects board (both PM pages + the /api/projects poll).
// Returns every project newest-first, each with its per-step deadline map (REQ-G05).
//
// Quick task 260728-cfn: `viewerRole` is OPTIONAL and additive — when omitted,
// behaviour is byte-identical to today (every gatedToUserId is null). When
// supplied, `gatedToUserId` is resolved per-project following lib/my-work.ts's
// bounded-prefetch discipline: getLiveWorkflowSteps() is called ONCE, outside
// the per-project loop, and the gate lookup itself only runs for a project
// whose CURRENT step is actually assignee-gated for THIS viewer's role — most
// projects (paused, complete, or on an ungated step) skip the DB round trip
// entirely, same as getMyWork's gateByProjectId.
export async function getBoardProjects(viewerRole?: UserRole): Promise<BoardProject[]> {
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

  const gateByProjectId = new Map<string, string | null>()
  if (viewerRole) {
    const steps = await getLiveWorkflowSteps()
    const lastN = lastStepN(steps)
    for (const p of rows) {
      if (p.status === 'paused' || projectComplete(p.currentStep, lastN)) continue
      const step = findStep(steps, p.currentStep)
      if (step && assigneeGatedRoles(step.key).includes(viewerRole as WorkflowRole)) {
        gateByProjectId.set(p.id, await getStepAssigneeGate('live', p.id, step.key))
      }
    }
  }

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    currentStep: p.currentStep,
    status: p.status,
    stepDeadlines: byProject.get(p.id) ?? {},
    gatedToUserId: gateByProjectId.get(p.id) ?? null,
  }))
}
