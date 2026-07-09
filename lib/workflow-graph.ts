import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  workflowStepDefinitions,
  workflowStepEdges,
  workflowStepStates,
  projectStepCompletions,
  users,
} from '@/db/schema'
import type { GraphStep, StepKind, WorkflowRole } from '@/lib/workflow'

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

// ── Write engine (Phase 16, WF-02/WF-03/WF-04) ────────────────────────────
// Kind handlers below (submitYesNoUpload/sendApproval/receiveApproval/
// assignUser) only record runtime state in workflow_step_states — they never
// advance the project themselves. completeGraphStep is the single place that
// records a project_step_completions row and re-derives the actionable set,
// so state-fulfillment and advancement stay independently testable.

// Kinds that require a fulfilled workflow_step_states row (status 'complete')
// before completeGraphStep will accept a non-skip completion. The legacy
// checklist/readiness/ack/creation kinds are accepted as already validated
// upstream by their own submission flow (mirrors actions/workflow.ts).
const STATE_GATED_KINDS: StepKind[] = ['yes_no_upload', 'approval', 'assignment']

/**
 * Complete (or skip) a graph step for a project, then return the freshly
 * re-derived actionable set. `skip` on a required (non-optional) step is
 * rejected server-side — the client's skip flag can never override this
 * (WF-04, T-16-06).
 */
export async function completeGraphStep(opts: {
  projectId: string
  stepDefId: string
  actorId: string
  skip?: boolean
}): Promise<{ ok: boolean; actionable: GraphStep[] }> {
  const { projectId, stepDefId, actorId, skip } = opts
  const step = await getStepById(stepDefId)
  if (!step) throw new Error('step-not-found')

  if (skip) {
    if (!step.isOptional) throw new Error('required-step-cannot-be-skipped')
    await db.insert(projectStepCompletions).values({
      projectId,
      stepDefId: step.id,
      graph: step.graph,
      stepKey: step.key,
      stepN: step.orderIndex,
      completedBy: actorId,
      skipped: true,
    })
    return { ok: true, actionable: await getActionableSteps(projectId, step.graph) }
  }

  if (STATE_GATED_KINDS.includes(step.kind)) {
    const [state] = await db
      .select()
      .from(workflowStepStates)
      .where(
        and(eq(workflowStepStates.projectId, projectId), eq(workflowStepStates.stepDefId, stepDefId)),
      )
      .limit(1)
    if (!state || state.status !== 'complete') throw new Error('step-not-fulfilled')
  }

  await db.insert(projectStepCompletions).values({
    projectId,
    stepDefId: step.id,
    graph: step.graph,
    stepKey: step.key,
    stepN: step.orderIndex,
    completedBy: actorId,
    skipped: false,
  })

  return { ok: true, actionable: await getActionableSteps(projectId, step.graph) }
}

/** Records the yes/no answer (+ optional upload) for a `yes_no_upload` step. */
export async function submitYesNoUpload(opts: {
  projectId: string
  stepDefId: string
  actorId: string
  answer: 'yes' | 'no'
  uploadData?: string | null
  uploadName?: string | null
}): Promise<void> {
  const now = new Date()
  await db
    .insert(workflowStepStates)
    .values({
      projectId: opts.projectId,
      stepDefId: opts.stepDefId,
      status: 'complete',
      answer: opts.answer,
      uploadData: opts.uploadData ?? null,
      uploadName: opts.uploadName ?? null,
      actedBy: opts.actorId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: {
        status: 'complete',
        answer: opts.answer,
        uploadData: opts.uploadData ?? null,
        uploadName: opts.uploadName ?? null,
        actedBy: opts.actorId,
        updatedAt: now,
      },
    })
}

/** First half of the two-party `approval` kind: records who sent it. */
export async function sendApproval(opts: {
  projectId: string
  stepDefId: string
  actorId: string
}): Promise<void> {
  const now = new Date()
  await db
    .insert(workflowStepStates)
    .values({
      projectId: opts.projectId,
      stepDefId: opts.stepDefId,
      status: 'sent',
      sentBy: opts.actorId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: { status: 'sent', sentBy: opts.actorId, updatedAt: now },
    })
}

/**
 * Second half of the two-party `approval` kind. Requires a row already in
 * 'sent' status, and the receiver must differ from the sender (T-16-07 —
 * self-approval is rejected server-side, not just hidden in the UI).
 */
export async function receiveApproval(opts: {
  projectId: string
  stepDefId: string
  actorId: string
}): Promise<void> {
  const [state] = await db
    .select()
    .from(workflowStepStates)
    .where(
      and(
        eq(workflowStepStates.projectId, opts.projectId),
        eq(workflowStepStates.stepDefId, opts.stepDefId),
      ),
    )
    .limit(1)
  if (!state || state.status !== 'sent') throw new Error('approval-not-sent')
  if (state.sentBy === opts.actorId) throw new Error('approval-requires-two-parties')

  await db
    .update(workflowStepStates)
    .set({ status: 'complete', receivedBy: opts.actorId, updatedAt: new Date() })
    .where(
      and(
        eq(workflowStepStates.projectId, opts.projectId),
        eq(workflowStepStates.stepDefId, opts.stepDefId),
      ),
    )
}

/**
 * Records the assignment for an `assignment` step. Rejects an assignee whose
 * role doesn't match the step's targetRole (T-16-08).
 */
export async function assignUser(opts: {
  projectId: string
  stepDefId: string
  actorId: string
  assignedUserId: string
}): Promise<void> {
  const step = await getStepById(opts.stepDefId)
  if (!step) throw new Error('step-not-found')

  const [assignee] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, opts.assignedUserId))
    .limit(1)
  if (!assignee || assignee.role !== step.targetRole) throw new Error('assignee-role-mismatch')

  const now = new Date()
  await db
    .insert(workflowStepStates)
    .values({
      projectId: opts.projectId,
      stepDefId: opts.stepDefId,
      status: 'complete',
      assignedUserId: opts.assignedUserId,
      actedBy: opts.actorId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: {
        status: 'complete',
        assignedUserId: opts.assignedUserId,
        actedBy: opts.actorId,
        updatedAt: now,
      },
    })
}
