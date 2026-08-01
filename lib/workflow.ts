// ── Canonical project workflow ────────────────────────────────────────────
// Single source of truth for the ordered, multi-role process a project moves
// through. `projects.currentStep` holds the step number awaiting action.
// Importable from both server and client components — keep it free of any
// server-only imports.

// Enum-style constant for roles — gives autocomplete + a single source of truth.
// Values are the literal strings, so they stay assignable to the `UserRole` union
// (avoids the no-overlap friction of TypeScript string `enum`s).
export const Roles = {
  FactoryPm: 'factory_pm',
  SitePm: 'site_pm',
  SuperAdmin: 'super_admin',
  Operations: 'operations',
  // Future departments (v1.1 #7): recognised roles with their own shell so they
  // keep working once their workflow steps are added. To add another department:
  // (1) add it here, (2) add it to db `roleEnum`, (3) add a USER_ROLE_LABELS +
  // ROLE_DASHBOARD entry below, (4) add a sidebar NAV list + a dashboard page.
  Design: 'design',
  Production: 'production',
  // v2.0: intake role — creates the Project Intent step (STG-01); owns a
  // workflow step, so it's also part of WorkflowRole below.
  CustomerCare: 'customer_care',
  // v2.0 Phase 19/21: separated from Design (resolved 2026-07-09) — owns
  // Design/Architect assignment-pool steps, also part of WorkflowRole.
  Architect: 'architect',
  // v2.0 Phase 22 (production pipeline, 2026-07-10): factory-floor roles that
  // own their own workflow steps but are explicitly NOT admin roles — see
  // isAdminRole below. Not super admins.
  FactoryOperations: 'factory_operations',
  FactoryManager: 'factory_manager',
} as const

// v2.0 Phase 19 (ad hoc): known `users.position` values that gate a step via
// `requiredPosition`. Deliberately app-level constants, not a DB enum yet —
// `users.position` stays free text until formal Phase 19 execution converts
// it, to avoid migration risk under this ad hoc build (see db/schema.ts).
export const Positions = {
  HeadOfOperations: 'head_of_operations',
  HeadDesigner: 'head_designer',
  ChiefProductionOfficer: 'chief_production_officer',
} as const

// v2.0 (quick task 260714-bpq, 2026-07-14): the static position-values tuple,
// its display-label map, and its literal type (formal Phase 19-01's static
// enum source of truth) are RETIRED — positions are now data in the
// `positions` DB table (db/schema.ts),
// renameable self-service via actions/positions.ts, read via
// lib/positions.ts's getPositions()/getPositionLabelMap(). The 3 baseline
// machine-gating slugs are still documented above as `Positions` (harmless,
// no consumers, kept as the conceptual seed reference for
// scripts/migrate-positions-table.ts).

export type UserRole = (typeof Roles)[keyof typeof Roles]
export type WorkflowRole =
  | typeof Roles.Operations
  | typeof Roles.SitePm
  | typeof Roles.FactoryPm
  | typeof Roles.SuperAdmin
  | typeof Roles.CustomerCare
  | typeof Roles.Design
  | typeof Roles.Architect
  | typeof Roles.FactoryOperations
  | typeof Roles.FactoryManager
export type StepKind =
  | 'creation'
  | 'checklist'
  | 'readiness'
  | 'ack'
  | 'yes_no_upload'
  | 'approval'
  | 'assignment'
  | 'payment_confirmation'
  | 'timeline_setting'

// True for roles with full admin rights (admin area, project creation, timeline).
export function isAdminRole(role: UserRole): boolean {
  return role === Roles.SuperAdmin || role === Roles.Operations
}

// Checklist definition audiences (mirrors the `target_role` enum on
// `checklist_definitions`). A `both` checklist is editable by either PM role.
export type ChecklistTargetRole = typeof Roles.FactoryPm | typeof Roles.SitePm | 'both'

// Who may author (create/edit) a checklist's questions. All admin roles
// (super_admin AND operations) — widened 2026-07-19 per user report: an
// operations_manager_admin user was locked out of /admin/checklists while
// the page itself promised "a super admin or Operations can edit". This
// supersedes the earlier item-#8 super-admin-only restriction; authoring
// remains reachable only from Checklist Configuration, and PM roles still
// only fill and submit.
export function canEditChecklist(userRole: UserRole): boolean {
  return isAdminRole(userRole)
}

