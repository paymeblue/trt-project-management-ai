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
} as const

export type UserRole = (typeof Roles)[keyof typeof Roles]
export type WorkflowRole =
  | typeof Roles.Operations
  | typeof Roles.SitePm
  | typeof Roles.FactoryPm
  | typeof Roles.SuperAdmin
  | typeof Roles.CustomerCare
export type StepKind =
  | 'creation'
  | 'checklist'
  | 'readiness'
  | 'ack'
  | 'yes_no_upload'
  | 'approval'
  | 'assignment'
  | 'payment_confirmation'

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
  slug?: string | null
  targetRole?: WorkflowRole | null
  isOptional: boolean
  orderIndex: number
}

// New projects begin awaiting the first actionable step (Confirmation); step 1
// (New Project) is completed by Operations at creation time.
export const FIRST_ACTION_STEP = 2

// Shapes shared between the layout, the /api/my-work endpoint and the client
// provider that drives the header switcher + forcing gate.
export type ActiveProject = { id: string; name: string; stepN: number; deadline: string | null }
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
}

export function roleDashboard(role: string): string {
  return ROLE_DASHBOARD[role as UserRole] ?? '/dashboard'
}

// Operations steps may also be actioned by a super_admin (full admin rights).
export function canRoleActOnStep(stepRole: WorkflowRole, userRole: UserRole): boolean {
  if (stepRole === Roles.Operations) return isAdminRole(userRole)
  return stepRole === userRole
}

// Checklist slugs that require photo evidence before submit. (The 2-image
// requirement lives on the Materials / Accessories Readiness Form, not here.)
export const REQUIRED_PHOTOS: Record<string, number> = {}

// Destination for an actionable step. `ack` steps are completed inline from the
// modal (no destination).
export function stepHref(step: WorkflowStep, projectId: string): string | null {
  const q = `?projectId=${projectId}&step=${step.n}`
  if (step.kind === 'checklist' && step.slug) return `/checklists/${step.slug}${q}`
  if (step.kind === 'readiness') return `/factory-pm/readiness${q}`
  if (step.kind === 'payment_confirmation') return `/admin/payment-confirmation${q}`
  return null
}

// Destination for an actionable GraphStep (DB-driven workflow, Phase 16+).
// The 3 new fulfillment kinds render through the minimal /workflow/step
// renderer (built in plan 05); 'ack' steps complete inline (no destination).
export function graphStepHref(step: GraphStep, projectId: string): string | null {
  const q = `?projectId=${projectId}&step=${step.key}`
  if (step.kind === 'checklist' && step.slug) return `/checklists/${step.slug}${q}`
  if (step.kind === 'yes_no_upload' || step.kind === 'approval' || step.kind === 'assignment') {
    return `/workflow/step${q}`
  }
  return null
}
