import 'server-only'
import bcrypt from 'bcryptjs'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  workflowStepDefinitions,
  workflowStepEdges,
  workflowStepStates,
  projectStepCompletions,
  workflowConfigAccess,
  users,
  projects,
} from '@/db/schema'
import type { GraphStep, StepKind, UserRole, WorkflowRole, WorkflowStep } from '@/lib/workflow'
import { stepRequiredKinds, canRoleActOnStep } from '@/lib/workflow'
import { notifyUser } from '@/lib/notifications'

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
    additionalKinds: row.additionalKinds,
    slug: row.checklistSlug,
    targetRoles: row.targetRoles as WorkflowRole[] | null,
    requiredPosition: row.requiredPosition,
    receiverRequiredPosition: row.receiverRequiredPosition,
    receiverRole: row.receiverRole as WorkflowRole | null,
    dualRoles: row.dualRoles as WorkflowRole[] | null,
    isOptional: row.isOptional,
    orderIndex: row.orderIndex,
    positionX: row.positionX,
    positionY: row.positionY,
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
//
// Quick task 260714-b4t: also carries requiredPosition/receiverRequiredPosition
// forward from GraphStep so position-aware consumers (getMyWork,
// header-project-switcher) can gate visibility without a second DB query.
export type LiveWorkflowStep = WorkflowStep & {
  stepDefId: string
  dualRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  receiverRequiredPosition?: string | null
}

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
    dualRoles: g.dualRoles,
    requiredPosition: g.requiredPosition,
    receiverRequiredPosition: g.receiverRequiredPosition,
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

// ── Assignee gate (quick task 260713-ekr, security fix) ────────────────────
// A deliberately narrow, HARDCODED lookup — NOT a generic "any step can be
// assignee-gated" framework. Each gated step is scoped to the ONE person
// chosen at the assignment step that precedes it in the live graph, AND to
// the single role (`gatedRole`) that assignment governs. Every other step
// (including the assignment steps themselves, assign_designer_brief/
// design_initiation/ops_design_confirmation) is unaffected — the gate is a
// no-op for any key not in this map.
//
// Quick task 260716-h0i (security fix): extends the map with the four
// remaining site_pm-gated steps governed by 'ops_design_confirmation'
// ("Assign Site PM for Site Confirmation") — confirmation,
// materials_readiness, installation_process, sign_off. Previously only the
// design-side (brief_taking/kickoff_meeting/design_stage) steps were
// enforced; any site_pm role-holder — not just the one assigned at
// ops_design_confirmation — could act on these project-wide, an
// authorization gap now closed by real server-side enforcement at every
// call site (actions/checklists.ts, actions/readiness.ts, actions/workflow.ts)
// via assigneeGatedRoles()+getStepAssigneeGate().
//
// materials_readiness is DUAL-ROLE (factory_pm + site_pm both confirm
// independently, see confirmDualRoleStepAs). `gatedRoles: ['site_pm']` scopes
// the gate to ONLY the site_pm party's confirmation — a factory_pm acting on
// their own half of this step is never subject to this gate (every call site
// checks `assigneeGatedRoles(step.key).includes(role)` before consulting the
// gate, so an ungated role never triggers the lookup).
//
// `gatedRoles` is an ARRAY, not a single role, because canRoleActOnStep lets
// an Architect act on any `role: 'design'` step (a deliberate special case,
// see lib/workflow.ts) — brief_taking/kickoff_meeting/design_stage must gate
// BOTH 'design' and 'architect', or an Architect who legitimately IS the
// assignee would fall through the role-scope check in the visibility-only
// consumers (lib/my-work.ts) with no ill effect for them, but a DIFFERENT,
// non-assigned Architect would incorrectly see the step as "your turn" (the
// real server-side enforcement in authorizeStep/the workflow/step page is
// unconditional and was never affected — this was a visibility-only gap).
const ASSIGNEE_GATED_STEPS: Record<string, { governingKey: string; gatedRoles: WorkflowRole[] }> = {
  brief_taking: { governingKey: 'assign_designer_brief', gatedRoles: ['design', 'architect'] },
  kickoff_meeting: { governingKey: 'design_initiation', gatedRoles: ['design', 'architect'] },
  design_stage: { governingKey: 'design_initiation', gatedRoles: ['design', 'architect'] },
  confirmation: { governingKey: 'ops_design_confirmation', gatedRoles: ['site_pm'] },
  materials_readiness: { governingKey: 'ops_design_confirmation', gatedRoles: ['site_pm'] },
  installation_process: { governingKey: 'ops_design_confirmation', gatedRoles: ['site_pm'] },
  sign_off: { governingKey: 'ops_design_confirmation', gatedRoles: ['site_pm'] },
}