export type WorkflowStep = {
  n: number
  key: string
  label: string
  role: WorkflowRole
  kind: StepKind
  slug?: string // checklist definition slug (kind === 'checklist')
}

// A step read from the DB-driven workflow graph (lib/workflow-graph.ts,
// Phase 16+). Distinct from the legacy array-based WorkflowStep above — kept
// side by side so existing array callers are unaffected (see plan 16-02).
export type GraphStep = {
  id: string
  graph: string
  key: string
  label: string
  role: WorkflowRole
  kind: StepKind
  // v2.0 Phase 18.1 (ad hoc): EXTRA fulfillment kinds required on top of
  // `kind` — e.g. a step needing both a yes/no+upload AND an assignment.
  // null/empty = single-kind behavior, unchanged.
  additionalKinds?: StepKind[] | null
  slug?: string | null
  // Pool of roles an `assignment`-kind step's actor may pick a user from
  // (v2.0 Phase 19: widened from a single role to a list — e.g. Head
  // Designer picks from `design` OR `architect`).
  targetRoles?: WorkflowRole[] | null
  // v2.0 Phase 19 (ad hoc): narrows this role-gated step to one exact
  // `users.position` value. null = any user with `role` may act (unchanged
  // legacy behavior).
  requiredPosition?: string | null
  // v2.0 Phase 22 (ad hoc): for `approval`-kind steps only — narrows WHO may
  // RECEIVE (the second party) to one exact `users.position` value, distinct
  // from `requiredPosition` which (for approval steps) gates who may SEND.
  // null = receive is open to anyone who can act on the step and isn't the
  // sender (legacy behavior, T-16-07). E.g. Send for Production: `requiredPosition`
  // = head_of_operations (sender), `receiverRequiredPosition` = chief_production_officer.
  receiverRequiredPosition?: string | null
  // v2.0 Phase 22e (ad hoc): approval-kind steps only — narrows the receiver
  // to one exact ROLE (cross-role send/receive, e.g. factory_pm sends,
  // site_pm receives), distinct from receiverRequiredPosition (same-role,
  // different position). null = receive gates on the step's normal role
  // (legacy behavior unchanged).
  receiverRole?: WorkflowRole | null
  // v2.0 Phase 22e (ad hoc): legacy-engine (readiness/checklist) steps only —
  // when set, ALL of these roles must independently confirm before the step
  // advances (see confirmDualRoleStep in actions/workflow.ts). null = today's
  // single-actor behavior unchanged.
  dualRoles?: WorkflowRole[] | null
  isOptional: boolean
  orderIndex: number
  // Graph-canvas node placement only (Configurator graph view) — cosmetic,
  // never the source of execution order (that's orderIndex/edges).
  positionX?: number | null
  positionY?: number | null
}

// The full set of fulfillment kinds a step requires — primary + additional
// (v2.0 Phase 18.1). Order matters for UI rendering (primary kind's form
// shows first) but not for gating (completeGraphStep requires all of them).
export function stepRequiredKinds(step: Pick<GraphStep, 'kind' | 'additionalKinds'>): StepKind[] {
  return [step.kind, ...(step.additionalKinds ?? [])]
}

