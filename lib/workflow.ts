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
} as const

export type UserRole = (typeof Roles)[keyof typeof Roles]
export type WorkflowRole =
  | typeof Roles.Operations
  | typeof Roles.SitePm
  | typeof Roles.FactoryPm
  | typeof Roles.SuperAdmin
export type StepKind =
  | 'creation'
  | 'checklist'
  | 'readiness'
  | 'ack'
  | 'yes_no_upload'
  | 'approval'
  | 'assignment'

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

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { n: 1, key: 'new_project', label: 'New Project', role: 'operations', kind: 'creation' },
  { n: 2, key: 'confirmation', label: 'Confirmation', role: 'site_pm', kind: 'checklist', slug: 'confirmation' },
  { n: 3, key: 'materials_readiness', label: 'Materials / Accessories Readiness', role: 'factory_pm', kind: 'readiness' },
  { n: 4, key: 'delivery_readiness', label: 'Delivery Readiness', role: 'site_pm', kind: 'checklist', slug: 'delivery_site_readiness' },
  { n: 5, key: 'delivery_project', label: 'Delivery Project Checklist', role: 'factory_pm', kind: 'checklist', slug: 'delivery_project' },
  { n: 6, key: 'project_check_report', label: 'Project Check Report', role: 'factory_pm', kind: 'checklist', slug: 'project_check_report' },
  { n: 7, key: 'approval_installation', label: 'Approval to Commence Installation', role: 'operations', kind: 'checklist', slug: 'approval_to_commence_installation' },
  { n: 8, key: 'installation_readiness', label: 'Installation Readiness', role: 'site_pm', kind: 'checklist', slug: 'installation_readiness' },
  { n: 9, key: 'sorting', label: 'Sorting', role: 'site_pm', kind: 'checklist', slug: 'sorting' },
  { n: 10, key: 'close_out', label: 'Close Out', role: 'site_pm', kind: 'checklist', slug: 'close_out' },
  { n: 11, key: 'sign_off', label: 'Sign Off', role: 'super_admin', kind: 'ack' },
]

// New projects begin awaiting the first actionable step (Confirmation); step 1
// (New Project) is completed by Operations at creation time.
export const FIRST_ACTION_STEP = 2
// Final step is the super_admin Sign Off (11); a project is only complete once it
// advances PAST it (currentStep 12). See isProjectComplete.
export const LAST_STEP = WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1].n // 11

// Shapes shared between the layout, the /api/my-work endpoint and the client
// provider that drives the header switcher + forcing gate.
export type ActiveProject = { id: string; name: string; stepN: number; deadline: string | null }
export type PendingWork = { projectId: string; name: string; stepN: number; deadline: string | null }
export type MyWork = { activeProjects: ActiveProject[]; pending: PendingWork[] }

export function stepByN(n: number): WorkflowStep | undefined {
  return WORKFLOW_STEPS.find((s) => s.n === n)
}

export function isProjectComplete(currentStep: number): boolean {
  return currentStep > LAST_STEP
}

const ROLE_LABELS: Record<WorkflowRole, string> = {
  operations: 'Operations',
  site_pm: 'Site PM',
  factory_pm: 'Factory PM',
  super_admin: 'Super Admin',
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