/** Pure: returns the governing assignment step's key for a gated step, or null. */
export function assigneeGoverningStepKey(stepKey: string): string | null {
  return ASSIGNEE_GATED_STEPS[stepKey]?.governingKey ?? null
}

/** Pure: returns the role(s) a gated step's assignee gate applies to (empty if not gated). */
export function assigneeGatedRoles(stepKey: string): WorkflowRole[] {
  return ASSIGNEE_GATED_STEPS[stepKey]?.gatedRoles ?? []
}

/**
 * Resolves the userId who was assigned at the governing assignment step for
 * this project, or null if the step isn't gated / hasn't been assigned yet.
 * Never throws on the not-yet-assigned case — callers treat null as "no
 * restriction yet" (T-16-08's assignUser gate is what prevents an invalid
 * assignee from ever being recorded in the first place).
 */
export async function getStepAssigneeGate(
  graph: string,
  projectId: string,
  stepKey: string,
): Promise<string | null> {
  const governingKey = assigneeGoverningStepKey(stepKey)
  if (!governingKey) return null
  const governingStep = await getStepByKey(graph, governingKey)
  if (!governingStep) return null
  const [state] = await db
    .select({ assignedUserId: workflowStepStates.assignedUserId })
    .from(workflowStepStates)
    .where(
      and(
        eq(workflowStepStates.projectId, projectId),
        eq(workflowStepStates.stepDefId, governingStep.id),
      ),
    )
    .limit(1)
  return state?.assignedUserId ?? null
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

// Kinds that require a fulfilled workflow_step_states row before
// completeGraphStep will accept a non-skip completion. The legacy
// checklist/readiness/ack/creation kinds are accepted as already validated
// upstream by their own submission flow (mirrors actions/workflow.ts).
const STATE_GATED_KINDS: StepKind[] = ['yes_no_upload', 'approval', 'assignment']

/**
 * Keeps `projects.currentStep` in sync when a graph step completes. The UI,
 * checklist gates, and my-work forcing all key off currentStep (linear
 * progression); completeGraphStep alone only wrote project_step_completions.
 * Only advances when the completed step is the one the project is waiting on.
 */
async function syncProjectCurrentStepAfterCompletion(
  projectId: string,
  completedStepOrderIndex: number,
  graph: string,
): Promise<void> {
  const [proj] = await db
    .select({ currentStep: projects.currentStep, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (!proj || proj.currentStep !== completedStepOrderIndex) return

  const steps = await getGraphSteps(graph)
  const lastN = steps.length ? Math.max(...steps.map((s) => s.orderIndex)) : completedStepOrderIndex
  const nextStep = proj.currentStep + 1
  const done = nextStep > lastN
  await db
    .update(projects)
    .set({
      currentStep: nextStep,
      status: done ? 'delivered' : proj.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
}

/**
 * Appends `kind` to a project+step's fulfilled-kinds record (v2.0 Phase
 * 18.1 — multi-kind steps), deduping. Read-modify-write since Drizzle's
 * neon-http driver has no convenience array-union upsert; call sites are
 * low-contention (one actor completing one step at a time).
 */
async function appendFulfilledKind(projectId: string, stepDefId: string, kind: StepKind): Promise<string[]> {
  const [existing] = await db
    .select({ fulfilledKinds: workflowStepStates.fulfilledKinds })
    .from(workflowStepStates)
    .where(and(eq(workflowStepStates.projectId, projectId), eq(workflowStepStates.stepDefId, stepDefId)))
    .limit(1)
  const current = existing?.fulfilledKinds ?? []
  return current.includes(kind) ? current : [...current, kind]
}

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
    await syncProjectCurrentStepAfterCompletion(projectId, step.orderIndex, step.graph)
    return { ok: true, actionable: await getActionableSteps(projectId, step.graph) }
  }

  // v2.0 Phase 18.1: a step's required kinds are primary + additionalKinds.
  // Only the subset that are STATE_GATED_KINDS need a workflow_step_states
  // fulfillment record; every one of those must appear in fulfilledKinds.
  const gatedRequiredKinds = stepRequiredKinds(step).filter((k) => STATE_GATED_KINDS.includes(k))
  if (gatedRequiredKinds.length > 0) {
    const [state] = await db
      .select()
      .from(workflowStepStates)
      .where(
        and(eq(workflowStepStates.projectId, projectId), eq(workflowStepStates.stepDefId, stepDefId)),
      )
      .limit(1)
    const fulfilled = state?.fulfilledKinds ?? []
    if (!gatedRequiredKinds.every((k) => fulfilled.includes(k))) throw new Error('step-not-fulfilled')
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
  await syncProjectCurrentStepAfterCompletion(projectId, step.orderIndex, step.graph)

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
  const fulfilledKinds = await appendFulfilledKind(opts.projectId, opts.stepDefId, 'yes_no_upload')
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
      fulfilledKinds,
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
        fulfilledKinds,
        updatedAt: now,
      },
    })
}

/**
 * Phase 2/2 of the new customer_care-owned 2-phase "Invoicing" step (quick
 * task 260714-qe4): marks the additionalKind 'payment_confirmation'
 * fulfilled. CHOSEN MECHANISM: reuses the existing 2-part-wizard pattern
 * (additionalKinds on the primary yes_no_upload row) rather than the
 * `approval` kind, because receiveApproval() above throws
 * 'approval-requires-two-parties' whenever sentBy===actorId — Invoicing's
 * two phases are BOTH done by customer_care (often the same person), which
 * the two-party approval kind cannot model. Mirrors submitYesNoUpload's
 * upsert shape but records no answer/upload — only the fulfilled-kind
 * bookkeeping — since the actual payment confirmation itself is the DB
 * write actions/projects.ts's confirmClientPaidAction performs on
 * projects.paymentStatus, sequenced around this call.
 */
export async function confirmPaymentReceived(opts: {
  projectId: string
  stepDefId: string
  actorId: string
}): Promise<void> {
  const now = new Date()
  const fulfilledKinds = await appendFulfilledKind(opts.projectId, opts.stepDefId, 'payment_confirmation')
  await db
    .insert(workflowStepStates)
    .values({
      projectId: opts.projectId,
      stepDefId: opts.stepDefId,
      status: 'complete',
      actedBy: opts.actorId,
      fulfilledKinds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: { actedBy: opts.actorId, fulfilledKinds, updatedAt: now },
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

  const fulfilledKinds = await appendFulfilledKind(opts.projectId, opts.stepDefId, 'approval')
  await db
    .update(workflowStepStates)
    .set({ status: 'complete', receivedBy: opts.actorId, fulfilledKinds, updatedAt: new Date() })
    .where(
      and(
        eq(workflowStepStates.projectId, opts.projectId),
        eq(workflowStepStates.stepDefId, opts.stepDefId),
      ),
    )
}

// ── Approval-kind UI support (quick task 260714-iuj) ───────────────────────
// The live incident this fixes: on send_for_production the CPO (the RECEIVE
// gate holder) clicked "Send for approval" himself, recording the receiver
// as the sender — receiveApproval's two-party rule then correctly rejected
// him, and nobody else holds the CPO title, so the step deadlocked. The pure
// helpers below make that click impossible to expose in the UI in the first
// place: a receive-gate holder is NEVER sender-eligible (the deadlock
// guard), independent of the (unchanged) server-side two-party rule above.

type ApprovalStepShape = {
  role: WorkflowRole
  requiredPosition?: string | null
  receiverRequiredPosition?: string | null
  receiverRole?: WorkflowRole | null
}

/** True iff this viewer (role+position) may RECEIVE (2nd party) on this approval step. */
export function approvalReceiverEligible(
  step: ApprovalStepShape,
  role: UserRole,
  position: string | null,
): boolean {
  const receiverRoleGate = step.receiverRole ?? step.role
  const receiverPositionGate = step.receiverRequiredPosition ?? step.requiredPosition ?? null
  return canRoleActOnStep(receiverRoleGate, role) && position === receiverPositionGate
}

/**
 * True iff this viewer (role+position) may SEND (1st party) on this approval
 * step. The deadlock guard: a viewer who satisfies the RECEIVE position gate
 * is never sender-eligible, even if they'd otherwise pass the role/position
 * check — so a receive-gate holder can never be recorded as the sender.
 */
export function approvalSenderEligible(
  step: ApprovalStepShape,
  role: UserRole,
  position: string | null,
): boolean {
  const senderPositionGate = step.requiredPosition ?? null
  const receiverPositionGate = step.receiverRequiredPosition ?? step.requiredPosition ?? null
  return (
    canRoleActOnStep(step.role, role) &&
    (senderPositionGate ? position === senderPositionGate : true) &&
    position !== receiverPositionGate
  )
}

// Priority order for the design-drawing fallback chain (by step key, same
// project, live graph): the most recent/relevant upload wins.
const APPROVAL_DRAWING_FALLBACK_KEYS = ['internal_approval', 'confirmation_correction', 'design_stage'] as const

/** Pure: given rows for a project's fallback-chain steps, picks the drawing to show. */
export function pickApprovalDrawing(
  rows: { stepKey: string; uploadData: string | null; uploadName: string | null }[],
): { uploadData: string; uploadName: string | null } | null {
  const byKey = new Map(rows.map((r) => [r.stepKey, r]))
  for (const key of APPROVAL_DRAWING_FALLBACK_KEYS) {
    const row = byKey.get(key)
    if (row?.uploadData) return { uploadData: row.uploadData, uploadName: row.uploadName }
  }
  return null
}

/** The current send/receive state of an approval step for one project. */
export async function getApprovalState(
  projectId: string,
  stepDefId: string,
): Promise<{ status: string; sentBy: string | null; sentByName: string | null } | null> {
  const [row] = await db
    .select({ status: workflowStepStates.status, sentBy: workflowStepStates.sentBy, sentByName: users.name })
    .from(workflowStepStates)
    .leftJoin(users, eq(users.id, workflowStepStates.sentBy))
    .where(and(eq(workflowStepStates.projectId, projectId), eq(workflowStepStates.stepDefId, stepDefId)))
    .limit(1)
  return row ? { status: row.status, sentBy: row.sentBy, sentByName: row.sentByName ?? null } : null
}

/** The design drawing to show in the approval pane, resolved via the fallback chain. */
export async function getApprovalDrawing(
  projectId: string,
  graph = 'live',
): Promise<{ uploadData: string; uploadName: string | null } | null> {
  const rows = await db
    .select({
      stepKey: workflowStepDefinitions.stepKey,
      uploadData: workflowStepStates.uploadData,
      uploadName: workflowStepStates.uploadName,
    })
    .from(workflowStepStates)
    .innerJoin(workflowStepDefinitions, eq(workflowStepDefinitions.id, workflowStepStates.stepDefId))
    .where(
      and(
        eq(workflowStepStates.projectId, projectId),
        eq(workflowStepDefinitions.graph, graph),
        inArray(workflowStepDefinitions.stepKey, [...APPROVAL_DRAWING_FALLBACK_KEYS]),
      ),
    )
  return pickApprovalDrawing(rows)
}

/** Every user who currently holds the receive-gate title for this approval step — the notify + count source. */
export async function getApprovalReceiverHolders(
  step: Pick<GraphStep, 'role' | 'requiredPosition' | 'receiverRequiredPosition' | 'receiverRole'>,
): Promise<{ id: string }[]> {
  const positionGate = step.receiverRequiredPosition ?? step.requiredPosition
  if (!positionGate) return []
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.position, positionGate))
  const roleGate = step.receiverRole ?? step.role
  return rows.filter((u) => canRoleActOnStep(roleGate, u.role)).map((u) => ({ id: u.id }))
}

/**
 * Returns a 'sent' approval to phase 1/2 so the original sender can revise
 * and resend. Only touches workflow_step_states — never deletes the step
 * definition or edges. Rejects a reject on anything not currently 'sent'.
 */
export async function rejectApproval(opts: {
  projectId: string
  stepDefId: string
  actorId: string
}): Promise<{ sentBy: string | null }> {
  const [state] = await db
    .select()
    .from(workflowStepStates)
    .where(and(eq(workflowStepStates.projectId, opts.projectId), eq(workflowStepStates.stepDefId, opts.stepDefId)))
    .limit(1)
  if (!state || state.status !== 'sent') throw new Error('approval-not-sent')
  const sentBy = state.sentBy
  await db
    .update(workflowStepStates)
    .set({ status: 'pending', sentBy: null, updatedAt: new Date() })
    .where(and(eq(workflowStepStates.projectId, opts.projectId), eq(workflowStepStates.stepDefId, opts.stepDefId)))
  return { sentBy }
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
  const fulfilledKinds = await appendFulfilledKind(opts.projectId, opts.stepDefId, 'assignment')
  await db
    .insert(workflowStepStates)
    .values({
      projectId: opts.projectId,
      stepDefId: opts.stepDefId,
      status: 'complete',
      assignedUserId: opts.assignedUserId,
      actedBy: opts.actorId,
      fulfilledKinds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [workflowStepStates.projectId, workflowStepStates.stepDefId],
      set: {
        status: 'complete',
        assignedUserId: opts.assignedUserId,
        actedBy: opts.actorId,
        fulfilledKinds,
        updatedAt: now,
      },
    })

  const [proj] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, opts.projectId))
    .limit(1)
  await notifyUser({
    recipientId: opts.assignedUserId,
    actorId: opts.actorId,
    type: 'assignment',
    title: `You've been assigned: ${step.label} on ${proj?.name ?? 'a project'}`,
    projectId: opts.projectId,
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

  // v2.0 Phase 22: keep every in-flight project's currentStep pointing at the
  // SAME step it was waiting on before the swap. currentStep is a raw
  // orderIndex, not a stepDefId, so without this a Configurator drag silently
  // desyncs any project's progress (the exact root cause behind "confirm/assign
  // clicked and nothing happened" — see migrate-repair-live-workflow-graph.ts).
  // Snapshot affected project ids BEFORE mutating anything: updating by raw
  // "currentStep = oldValue" in two sequential statements would re-match rows
  // the first statement just wrote (both old values swap into each other),
  // silently cancelling the remap — updating by id avoids that.
  const [projectsAtA, projectsAtB] = await Promise.all([
    db.select({ id: projects.id }).from(projects).where(eq(projects.currentStep, a.orderIndex)),
    db.select({ id: projects.id }).from(projects).where(eq(projects.currentStep, b.orderIndex)),
  ])

  await db
    .update(workflowStepDefinitions)
    .set({ orderIndex: b.orderIndex, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, a.id))
  await db
    .update(workflowStepDefinitions)
    .set({ orderIndex: a.orderIndex, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, b.id))

  for (const p of projectsAtA) {
    await db.update(projects).set({ currentStep: b.orderIndex, updatedAt: new Date() }).where(eq(projects.id, p.id))
  }
  for (const p of projectsAtB) {
    await db.update(projects).set({ currentStep: a.orderIndex, updatedAt: new Date() }).where(eq(projects.id, p.id))
  }

  const edges = await getGraphEdges(graph)
  const { incoming, outgoing } = edgeAdjacency(edges)
  const isSimple = (id: string) => (incoming.get(id)?.length ?? 0) <= 1 && (outgoing.get(id)?.length ?? 0) <= 1
  if (!isSimple(a.id) || !isSimple(b.id)) {
    return { joinAdjacent: true }
  }

  const forward = edges.find((e) => e.fromStepId === a.id && e.toStepId === b.id)
  const backward = edges.find((e) => e.fromStepId === b.id && e.toStepId === a.id)

  // v2.0 Phase 22 bugfix: the internal a<->b edge is only ONE of up to three
  // edges a swap must fix. Chain [pred]->a->b->[succ] becoming
  // [pred]->b->a->[succ] (or the mirror, for a backward b->a chain) also
  // needs pred's outgoing edge and succ's incoming edge re-pointed at the
  // node now occupying that end of the pair — otherwise pred/succ are left
  // wired to whichever of a/b is no longer adjacent to them, which silently
  // orphans/dead-ends/double-entries the graph (this is what corrupted the
  // live graph before scripts/migrate-v2-production-pipeline.ts repaired it:
  // every prior Configurator drag only ever fixed the internal edge).
  if (forward) {
    const predEdge = edges.find((e) => e.toStepId === a.id) // a's only incoming, if any (can't be from b: this is the forward case)
    const succEdge = edges.find((e) => e.fromStepId === b.id) // b's only outgoing, if any (can't be to a)
    await db
      .update(workflowStepEdges)
      .set({ fromStepId: b.id, toStepId: a.id })
      .where(and(eq(workflowStepEdges.fromStepId, a.id), eq(workflowStepEdges.toStepId, b.id)))
    if (predEdge) {
      await db.update(workflowStepEdges).set({ toStepId: b.id }).where(and(eq(workflowStepEdges.fromStepId, predEdge.fromStepId), eq(workflowStepEdges.toStepId, a.id)))
    }
    if (succEdge) {
      await db.update(workflowStepEdges).set({ fromStepId: a.id }).where(and(eq(workflowStepEdges.fromStepId, b.id), eq(workflowStepEdges.toStepId, succEdge.toStepId)))
    }
  } else if (backward) {
    const predEdge = edges.find((e) => e.toStepId === b.id) // b's only incoming, if any (can't be from a: this is the backward case)
    const succEdge = edges.find((e) => e.fromStepId === a.id) // a's only outgoing, if any (can't be to b)
    await db
      .update(workflowStepEdges)
      .set({ fromStepId: a.id, toStepId: b.id })
      .where(and(eq(workflowStepEdges.fromStepId, b.id), eq(workflowStepEdges.toStepId, a.id)))
    if (predEdge) {
      await db.update(workflowStepEdges).set({ toStepId: a.id }).where(and(eq(workflowStepEdges.fromStepId, predEdge.fromStepId), eq(workflowStepEdges.toStepId, b.id)))
    }
    if (succEdge) {
      await db.update(workflowStepEdges).set({ fromStepId: b.id }).where(and(eq(workflowStepEdges.fromStepId, a.id), eq(workflowStepEdges.toStepId, succEdge.toStepId)))
    }
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
  additionalKinds?: StepKind[] | null
  checklistSlug?: string | null
  targetRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  receiverRequiredPosition?: string | null
  receiverRole?: WorkflowRole | null
  dualRoles?: WorkflowRole[] | null
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
      additionalKinds: opts.additionalKinds?.length ? opts.additionalKinds : null,
      checklistSlug: opts.checklistSlug ?? null,
      targetRoles: opts.targetRoles ?? null,
      requiredPosition: opts.requiredPosition ?? null,
      receiverRequiredPosition: opts.receiverRequiredPosition ?? null,
      receiverRole: opts.receiverRole ?? null,
      dualRoles: opts.dualRoles?.length ? opts.dualRoles : null,
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

  // v2.0 Phase 22: any project sitting exactly at this step's orderIndex
  // would otherwise resolve to nothing after deletion (silently stuck, same
  // failure family as the Configurator drag bug). Move it forward to
  // whichever successor now takes over — the lowest orderIndex among them
  // if there's a fan-out, or "done" (past the last step) if this was the
  // terminal step.
  const [allSteps, stuckProjects] = await Promise.all([
    getGraphSteps(step.graph),
    db.select({ id: projects.id }).from(projects).where(eq(projects.currentStep, step.orderIndex)),
  ])
  if (stuckProjects.length > 0) {
    const successorOrders = allSteps.filter((s) => outgoing.includes(s.id)).map((s) => s.orderIndex)
    const lastOrder = allSteps.length ? Math.max(...allSteps.map((s) => s.orderIndex)) : step.orderIndex
    const fallback = successorOrders.length > 0 ? Math.min(...successorOrders) : lastOrder + 1
    for (const p of stuckProjects) {
      await db.update(projects).set({ currentStep: fallback, updatedAt: new Date() }).where(eq(projects.id, p.id))
    }
  }

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
  additionalKinds?: StepKind[] | null
  checklistSlug?: string | null
  targetRoles?: WorkflowRole[] | null
  requiredPosition?: string | null
  receiverRequiredPosition?: string | null
  receiverRole?: WorkflowRole | null
  dualRoles?: WorkflowRole[] | null
  isOptional?: boolean
}): Promise<{ ok: boolean; message: string }> {
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (opts.label !== undefined) updates.label = opts.label
  if (opts.role !== undefined) updates.role = opts.role
  if (opts.fulfillmentKind !== undefined) updates.fulfillmentKind = opts.fulfillmentKind
  if (opts.additionalKinds !== undefined) updates.additionalKinds = opts.additionalKinds?.length ? opts.additionalKinds : null
  if (opts.checklistSlug !== undefined) updates.checklistSlug = opts.checklistSlug
  if (opts.targetRoles !== undefined) updates.targetRoles = opts.targetRoles
  if (opts.requiredPosition !== undefined) updates.requiredPosition = opts.requiredPosition
  if (opts.receiverRequiredPosition !== undefined) updates.receiverRequiredPosition = opts.receiverRequiredPosition
  if (opts.receiverRole !== undefined) updates.receiverRole = opts.receiverRole
  if (opts.dualRoles !== undefined) updates.dualRoles = opts.dualRoles?.length ? opts.dualRoles : null
  if (opts.isOptional !== undefined) updates.isOptional = opts.isOptional
  await db.update(workflowStepDefinitions).set(updates).where(eq(workflowStepDefinitions.id, opts.stepId))
  return { ok: true, message: 'Step updated.' }
}

/**
 * Persists a node's canvas position (Configurator graph view). Purely
 * cosmetic — never read by getActionableSteps or any execution-order logic,
 * only by the canvas layout on next load.
 */
export async function updateGraphStepPosition(opts: {
  stepId: string
  x: number
  y: number
}): Promise<{ ok: boolean; message: string }> {
  await db
    .update(workflowStepDefinitions)
    .set({ positionX: opts.x, positionY: opts.y, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, opts.stepId))
  return { ok: true, message: 'Position saved.' }
}

/**
 * Direct edge creation for the Configurator graph view (dragging a
 * connection between two node handles). Unlike moveGraphStep/
 * moveGraphStepToIndex (which preserve a single linear order plus the one
 * known branch/join), this lets an admin build arbitrary topology — no
 * "simple step" guardrail, since the whole point of the graph view is
 * direct topology control. Rejects a self-loop or an edge that already
 * exists.
 */
export async function createGraphEdge(opts: {
  graph: string
  fromStepId: string
  toStepId: string
}): Promise<{ ok: boolean; message: string }> {
  if (opts.fromStepId === opts.toStepId) {
    return { ok: false, message: 'A step cannot connect to itself.' }
  }
  const [from] = await db.select({ id: workflowStepDefinitions.id }).from(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, opts.fromStepId)).limit(1)
  const [to] = await db.select({ id: workflowStepDefinitions.id }).from(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, opts.toStepId)).limit(1)
  if (!from || !to) return { ok: false, message: 'One of these steps could not be found.' }

  const inserted = await db
    .insert(workflowStepEdges)
    .values({ graph: opts.graph, fromStepId: opts.fromStepId, toStepId: opts.toStepId })
    .onConflictDoNothing()
    .returning({ id: workflowStepEdges.id })
  if (inserted.length === 0) {
    return { ok: false, message: 'That connection already exists.' }
  }
  return { ok: true, message: 'Connected.' }
}

