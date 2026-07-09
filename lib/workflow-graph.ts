import 'server-only'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  workflowStepDefinitions,
  workflowStepEdges,
  workflowStepStates,
  projectStepCompletions,
  workflowConfigAccess,
  users,
} from '@/db/schema'
import type { GraphStep, StepKind, WorkflowRole, WorkflowStep } from '@/lib/workflow'

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
    // `role`/`targetRoles` are `roleEnum` at the DB layer (which also carries
    // the department roles `design`/`production`/`architect`), but
    // workflow-step roles are always one of the WorkflowRole values that
    // actually own steps.
    role: row.role as WorkflowRole,
    kind: row.fulfillmentKind,
    slug: row.checklistSlug,
    targetRoles: row.targetRoles as WorkflowRole[] | null,
    requiredPosition: row.requiredPosition,
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

// A GraphStep from the 'live' graph, projected into the legacy WorkflowStep
// shape (Phase 17, WF-06) — the migration adapter that lets DB-driven steps
// stand in for the array-based WorkflowStep shape without changing its
// consumers' expected shape. `stepDefId` is carried alongside so a caller can
// still resolve back to the DB row (e.g. for completeGraphStep).
export type LiveWorkflowStep = WorkflowStep & { stepDefId: string }

export async function getLiveWorkflowSteps(): Promise<LiveWorkflowStep[]> {
  const steps = await getGraphSteps('live')
  return steps.map((g) => ({
    n: g.orderIndex,
    key: g.key,
    label: g.label,
    role: g.role,
    kind: g.kind,
    slug: g.slug ?? undefined,
    stepDefId: g.id,
  }))
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
 * role isn't in the step's targetRoles pool (T-16-08; widened from a single
 * role to a list in v2.0 Phase 19 so e.g. Head Designer can pick from either
 * `design` or `architect`).
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
  // `assignee.role` is the full DB roleEnum (also carries `production`, which
  // never owns a workflow step); targetRoles is narrower (WorkflowRole[]).
  // The cast only affects the type checker — `.includes` still does a real
  // runtime equality check, so a `production` user correctly falls through.
  if (!assignee || !step.targetRoles?.includes(assignee.role as WorkflowRole)) {
    throw new Error('assignee-role-mismatch')
  }

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

// ── Workflow Configurator (Phase 18, CFG-01/CFG-02/CFG-03) ────────────────
// PIN gate: a single-row table holds the hashed PIN + hint, seeded to '0000'
// on first access. This is an ADDITIONAL gate on top of isAdminRole — callers
// must still check isAdminRole before calling any of these.

const DEFAULT_CONFIG_PIN = '0000'

/** Reads the current PIN hash + hint, seeding the default row on first call. */
export async function getConfigAccess(): Promise<{ pinHash: string; hint: string }> {
  const [row] = await db.select().from(workflowConfigAccess).limit(1)
  if (row) return { pinHash: row.pinHash, hint: row.hint }
  const pinHash = await bcrypt.hash(DEFAULT_CONFIG_PIN, 10)
  await db.insert(workflowConfigAccess).values({ pinHash, hint: DEFAULT_CONFIG_PIN })
  return { pinHash, hint: DEFAULT_CONFIG_PIN }
}

export async function verifyConfigPin(pin: string): Promise<boolean> {
  const { pinHash } = await getConfigAccess()
  return bcrypt.compare(pin, pinHash)
}

/** CFG-03: super admin can change the PIN from inside the configurator. */
export async function setConfigPin(newPin: string, hint: string, updatedBy: string): Promise<void> {
  const pinHash = await bcrypt.hash(newPin, 10)
  const [row] = await db.select({ id: workflowConfigAccess.id }).from(workflowConfigAccess).limit(1)
  if (row) {
    await db
      .update(workflowConfigAccess)
      .set({ pinHash, hint, updatedBy, updatedAt: new Date() })
      .where(eq(workflowConfigAccess.id, row.id))
  } else {
    await db.insert(workflowConfigAccess).values({ pinHash, hint, updatedBy })
  }
}

// Step graph CRUD (CFG-01). Reordering swaps `orderIndex` (display order)
// always, but only rewires `workflow_step_edges` when both swapped steps are
// "simple" (at most 1 incoming + 1 outgoing edge each) — this guarantees the
// one existing branch/join (Delivery Project Checklist + Delivery Readiness
// -> Project Check Report) can never be corrupted by a reorder; a step that's
// part of a branch/join only has its display position changed, with a note
// telling the admin to verify connections manually.

function edgeAdjacency(edges: { fromStepId: string; toStepId: string }[]) {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const e of edges) {
    incoming.set(e.toStepId, [...(incoming.get(e.toStepId) ?? []), e.fromStepId])
    outgoing.set(e.fromStepId, [...(outgoing.get(e.fromStepId) ?? []), e.toStepId])
  }
  return { incoming, outgoing }
}

