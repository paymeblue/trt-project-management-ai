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
} as const

export type UserRole = (typeof Roles)[keyof typeof Roles]
export type WorkflowRole = typeof Roles.Operations | typeof Roles.SitePm | typeof Roles.FactoryPm
export type StepKind = 'creation' | 'checklist' | 'readiness' | 'ack'

// True for roles with full admin rights (admin area, project creation, timeline).
export function isAdminRole(role: UserRole): boolean {
  return role === Roles.SuperAdmin || role === Roles.Operations
}

// Checklist definition audiences (mirrors the `target_role` enum on
// `checklist_definitions`). A `both` checklist is editable by either PM role.
export type ChecklistTargetRole = typeof Roles.FactoryPm | typeof Roles.SitePm | 'both'

// Who may edit a checklist's question text. Admins edit everything; a PM edits a
// checklist only when its audience matches their own role (or is `both`).
export function canEditChecklist(userRole: UserRole, targetRole: ChecklistTargetRole): boolean {
  if (isAdminRole(userRole)) return true
  if (targetRole === 'both') return userRole === Roles.FactoryPm || userRole === Roles.SitePm
  return userRole === targetRole
}

export type WorkflowStep = {
  n: number
  key: string
  label: string
  role: WorkflowRole
  kind: StepKind
  slug?: string // checklist definition slug (kind === 'checklist')
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
]

// New projects begin awaiting the first actionable step (Confirmation); step 1
// (New Project) is completed by Operations at creation time.
export const FIRST_ACTION_STEP = 2
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
}

export function workflowRoleLabel(role: WorkflowRole): string {
  return ROLE_LABELS[role]
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