// Kinds that require a fulfilled workflow_step_states row before
// completeGraphStep will accept a non-skip completion. 'creation' is exempt
// — it's the project-intake kind, always first, never combined with
// anything. 'payment_confirmation'/'timeline_setting' are exempt because
// their own dedicated actions (confirmClientPaidAction, etc.) already
// hand-check their prerequisite kind's fulfillment before ever calling
// completeGraphStep, mirroring this same gate at the call site.
//
// 'checklist'/'readiness'/'ack' as a step's SOLE kind never reach this check
// at all — those go through the older, separate advanceProjectStep/
// confirmDualRoleStep/completeAckStepAction engine (actions/workflow.ts),
// which never calls completeGraphStep. They're listed here so that when one
// of them is stacked as an ADDITIONAL kind alongside a state-gated primary
// kind (e.g. confirmation_correction's yes_no_upload + ack + readiness),
// completeGraphStep actually refuses to finish the step until each has its
// own fulfilledKinds entry — recorded by submitAdditionalRequirementAction
// (ack/readiness) or submitChecklistAction's partial-fulfillment branch
// (checklist/readiness with a linked checklist slug). Before this, those
// three were silently unenforced whenever combined this way — see quick
// task readiness-ack-sync.
//
// Moved here from lib/workflow-graph.ts (quick task 260727-cp0) so the
// client-safe display layer (/workflow/step/page.tsx) can compute the same
// outstanding-kinds set as the server's authoritative gate below, without
// importing server-only code.
export const STATE_GATED_KINDS: StepKind[] = [
  'yes_no_upload',
  'approval',
  'assignment',
  'ack',
  'readiness',
  'checklist',
]

// quick task 260727-cp0: DISPLAY mirror of completeGraphStep's gate
// (lib/workflow-graph.ts) — the server stays authoritative there; this lives
// here (not duplicated) so the two can never drift. Returns the state-gated
// required kinds NOT yet present in fulfilledKinds, in stepRequiredKinds
// order. Used by /workflow/step/page.tsx to disable the page-level Complete
// step button and name what's still missing, purely for UX — it changes
// nothing about what the server actually accepts.
export function outstandingRequiredKinds(
  step: Pick<GraphStep, 'kind' | 'additionalKinds'>,
  fulfilledKinds: readonly string[] | null | undefined,
): StepKind[] {
  const fulfilled = fulfilledKinds ?? []
  return stepRequiredKinds(step).filter((k) => STATE_GATED_KINDS.includes(k) && !fulfilled.includes(k))
}

// quick task readiness-ack-sync: when a step's linked checklist (step.slug)
// is only ONE of several required kinds (stepRequiredKinds(step).length > 1
// — e.g. a yes_no_upload step with 'readiness' stacked as an additional
// kind), submitChecklistAction needs to know WHICH kind name to mark
// fulfilled in workflow_step_states. Prefers 'readiness' whenever it's
// present (primary or additional); falls back to 'checklist' otherwise —
// mirrors the two kinds a linked-checklist slug can back.
export function additionalRequirementKindFor(
  step: Pick<GraphStep, 'kind' | 'additionalKinds'>,
): 'readiness' | 'checklist' {
  return step.kind === 'readiness' || step.additionalKinds?.includes('readiness') ? 'readiness' : 'checklist'
}

// New projects begin awaiting the first actionable step (v2.0 Phase 22c:
// Assign Designer/Architect for Brief); step 1 (New Project) is completed by
// Customer Care/Operations at creation time. The Head Designer then
// manually assigns a Designer or Architect for the brief via the normal
// /workflow/step UI.
export const FIRST_ACTION_STEP = 2

// Shapes shared between the layout, the /api/my-work endpoint and the client
// provider that drives the header switcher + forcing gate.
// `gatedToUserId` (quick task 260713-ekr, security fix): non-null when this
// project's current step is one of the assignee-gated design steps
// (brief_taking/kickoff_meeting/design_stage) that already has an assignee
// recorded — set to that assignee's userId. null = not gated (either not a
// gated step, or gated but not yet assigned). Consumers (forcing modal,
// header switcher) must treat a gated project as "mine" only when the
// viewer's userId matches.
export type ActiveProject = {
  id: string
  name: string
  stepN: number
  deadline: string | null
  gatedToUserId: string | null
}
export type PendingWork = { projectId: string; name: string; stepN: number; deadline: string | null }
export type MyWork = { activeProjects: ActiveProject[]; pending: PendingWork[] }

// ── Pure, array-argument helpers (Phase 17, WF-06) ────────────────────────
// Take a steps array instead of closing over a module-level constant, so they
// work identically whether given the seed data (db/workflow-live-steps.ts) or
// a getLiveWorkflowSteps() result.
export function findStep<T extends WorkflowStep>(steps: T[], n: number): T | undefined {
  return steps.find((s) => s.n === n)
}