// Swaps two ADJACENT steps' display order, rewiring their edge between them
// iff both are "simple" (<=1 incoming/outgoing edge each) — a step that's
// part of the one existing branch/join only gets its display position
// changed, connections left untouched (Phase 18 scope trade). Shared by
// moveGraphStep (single step, one swap) and moveGraphStepToIndex (drag-drop
// to an arbitrary position, a chain of these same swaps).
async function swapAdjacentSteps(
  graph: string,
  aId: string,
  bId: string,
): Promise<{ joinAdjacent: boolean }> {
  const [a] = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, aId)).limit(1)
  const [b] = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, bId)).limit(1)
  if (!a || !b) throw new Error('step-not-found')

  await db
    .update(workflowStepDefinitions)
    .set({ orderIndex: b.orderIndex, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, a.id))
  await db
    .update(workflowStepDefinitions)
    .set({ orderIndex: a.orderIndex, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, b.id))

  const edges = await getGraphEdges(graph)
  const { incoming, outgoing } = edgeAdjacency(edges)
  const isSimple = (id: string) => (incoming.get(id)?.length ?? 0) <= 1 && (outgoing.get(id)?.length ?? 0) <= 1
  if (!isSimple(a.id) || !isSimple(b.id)) {
    return { joinAdjacent: true }
  }

  const forward = edges.find((e) => e.fromStepId === a.id && e.toStepId === b.id)
  const backward = edges.find((e) => e.fromStepId === b.id && e.toStepId === a.id)
  if (forward) {
    await db
      .update(workflowStepEdges)
      .set({ fromStepId: b.id, toStepId: a.id })
      .where(and(eq(workflowStepEdges.fromStepId, a.id), eq(workflowStepEdges.toStepId, b.id)))
  } else if (backward) {
    await db
      .update(workflowStepEdges)
      .set({ fromStepId: a.id, toStepId: b.id })
      .where(and(eq(workflowStepEdges.fromStepId, b.id), eq(workflowStepEdges.toStepId, a.id)))
  }
  return { joinAdjacent: false }
}

export async function moveGraphStep(opts: {
  graph: string
  stepId: string
  direction: 'up' | 'down'
}): Promise<{ ok: boolean; message: string }> {
  const steps = await getGraphSteps(opts.graph)
  const idx = steps.findIndex((s) => s.id === opts.stepId)
  if (idx === -1) return { ok: false, message: 'Step not found.' }
  const swapIdx = opts.direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= steps.length) {
    return { ok: false, message: 'That step is already at the edge.' }
  }
  const { joinAdjacent } = await swapAdjacentSteps(opts.graph, steps[idx].id, steps[swapIdx].id)
  if (joinAdjacent) {
    return {
      ok: true,
      message: 'Display order updated. One of these steps is part of a branch/join — its connections were left unchanged; verify manually.',
    }
  }
  return { ok: true, message: 'Order updated.' }
}

// Drag-and-drop reorder to an ARBITRARY position (CFG-01): moves stepId from
// its current index to targetIndex via a chain of adjacent swaps, reusing
// swapAdjacentSteps' branch/join safety rule on every hop — so a drag across
// several positions is exactly as safe as doing each swap by hand.
export async function moveGraphStepToIndex(opts: {
  graph: string
  stepId: string
  targetIndex: number
}): Promise<{ ok: boolean; message: string }> {
  const steps = await getGraphSteps(opts.graph)
  const startIdx = steps.findIndex((s) => s.id === opts.stepId)
  if (startIdx === -1) return { ok: false, message: 'Step not found.' }
  const targetIdx = Math.max(0, Math.min(opts.targetIndex, steps.length - 1))
  if (targetIdx === startIdx) return { ok: true, message: 'Order unchanged.' }

  const direction = targetIdx > startIdx ? 1 : -1
  let anyJoinAdjacent = false
  let currentIdx = startIdx
  const currentIds = steps.map((s) => s.id)
  while (currentIdx !== targetIdx) {
    const nextIdx = currentIdx + direction
    const { joinAdjacent } = await swapAdjacentSteps(opts.graph, currentIds[currentIdx], currentIds[nextIdx])
    anyJoinAdjacent = anyJoinAdjacent || joinAdjacent
    ;[currentIds[currentIdx], currentIds[nextIdx]] = [currentIds[nextIdx], currentIds[currentIdx]]
    currentIdx = nextIdx
  }

  if (anyJoinAdjacent) {
    return {
      ok: true,
      message: 'Display order updated. This move passed a branch/join step — its connections were left unchanged; verify manually.',
    }
  }
  return { ok: true, message: 'Order updated.' }
}

