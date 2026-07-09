import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  workflowStepDefinitions,
  workflowStepEdges,
  projectStepCompletions,
} from '@/db/schema'
import type { GraphStep, WorkflowRole } from '@/lib/workflow'

// ── Read engine for the DB-driven workflow graph (Phase 16, WF-01/WF-02) ──
// Every function reads live from the database on each call — no module-level
// array cache — so a step inserted directly into the tables is reflected
// without a code deploy. This module must stay server-only (see
// lib/workflow.ts header comment: that file must NOT import db/server-only).

function toGraphStep(row: typeof workflowStepDefinitions.$inferSelect): GraphStep {
  return {
    id: row.id,
    graph: row.graph,
    key: row.stepKey,
    label: row.label,
    // `role`/`targetRole` are `roleEnum` at the DB layer (which also carries
    // the department roles `design`/`production`), but workflow-step roles
    // are always one of the 4 WorkflowRole values that actually own steps.
    role: row.role as WorkflowRole,
    kind: row.fulfillmentKind,
    slug: row.checklistSlug,
    targetRole: row.targetRole as WorkflowRole | null,
    isOptional: row.isOptional,
    orderIndex: row.orderIndex,
  }
}

export async function getGraphSteps(graph = 'live'): Promise<GraphStep[]> {
  const rows = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, graph))
    .orderBy(workflowStepDefinitions.orderIndex)
  return rows.map(toGraphStep)
}

export async function getStepByKey(graph: string, key: string): Promise<GraphStep | undefined> {
  const [row] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, graph), eq(workflowStepDefinitions.stepKey, key)))
    .limit(1)
  return row ? toGraphStep(row) : undefined
}

export async function getStepById(id: string): Promise<GraphStep | undefined> {
  const [row] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.id, id))
    .limit(1)
  return row ? toGraphStep(row) : undefined
}

export async function getGraphEdges(
  graph = 'live',
): Promise<{ fromStepId: string; toStepId: string }[]> {
  return db
    .select({
      fromStepId: workflowStepEdges.fromStepId,
      toStepId: workflowStepEdges.toStepId,
    })
    .from(workflowStepEdges)
    .where(eq(workflowStepEdges.graph, graph))
}

// stepDefId rows recorded for this project — skipped-optional-step completions
// count as satisfied predecessors for join readiness, so they are included.
export async function getCompletedStepIds(projectId: string): Promise<Set<string>> {
  const rows = await db
    .select({ stepDefId: projectStepCompletions.stepDefId })
    .from(projectStepCompletions)
    .where(eq(projectStepCompletions.projectId, projectId))
  return new Set(rows.map((r) => r.stepDefId).filter((id): id is string => id !== null))
}

// The join-readiness core (WF-05): a step is actionable iff it is not already
// completed AND every incoming edge's fromStepId is completed. A step with no
// incoming edges is an entry step and is always actionable (until completed).
export async function getActionableSteps(
  projectId: string,
  graph = 'live',
): Promise<GraphStep[]> {
  const [steps, edges, completed] = await Promise.all([
    getGraphSteps(graph),
    getGraphEdges(graph),
    getCompletedStepIds(projectId),
  ])

  const incomingByStep = new Map<string, string[]>()
  for (const edge of edges) {
    const list = incomingByStep.get(edge.toStepId) ?? []
    list.push(edge.fromStepId)
    incomingByStep.set(edge.toStepId, list)
  }

  return steps.filter((step) => {
    if (completed.has(step.id)) return false
    const predecessors = incomingByStep.get(step.id) ?? []
    return predecessors.every((fromId) => completed.has(fromId))
  })
}

export async function getFirstActionStep(graph = 'live'): Promise<GraphStep | undefined> {
  const [steps, edges] = await Promise.all([getGraphSteps(graph), getGraphEdges(graph)])
  const hasIncoming = new Set(edges.map((e) => e.toStepId))
  const entrySteps = steps.filter((s) => !hasIncoming.has(s.id))
  entrySteps.sort((a, b) => a.orderIndex - b.orderIndex)
  return entrySteps[0]
}

export async function getLastStep(graph = 'live'): Promise<GraphStep | undefined> {
  const [steps, edges] = await Promise.all([getGraphSteps(graph), getGraphEdges(graph)])
  const hasOutgoing = new Set(edges.map((e) => e.fromStepId))
  const terminalSteps = steps.filter((s) => !hasOutgoing.has(s.id))
  terminalSteps.sort((a, b) => b.orderIndex - a.orderIndex)
  return terminalSteps[0]
}