/**
 * Direct edge deletion for the Configurator graph view. Refuses to delete
 * an edge if it would leave the destination step with zero incoming edges
 * AND that step isn't the graph's first step (orderIndex 1) — an
 * unreachable step is a real misconfiguration, not a stylistic choice, so
 * this is a hard guard rather than a warning.
 */
export async function deleteGraphEdge(opts: {
  graph: string
  fromStepId: string
  toStepId: string
}): Promise<{ ok: boolean; message: string }> {
  const edges = await getGraphEdges(opts.graph)
  const toIncoming = edges.filter((e) => e.toStepId === opts.toStepId)
  if (toIncoming.length <= 1) {
    const [toStep] = await db.select({ orderIndex: workflowStepDefinitions.orderIndex }).from(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, opts.toStepId)).limit(1)
    if (toStep && toStep.orderIndex !== 1) {
      return {
        ok: false,
        message: 'Removing this would leave that step unreachable — connect it from somewhere else first.',
      }
    }
  }
  const deleted = await db
    .delete(workflowStepEdges)
    .where(
      and(
        eq(workflowStepEdges.graph, opts.graph),
        eq(workflowStepEdges.fromStepId, opts.fromStepId),
        eq(workflowStepEdges.toStepId, opts.toStepId),
      ),
    )
    .returning({ id: workflowStepEdges.id })
  if (deleted.length === 0) return { ok: false, message: 'That connection was not found.' }
  return { ok: true, message: 'Disconnected.' }
}
