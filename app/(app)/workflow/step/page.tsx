import { and, eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { projects, users, workflowStepStates, checklistDefinitions } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import {
  getStepByKey,
  getStepAssigneeGate,
  getApprovalState,
  getApprovalDrawing,
  getApprovalReceiverHolders,
  approvalSenderEligible,
  approvalReceiverEligible,
} from '@/lib/workflow-graph'
import {
  canRoleActOnStep,
  roleDashboard,
  stepRequiredKinds,
  userRoleLabel,
  type UserRole,
  type StepKind,
} from '@/lib/workflow'
import { getPositionLabelMap } from '@/lib/positions'
import YesNoUploadStep from '@/app/_components/workflow-kinds/yes-no-upload-step'
import ApprovalStep from '@/app/_components/workflow-kinds/approval-step'
import AssignmentStep from '@/app/_components/workflow-kinds/assignment-step'
import InvoiceTimelineForm from '@/app/(app)/admin/invoice-timeline/invoice-timeline-form'
import ConfirmPaymentStep from '@/app/_components/workflow-kinds/confirm-payment-step'
import InlineRequirementStep from '@/app/_components/workflow-kinds/inline-requirement-step'
import CompleteStepButton from '@/app/_components/workflow-kinds/complete-step-button'

export const dynamic = 'force-dynamic'

// Minimal server route (WF-03, plan 05): resolves a graph step by
// projectId + step key and dispatches to the matching kind renderer.
// Not hardcoded to a single graph — 'graph' defaults to 'test' since this
// route currently only serves the test graph built in plan 04; Phase 17
// will point real project steps at 'live' once migrated.
export default async function WorkflowStepPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; step?: string; graph?: string }>
}) {
  const sp = await searchParams
  const { userId, role } = await verifySession()

  const projectId = typeof sp.projectId === 'string' ? sp.projectId : null
  const stepKey = typeof sp.step === 'string' ? sp.step : null
  const graph = typeof sp.graph === 'string' ? sp.graph : 'live'
  const dashboard = roleDashboard(role)

  if (!projectId || !stepKey) {
    redirect(dashboard)
  }

  // Fetched once here (not passed down as a prop from elsewhere) so
  // AssignmentStep's post-assignment confirmation can name the project.
  const [proj] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId!)).limit(1)
  const projectName = proj?.name ?? null

  const step = await getStepByKey(graph, stepKey)

  if (!step) {
    redirect(dashboard)
  }

  function denied(message: string) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step!.label}</h1>
        <p className="text-sm text-error">{message}</p>
      </div>
    )
  }

  if (!canRoleActOnStep(step.role, role as UserRole)) {
    return denied('Not your step.')
  }

  // v2.0 Phase 19: a step may additionally be narrowed to one exact
  // users.position value (e.g. only the Head Designer, not any Design/
  // Architect user). Fetched fresh, not from the session, since position
  // can change post-signup via the self-service profile flow.
  if (step.requiredPosition) {
    const [actingUser] = await db.select({ position: users.position }).from(users).where(eq(users.id, userId)).limit(1)
    if (actingUser?.position !== step.requiredPosition) {
      return denied('This step is restricted to a specific title, and your account is not set to it.')
    }
  }

  // Quick task 260713-ekr (security fix, defense-in-depth): a design/architect
  // user who is not the assignee chosen at this step's governing assignment
  // step never even sees the form — clean denial, mirroring authorizeStep's
  // server-action boundary check.
  const gateUserId = await getStepAssigneeGate(graph, projectId!, step.key)
  if (gateUserId && gateUserId !== userId) {
    return denied('This step is assigned to a specific person — only they can act on it.')
  }

  // v2.0 Phase 18.1: a step may require MORE than one fulfillment kind
  // (primary + additionalKinds) — render one sub-form per required kind.
  // Each sub-form's own "Complete step" button calls the same
  // completeStepAction; the server only accepts it once every required
  // kind has been fulfilled (lib/workflow-graph.ts completeGraphStep), so
  // clicking any one of them once everything is done is enough.
  const requiredKinds = stepRequiredKinds(step)

  // quick task 260714-qe4 (workflow restructure batch 2): the old merged
  // Invoice & Delivery Timeline step's 2-part wizard un-merged into two
  // steps — 'set_delivery_timeline' (kind 'timeline_setting', standalone,
  // no upload phase) and 'invoice_upload' (kind 'yes_no_upload' + additional
  // 'payment_confirmation', still a 2-part wizard: upload then confirm
  // payment). Handled as two distinct branches below, both still bypassing
  // the generic stacked multi-kind view.
  if (requiredKinds.includes('timeline_setting')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step.label}</h1>
        <InvoiceTimelineForm projectId={projectId!} />
      </div>
    )
  }

  // quick task 260714-qe4: step 4 "Invoicing" (customer_care, 2-phase) —
  // part 1 (upload) must be fulfilled before part 2 (confirm the client
  // paid) appears; part 2's own submit (ConfirmPaymentStep ->
  // confirmClientPaidAction) is the SOLE caller that completes the step and
  // sets projects.paymentStatus='paid'.
  if (requiredKinds.includes('payment_confirmation')) {
    const [state] = await db
      .select({ fulfilledKinds: workflowStepStates.fulfilledKinds })
      .from(workflowStepStates)
      .where(and(eq(workflowStepStates.projectId, projectId!), eq(workflowStepStates.stepDefId, step.id)))
      .limit(1)
    const fulfilledKinds = state?.fulfilledKinds ?? []
    const uploaded = fulfilledKinds.includes('yes_no_upload')

    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <a href={dashboard} className="text-sm text-primary hover:underline">
          ← Dashboard
        </a>
        <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step.label}</h1>
        {!uploaded ? (
          <>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Part 1 of 2 — I have sent this client the invoice
            </p>
            <YesNoUploadStep projectId={projectId!} stepDefId={step.id} completeOnSubmit={false} />
          </>
        ) : (
          <>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Part 2 of 2 — The client has finally paid
            </p>
            <ConfirmPaymentStep projectId={projectId!} stepDefId={step.id} redirectTo={dashboard} />
          </>
        )}
      </div>
    )
  }

  const multi = requiredKinds.length > 1

  // quick task readiness-ack-sync: needed by the 'ack'/'readiness'/'checklist'
  // branches below to know which requirements are already done (so a
  // completed sub-section shows a checkmark instead of re-prompting), and by
  // the page-level Complete step button's disabled/hint state isn't computed
  // client-side — the server (completeGraphStep) is the actual gate; this is
  // read-only display state.
  const [genericState] = await db
    .select({ fulfilledKinds: workflowStepStates.fulfilledKinds })
    .from(workflowStepStates)
    .where(and(eq(workflowStepStates.projectId, projectId!), eq(workflowStepStates.stepDefId, step.id)))
    .limit(1)
  const fulfilledKinds = genericState?.fulfilledKinds ?? []

  async function renderKind(kind: StepKind): Promise<React.ReactNode> {
    switch (kind) {
      case 'yes_no_upload':
        return (
          <YesNoUploadStep
            projectId={projectId!}
            stepDefId={step!.id}
            redirectTo={dashboard}
            celebrateOnComplete={step!.key === 'sign_off'}
            requireUpload={step!.key === 'sign_off'}
            completeOnSubmit={!multi}
          />
        )
      case 'approval': {
        // Fetched fresh (not from the session) — same reasoning as the
        // page-level requiredPosition gate above: position can change
        // post-signup via the self-service profile flow. A separate query
        // (not reusing `actingUser` above) since that block only runs when
        // step.requiredPosition is set, but approval steps commonly gate
        // the RECEIVER via receiverRequiredPosition with requiredPosition
        // left null (e.g. send_for_production).
        const [actingUser] = await db
          .select({ position: users.position })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        const callerPosition = actingUser?.position ?? null

        const state = await getApprovalState(projectId!, step!.id)
        const phase: 'send' | 'sent' = state?.status === 'sent' ? 'sent' : 'send'
        const drawing = await getApprovalDrawing(projectId!, graph)
        const senderEligible = approvalSenderEligible(step!, role as UserRole, callerPosition)
        const receiverEligible = approvalReceiverEligible(step!, role as UserRole, callerPosition)
        const receiverHolderCount = (await getApprovalReceiverHolders(step!)).length
        const senderRoleLabel = userRoleLabel(step!.role)
        const receiverRequiredSlug = step!.receiverRequiredPosition ?? step!.requiredPosition ?? null
        const positionLabels = await getPositionLabelMap()
        const receiverPositionLabel = receiverRequiredSlug
          ? (positionLabels[receiverRequiredSlug] ?? receiverRequiredSlug)
          : 'the receiver'
        const senderName = state?.sentByName ?? null

        return (
          <ApprovalStep
            projectId={projectId!}
            stepDefId={step!.id}
            redirectTo={dashboard}
            phase={phase}
            senderEligible={senderEligible}
            receiverEligible={receiverEligible}
            drawing={drawing}
            senderName={senderName}
            senderRoleLabel={senderRoleLabel}
            receiverPositionLabel={receiverPositionLabel}
            receiverHolderCount={receiverHolderCount}
          />
        )
      }
      case 'assignment': {
        const candidates = step!.targetRoles?.length
          ? await db
              .select({ id: users.id, name: users.name, role: users.role })
              .from(users)
              .where(inArray(users.role, step!.targetRoles))
          : []
        return (
          <AssignmentStep
            projectId={projectId!}
            stepDefId={step!.id}
            targetRoles={step!.targetRoles}
            candidates={candidates}
            stepLabel={step!.label}
            projectName={projectName}
            redirectTo={dashboard}
          />
        )
      }
      case 'ack':
        return (
          <InlineRequirementStep
            projectId={projectId!}
            stepDefId={step!.id}
            kind="ack"
            alreadyDone={fulfilledKinds.includes('ack')}
          />
        )
      case 'readiness':
      case 'checklist': {
        // Stacked as an ADDITIONAL kind (a step whose sole kind is
        // 'checklist'/'readiness' never reaches this generic renderer — see
        // stepHref() in lib/workflow.ts, which routes it straight to
        // /checklists/[slug] or /factory-pm/readiness instead). With a
        // linked checklist slug attached via the Workflow Configurator,
        // completing it there fulfills this requirement (actions/
        // checklists.ts's partial-fulfillment branch). 'readiness' without a
        // slug falls back to a plain one-click confirmation; 'checklist'
        // without a slug has no content to show at all — surfaced as a
        // config error rather than silently doing nothing.
        if (step!.slug) {
          const [def] = await db
            .select({ name: checklistDefinitions.name })
            .from(checklistDefinitions)
            .where(eq(checklistDefinitions.slug, step!.slug))
            .limit(1)
          const label = def?.name ?? step!.slug
          if (fulfilledKinds.includes(kind)) {
            return (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                {label} completed.
              </div>
            )
          }
          return (
            <a
              href={`/checklists/${step!.slug}?projectId=${projectId}&step=${step!.orderIndex}`}
              className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm font-semibold text-primary shadow-sm hover:shadow-md"
            >
              Complete &ldquo;{label}&rdquo;
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </a>
          )
        }
        if (kind === 'readiness') {
          return (
            <InlineRequirementStep
              projectId={projectId!}
              stepDefId={step!.id}
              kind="readiness"
              alreadyDone={fulfilledKinds.includes('readiness')}
            />
          )
        }
        return (
          <p className="text-sm text-error">
            This step&rsquo;s checklist requirement has no checklist selected — a super admin needs
            to set one in the Workflow Configurator.
          </p>
        )
      }
      default:
        return (
          <p className="text-sm text-gray-500">
            The &ldquo;{kind}&rdquo; requirement on this step uses its own existing route — not
            supported inside this minimal combined view. Complete it from its usual page.
          </p>
        )
    }
  }

  const sections = await Promise.all(
    requiredKinds.map(async (kind) => ({ kind, node: await renderKind(kind) })),
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <a href={dashboard} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{step.label}</h1>
      {multi && (
        <p className="mb-4 text-xs text-gray-500">
          This step needs ALL {requiredKinds.length} of the following before it&rsquo;s complete.
        </p>
      )}
      <div className="space-y-6">
        {sections.map(({ kind, node }, i) => (
          <div key={kind}>
            {multi && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Requirement {i + 1} of {requiredKinds.length}: {kind.replace(/_/g, ' ')}
              </p>
            )}
            {node}
          </div>
        ))}
      </div>
      {multi && (
        <div className="mt-6">
          <CompleteStepButton projectId={projectId!} stepDefId={step.id} redirectTo={dashboard} />
        </div>
      )}
    </div>
  )
}
