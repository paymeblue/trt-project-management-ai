import 'server-only'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { projects, projectStepDeadlines, users } from '@/db/schema'
import {
  canActOnGraphStep,
  findStep,
  lastStepN,
  projectComplete,
  type UserRole,
  type MyWork,
} from '@/lib/workflow'
import {
  getLiveWorkflowSteps,
  getStepAssigneeGate,
  assigneeGatedRoles,
  getApprovalState,
} from '@/lib/workflow-graph'

// Computes the in-progress projects (for the header switcher) and the subset
// awaiting THIS user's action (for the forcing gate). Shared by the app layout
// (initial render) and the /api/my-work polling endpoint.
//
// `userId` (quick task 260713-ekr, security fix): needed to resolve each
// active project's assignee gate (getStepAssigneeGate) and to exclude a
// gated project from `pending` when the caller isn't its assignee.
export async function getMyWork(role: UserRole, userId: string): Promise<MyWork> {
  const steps = await getLiveWorkflowSteps()

  // Quick task 260714-b4t (bug fix): position isn't in the JWT (can change
  // post-signup) — fetch fresh from the DB, mirroring authorizeStep's pattern
  // in actions/workflow-graph.ts, so the pending filter below can exclude
  // position-mismatched assignment/approval steps.
  const [caller] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
  const callerPosition = caller?.position ?? null

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
  // active projects skip it entirely (assigneeGatedRoles returns []).
  // Quick task 260714-iuj: same bounded-per-project shape as the assignee
  // gate above — only resolved for a project whose CURRENT step is actually
  // an approval-kind step, so most active projects skip this DB round trip
  // entirely. Reused below to nag only the receiver, not the sender, once a
  // 'sent' approval is awaiting the second party.
  const gateByProjectId = new Map<string, string | null>()
  const approvalStateByProjectId = new Map<
    string,
    { status: string; sentBy: string | null; sentByName: string | null } | null
  >()
  for (const p of active) {
    const step = findStep(steps, p.currentStep)
    // Quick task 260716-h0i: also require assigneeGatedRoles(step.key) to
    // include this viewer's role, so an ungated role viewing this project
    // (e.g. factory_pm on the dual-role materials_readiness step, whose gate
    // applies only to the site_pm party) never sees a gate that isn't theirs.
    const gate =
      step && assigneeGatedRoles(step.key).includes(role)
        ? await getStepAssigneeGate('live', p.id, step.key)
        : null
    gateByProjectId.set(p.id, gate)
    if (step && step.kind === 'approval') {
      approvalStateByProjectId.set(p.id, await getApprovalState(p.id, step.stepDefId))
    }
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
      // Quick task 260714-b4t: exclude position-mismatched steps. This is a
      // visibility/nagging fix, NOT the authorization boundary — authorizeStep
      // (actions/workflow-graph.ts) remains the real, server-enforced gate.
      // Approval-kind steps carry requiredPosition (sender) AND
      // receiverRequiredPosition (receiver); only exclude when the caller
      // matches neither, so the receiver's turn to act isn't hidden.
      if (
        step.requiredPosition &&
        callerPosition !== step.requiredPosition &&
        (!step.receiverRequiredPosition || callerPosition !== step.receiverRequiredPosition)
      ) {
        return false
      }
      // Quick task 260714-iuj: once an approval-kind step has been sent
      // (awaiting the second party), it counts as pending ONLY for a
      // receiver-eligible caller who is NOT the original sender — otherwise
      // the sender who just sent it stays falsely "pending" until the
      // receiver acts. Not-yet-sent approvals are unaffected (the position
      // gate above already handles that case).
      if (step.kind === 'approval') {
        const state = approvalStateByProjectId.get(p.id) ?? null
        if (state?.status === 'sent') {
          const receiverPosition = step.receiverRequiredPosition ?? step.requiredPosition ?? null
          if (callerPosition === null || callerPosition !== receiverPosition || state.sentBy === userId) {
            return false
          }
        }
      }
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