export function lastStepN(steps: WorkflowStep[]): number {
  return Math.max(...steps.map((s) => s.n))
}

export function projectComplete(currentStep: number, lastN: number): boolean {
  return currentStep > lastN
}

const ROLE_LABELS: Record<WorkflowRole, string> = {
  operations: 'Operations',
  site_pm: 'Site PM',
  factory_pm: 'Factory PM',
  super_admin: 'Super Admin',
  customer_care: 'Customer Care',
  design: 'Design',
  architect: 'Architect',
  factory_operations: 'Factory Operations',
  factory_manager: 'Factory Manager',
}

export function workflowRoleLabel(role: WorkflowRole): string {
  return ROLE_LABELS[role]
}

// Single source of truth for a user role's display label + home dashboard.
// Centralised so adding a department is a one-place change (see Roles above).
const USER_ROLE_LABELS: Record<UserRole, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
  operations: 'Operations',
  design: 'Design',
  production: 'Production',
  customer_care: 'Customer Care',
  architect: 'Architect',
  factory_operations: 'Factory Operations',
  factory_manager: 'Factory Manager',
}

export function userRoleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? 'User'
}

// Single source of truth for admin role <select> dropdowns. Derived from
// USER_ROLE_LABELS so it can never drift out of sync — do not hand-duplicate
// this list in components; import ALL_USER_ROLES instead.
export const ALL_USER_ROLES: { value: UserRole; label: string }[] = Object.entries(
  USER_ROLE_LABELS,
)
  .map(([value, label]) => ({ value: value as UserRole, label }))
  .sort((a, b) => a.label.localeCompare(b.label))

const ROLE_DASHBOARD: Record<UserRole, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
  operations: '/admin/dashboard',
  design: '/design/dashboard',
  production: '/production/dashboard',
  customer_care: '/customer-care/dashboard',
  architect: '/architect/dashboard',
  factory_operations: '/factory-operations/dashboard',
  factory_manager: '/factory-manager/dashboard',
}

export function roleDashboard(role: string): string {
  return ROLE_DASHBOARD[role as UserRole] ?? '/dashboard'
}

// Operations steps may also be actioned by a super_admin (full admin rights).
// Design steps may also be actioned by an Architect (v2.0 Phase 19/21) — the
// two roles share a step-acting pool even though Architect is its own role
// for dashboard/assignment-target purposes (resolved 2026-07-09: a targeted
// exception here, not a general role hierarchy, mirroring the existing
// Operations/super_admin special case rather than widening `role` itself).
export function canRoleActOnStep(stepRole: WorkflowRole, userRole: UserRole): boolean {
  if (stepRole === Roles.Operations) return isAdminRole(userRole)
  if (stepRole === Roles.Design) return userRole === Roles.Design || userRole === Roles.Architect
  return stepRole === userRole
}

// v2.0 Phase 22e: like canRoleActOnStep, but also true for a step's
// `dualRoles` (e.g. the merged Materials/Delivery Readiness step — BOTH
// factory_pm and site_pm can act on it, not just the step's primary `role`).
// Every "can this user act on / see this as pending work" check must use
// this instead of the bare role check, or the second dualRole silently never
// sees the step as theirs (see lib/my-work.ts, header-project-switcher.tsx,
// project-steps-board.tsx, admin/timeline).
export function canActOnGraphStep(
  step: { role: WorkflowRole; dualRoles?: WorkflowRole[] | null },
  userRole: UserRole,
): boolean {
  if (canRoleActOnStep(step.role, userRole)) return true
  return (step.dualRoles as string[] | null | undefined)?.includes(userRole) ?? false
}

// Pure formatter for dual-role step labels + progress copy (quick task
// 260727-pd3). It exists so the flow-diagram badge, the header "Waiting on
// …" string, both step-page banners, and both submit success screens can
// never drift apart, and so the dual-role wording ("Factory PM & Site PM",
// either party may act first) is authored exactly once. This is PRESENTATION
// ONLY — canActOnGraphStep/confirmDualRoleStepAs remain the authorization
// boundary; this helper never grants or denies anything, it only describes
// state that was already decided server-side.
export type DualRoleStatus = {
  isDual: boolean
  roles: WorkflowRole[]
  rolesLabel: string
  confirmedCount: number
  total: number
  outstanding: WorkflowRole[]
  outstandingLabel: string | null
  progressText: string | null
  recordedText: string | null
}

