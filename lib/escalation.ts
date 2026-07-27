import { Roles, isAdminRole, type UserRole } from '@/lib/workflow'

// Fixed escalation routing (items #9, #14): every checklist gets a flag
// button that escalates to a specific superior position based on the
// escalating user's role — never "all super admins" (that's the pre-existing
// pause/flag mechanism, REQ-G08, a deliberately different broadcast for a
// different purpose).
//
// - factory_pm / factory_manager / factory_operations -> Chief Production
//   Officer ("Obaji" — no separate "Chief Factory Officer" position exists
//   in the positions table; this is the closest/only factory-floor C-level
//   position, confirmed the same target item #9 names for step 15).
// - site_pm -> Head of Projects
// - design / architect -> Head of Design
// - customer_care -> Operations Admin
//
// Roles with no configured target (operations, super_admin, production) are
// deliberately left unmapped — there's no "superior" to escalate to for an
// already-senior/admin role in this scheme; the UI hides the button for them.
export const ESCALATION_TARGET_POSITION: Partial<Record<UserRole, string>> = {
  [Roles.FactoryPm]: 'chief_production_officer',
  [Roles.FactoryManager]: 'chief_production_officer',
  [Roles.FactoryOperations]: 'chief_production_officer',
  [Roles.SitePm]: 'head_of_projects',
  [Roles.Design]: 'head_of_design',
  [Roles.Architect]: 'head_of_design',
  [Roles.CustomerCare]: 'operations_manager_admin',
}

export function escalationTargetPosition(role: UserRole): string | null {
  return ESCALATION_TARGET_POSITION[role] ?? null
}

// Quick task 260727-gow (D-01): who may amend the checklist content behind
// an escalation. Pure and trivially unit-testable — no db, no session — so
// the server action (actions/escalation.ts) and the page's client-side
// render gate can never drift apart by each re-implementing this logic.
// `viewerPosition` must ALWAYS be a FRESH db read at the call site, never a
// session/JWT claim: position is mutable and the session token is not
// re-minted when it changes, so a stale claim could grant or deny stale
// access.
export function canAmendEscalation(
  role: UserRole,
  viewerPosition: string | null | undefined,
  targetPosition: string,
): boolean {
  return isAdminRole(role) || (!!viewerPosition && viewerPosition === targetPosition)
}
