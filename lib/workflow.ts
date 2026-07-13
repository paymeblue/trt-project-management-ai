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

// v2.0 Phase 19 (formal, plan 19-01): single source of truth backing both the
// `users.position` Postgres enum (db/schema.ts) and every position-picking UI
// (profile select, configurator). Derived from a live-data inspection
// (scripts/inspect-positions.ts) run 2026-07-11 — the union of the three
// baseline machine-gating values above plus every distinct verbatim value
// then stored in users.position / requiredPosition / receiverRequiredPosition
// (super-admin display titles like "MD"/"Head of Projects" analogues are kept
// verbatim so no title is lost, per decision D-19-01-B). No values were
// flagged as junk/placeholder at inspection time, so nothing was backfilled.
export const POSITION_VALUES = [
  'head_of_operations',
  'head_designer',
  'chief_production_officer',
  'Customer Rep',
  'Designer',
  'Factory Manager',
  'Head of design',
  'Lead Site Manager',
  'Operations manager admin',
] as const

export type PositionValue = (typeof POSITION_VALUES)[number]

// Display labels for the machine (snake_case) values only — the verbatim
// display-form values above already read as display text, so the UI falls
// back to the raw value for those (no entry needed).
export const POSITION_LABELS: Record<string, string> = {
  head_of_operations: 'Head of Operations',
  head_designer: 'Head Designer',
  chief_production_officer: 'Chief Production Officer',
}

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

// Who may author (create/edit) a checklist's questions. Super Admin and
// Operations both have full authoring rights; PM roles can still fill and
// submit checklists but not change the questions themselves.
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

// Checklist slugs that require photo evidence before submit. (The 2-image
// requirement lives on the Materials / Accessories Readiness Form, not here.)
export const REQUIRED_PHOTOS: Record<string, number> = {
  // v2.0 Phase 22: "has optimisation been done? ... upload document" — the
  // one required attachment for the Production Process checklist.
  production_process: 1,
  // v2.0 Phase 22: the Factory Manager's "3 readiness forms" (material,
  // accessories, upholstery) are captured as 3 required photo attachments,
  // mirroring the existing Materials/Accessories Readiness Form pattern.
  factory_manager_readiness: 3,
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
  if (step.kind === 'timeline_setting') return `/admin/invoice-timeline${q}`
  // v2.0 Phase 21: first LIVE use of these 3 kinds (Phase 17's migrated tail
  // never used them, only the Phase 16 test graph did) — route through the
  // same minimal /workflow/step renderer as the test graph, but explicitly
  // pinned to graph=live (the route defaults to 'test' otherwise) and keyed
  // by step.key, not step.n (getStepByKey looks up by key).
  if (step.kind === 'yes_no_upload' || step.kind === 'approval' || step.kind === 'assignment') {
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
  if (step.kind === 'timeline_setting') return `/admin/invoice-timeline?projectId=${projectId}`
  return null
}