export function dualRoleStatus(
  step: { role: WorkflowRole; dualRoles?: WorkflowRole[] | null },
  confirmedRoles?: readonly string[] | null,
): DualRoleStatus {
  if (!step.dualRoles?.length) {
    const primaryRole = step.role
    return {
      isDual: false,
      roles: [primaryRole],
      rolesLabel: workflowRoleLabel(primaryRole),
      confirmedCount: 0,
      total: 1,
      outstanding: [],
      outstandingLabel: null,
      progressText: null,
      recordedText: null,
    }
  }

  const roles = step.dualRoles
  const rolesLabel = roles.map(workflowRoleLabel).join(' & ')
  const confirmed = confirmedRoles ?? []
  // Count against `roles`, never against `confirmedRoles.length` directly —
  // stray/unknown entries in the confirmed-roles array (should never happen,
  // but this is a display helper reading persisted data) can never inflate
  // the count past `total`.
  const confirmedList = roles.filter((r) => confirmed.includes(r))
  const outstanding = roles.filter((r) => !confirmed.includes(r))
  const confirmedCount = confirmedList.length
  const total = roles.length
  const outstandingLabel = outstanding.length ? outstanding.map(workflowRoleLabel).join(' & ') : null

  let progressText: string
  let recordedText: string
  if (confirmedCount === total) {
    progressText = 'Both roles confirmed — step complete.'
    recordedText = progressText
  } else if (confirmedCount === 0) {
    progressText = `Both ${rolesLabel} must confirm this step independently — neither has confirmed yet.`
    recordedText = `Recorded — ${confirmedCount} of ${total} confirmations. Waiting on ${outstandingLabel}.`
  } else {
    const confirmedLabel = confirmedList.map(workflowRoleLabel).join(' & ')
    progressText = `${confirmedCount} of ${total} confirmed — ${confirmedLabel} done, waiting on ${outstandingLabel}.`
    recordedText = `Recorded — ${confirmedCount} of ${total} confirmations. Waiting on ${outstandingLabel}.`
  }

  return {
    isDual: true,
    roles,
    rolesLabel,
    confirmedCount,
    total,
    outstanding,
    outstandingLabel,
    progressText,
    recordedText,
  }
}

// Checklist slugs that require photo evidence before submit. (The 2-image
// requirement lives on the Materials / Accessories Readiness Form, not here.)
export const REQUIRED_PHOTOS: Record<string, number> = {
  // v2.0 Phase 22: "has optimisation been done? ... upload document" — the
  // one required attachment for the Production Process checklist.
  production_process: 1,
  // Quick note (2026-07-31): step 15 was repointed to the fuller 10-section
  // production_quality_control form. Per-ITEM isPhotoRequired flags are stored
  // but never enforced at submit time (actions/checklists.ts only reads them
  // when editing a template), so without this per-SLUG entry the repoint would
  // have silently made photo evidence optional on the production step.
  production_quality_control: 1,
  // factory_manager_readiness deliberately absent: quick task 260717-cl0
  // replaced the incorrect flat "3 photos on the last step" rule with the
  // answer-gated, per-item rule below (missingConditionalPhotos).
}

// Quick task 260717-cl0: the Materials / Accessories Readiness checklist DB
// slug — shared constant so client and server agree on which checklist gets
// the answer-gated per-item photo rule and the mandatory-answer rule.
export const FM_READINESS_SLUG = 'factory_manager_readiness'

// The one item under factory_manager_readiness that stays fully optional
// (may be left unanswered, and only needs a photo if answered "yes").
// Matched by label (template items have no stable machine key yet) so the
// rule survives minor label edits.
export function isOptionalFmReadinessItem(item: { label: string }): boolean {
  return item.label.toLowerCase().includes('upholstery')
}