export async function createGraphStep(opts: {
  graph: string
  stepKey: string
  label: string
  role: WorkflowRole
  fulfillmentKind: StepKind
  checklistSlug?: string | null
  targetRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  isOptional?: boolean
}): Promise<{ ok: boolean; message: string; stepId?: string }> {
  const steps = await getGraphSteps(opts.graph)
  if (steps.some((s) => s.key === opts.stepKey)) {
    return { ok: false, message: 'A step with that key already exists in this graph.' }
  }
  const maxOrder = steps.length ? Math.max(...steps.map((s) => s.orderIndex)) : 0
  const [inserted] = await db
    .insert(workflowStepDefinitions)
    .values({
      graph: opts.graph,
      stepKey: opts.stepKey,
      label: opts.label,
      role: opts.role,
      fulfillmentKind: opts.fulfillmentKind,
      checklistSlug: opts.checklistSlug ?? null,
      targetRoles: opts.targetRoles ?? null,
      requiredPosition: opts.requiredPosition ?? null,
      isOptional: opts.isOptional ?? false,
      orderIndex: maxOrder + 1,
    })
    .returning({ id: workflowStepDefinitions.id })

  const priorLast = steps.find((s) => s.orderIndex === maxOrder)
  if (priorLast) {
    await db
      .insert(workflowStepEdges)
      .values({ graph: opts.graph, fromStepId: priorLast.id, toStepId: inserted.id })
      .onConflictDoNothing()
  }
  return { ok: true, message: 'Step added at the end of the graph.', stepId: inserted.id }
}

/** Deletes a step and reconnects each of its predecessors to each of its successors. */
export async function deleteGraphStep(opts: { stepId: string }): Promise<{ ok: boolean; message: string }> {
  const step = await getStepById(opts.stepId)
  if (!step) return { ok: false, message: 'Step not found.' }
  const edges = await getGraphEdges(step.graph)
  const incoming = edges.filter((e) => e.toStepId === step.id).map((e) => e.fromStepId)
  const outgoing = edges.filter((e) => e.fromStepId === step.id).map((e) => e.toStepId)

  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, step.id))

  for (const from of incoming) {
    for (const to of outgoing) {
      await db
        .insert(workflowStepEdges)
        .values({ graph: step.graph, fromStepId: from, toStepId: to })
        .onConflictDoNothing()
    }
  }
  return { ok: true, message: 'Step removed; its predecessors were reconnected to its successors.' }
}

export async function updateGraphStep(opts: {
  stepId: string
  label?: string
  role?: WorkflowRole
  fulfillmentKind?: StepKind
  checklistSlug?: string | null
  targetRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  isOptional?: boolean
}): Promise<{ ok: boolean; message: string }> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (opts.label !== undefined) updates.label = opts.label
  if (opts.role !== undefined) updates.role = opts.role
  if (opts.fulfillmentKind !== undefined) updates.fulfillmentKind = opts.fulfillmentKind
  if (opts.checklistSlug !== undefined) updates.checklistSlug = opts.checklistSlug
  if (opts.targetRoles !== undefined) updates.targetRoles = opts.targetRoles
  if (opts.requiredPosition !== undefined) updates.requiredPosition = opts.requiredPosition
  if (opts.isOptional !== undefined) updates.isOptional = opts.isOptional
  await db.update(workflowStepDefinitions).set(updates).where(eq(workflowStepDefinitions.id, opts.stepId))
  return { ok: true, message: 'Step updated.' }
}