// Returns the ids of items answered "yes" but missing their required photo.
// Scoped to FM_READINESS_SLUG — every other checklist slug is untouched.
export function missingConditionalPhotos(
  slug: string,
  items: { id: string }[],
  answers: Record<string, { value?: string | null } | undefined>,
  photosByItem: Record<string, string[]>,
): string[] {
  if (slug !== FM_READINESS_SLUG) return []
  return items
    .filter((item) => answers[item.id]?.value === 'yes')
    .filter((item) => (photosByItem[item.id]?.length ?? 0) < 1)
    .map((item) => item.id)
}

// Returns the ids of mandatory-to-answer items (everything under
// factory_manager_readiness except the optional item) that are currently
// unanswered — including an answer object present with a blank/null value.
// Scoped to FM_READINESS_SLUG — every other checklist slug is untouched.
//
// A 'text' item is answered by its `textValue`, never by `value` (the wizard's
// text input only ever writes textValue). Before the 2026-07-31 rewrite this
// checklist was all radios, so the value-only rule held; the paper form's
// Project/Unit lines made it the first slug here with text items, and reading
// only `value` left the form permanently ungated-past — Next/Submit stayed
// disabled with "Answer this item before continuing" no matter what was typed.
export function missingRequiredAnswers(
  slug: string,
  items: { id: string; label: string; itemType?: string | null }[],
  answers: Record<string, { value?: string | null; textValue?: string | null } | undefined>,
): string[] {
  if (slug !== FM_READINESS_SLUG) return []
  return items
    .filter((item) => !isOptionalFmReadinessItem(item))
    .filter((item) =>
      item.itemType === 'text'
        ? !answers[item.id]?.textValue?.trim()
        : !answers[item.id]?.value,
    )
    .map((item) => item.id)
}

// Destination for an actionable step. `ack` steps are completed inline from the
// modal (no destination).
export function stepHref(
  step: WorkflowStep & { dualRoles?: WorkflowRole[] | null },
  projectId: string,
  viewerRole?: UserRole,
): string | null {
  const q = `?projectId=${projectId}&step=${step.n}`
  if (step.kind === 'checklist' && step.slug) return `/checklists/${step.slug}${q}`
  // v2.0 Phase 22e: a dualRoles 'readiness' step (e.g. merged Materials/
  // Delivery Readiness) still routes factory_pm to the rich readiness form,
  // but any OTHER dualRole (e.g. site_pm) gets the checklist page instead —
  // the readiness form/route is factory_pm-specific, not role-agnostic.
  if (step.kind === 'readiness' && step.dualRoles?.length && viewerRole && viewerRole !== Roles.FactoryPm) {
    return step.slug ? `/checklists/${step.slug}${q}` : null
  }
  if (step.kind === 'readiness') return `/factory-pm/readiness${q}`
  if (step.kind === 'payment_confirmation') return `/admin/payment-confirmation${q}`
  // v2.0 Phase 21: first LIVE use of these 3 kinds (Phase 17's migrated tail
  // never used them, only the Phase 16 test graph did) — route through the
  // same minimal /workflow/step renderer as the test graph, but explicitly
  // pinned to graph=live (the route defaults to 'test' otherwise) and keyed
  // by step.key, not step.n (getStepByKey looks up by key).
  if (
    step.kind === 'yes_no_upload' ||
    step.kind === 'approval' ||
    step.kind === 'assignment' ||
    step.kind === 'timeline_setting'
  ) {
    return `/workflow/step?projectId=${projectId}&step=${step.key}&graph=live`
  }
  return null
}

// Destination for an actionable GraphStep (DB-driven workflow, Phase 16+).
// The 3 new fulfillment kinds render through the minimal /workflow/step
// renderer (built in plan 05); 'ack' steps complete inline (no destination).
export function graphStepHref(step: GraphStep, projectId: string): string | null {
  const q = `?projectId=${projectId}&step=${step.key}&graph=live`
  if (step.kind === 'checklist' && step.slug) return `/checklists/${step.slug}${q}`
  if (step.kind === 'yes_no_upload' || step.kind === 'approval' || step.kind === 'assignment') {
    return `/workflow/step${q}`
  }
  return null
}
