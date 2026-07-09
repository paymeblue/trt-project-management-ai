// ── Canonical 12-step bootstrap data for graph='live' ─────────────────────
// This is seed/bootstrap data ONLY — consumed by db/seed-workflow-graph.ts
// (and scripts/verify-live-workflow.ts's parity reference). The app runtime
// never imports this module; it reads steps from the DB via
// getLiveWorkflowSteps() (lib/workflow-graph.ts). Relocated verbatim from
// the retired WORKFLOW_STEPS literal in lib/workflow.ts (Phase 17 Plan 06,
// WF-06). Grew from 11 to 12 steps when Payment Confirmation & Timeline was
// inserted as step 2 (v2.0, STG-01/PAY-01/PAY-02) — step 1's role changed
// from operations to customer_care (Project Intent), and every step from the
// former step 2 onward shifted down by one. See
// scripts/migrate-insert-payment-confirmation-step.ts for the one-time data
// migration that shifted existing projects' currentStep/deadlines to match.

import type { WorkflowStep } from '@/lib/workflow'

export const LIVE_WORKFLOW_STEPS: WorkflowStep[] = [
  { n: 1, key: 'new_project', label: 'Project Intent', role: 'customer_care', kind: 'creation' },
  { n: 2, key: 'payment_confirmation', label: 'Payment Confirmation & Timeline', role: 'operations', kind: 'payment_confirmation' },
  { n: 3, key: 'confirmation', label: 'Confirmation', role: 'site_pm', kind: 'checklist', slug: 'confirmation' },
  { n: 4, key: 'materials_readiness', label: 'Materials / Accessories Readiness', role: 'factory_pm', kind: 'readiness' },
  { n: 5, key: 'delivery_readiness', label: 'Delivery Readiness', role: 'site_pm', kind: 'checklist', slug: 'delivery_site_readiness' },
  { n: 6, key: 'delivery_project', label: 'Delivery Project Checklist', role: 'factory_pm', kind: 'checklist', slug: 'delivery_project' },
  { n: 7, key: 'project_check_report', label: 'Project Check Report', role: 'factory_pm', kind: 'checklist', slug: 'project_check_report' },
  { n: 8, key: 'approval_installation', label: 'Approval to Commence Installation', role: 'operations', kind: 'checklist', slug: 'approval_to_commence_installation' },
  { n: 9, key: 'installation_readiness', label: 'Installation Readiness', role: 'site_pm', kind: 'checklist', slug: 'installation_readiness' },
  { n: 10, key: 'sorting', label: 'Sorting', role: 'site_pm', kind: 'checklist', slug: 'sorting' },
  { n: 11, key: 'close_out', label: 'Close Out', role: 'site_pm', kind: 'checklist', slug: 'close_out' },
  { n: 12, key: 'sign_off', label: 'Sign Off', role: 'super_admin', kind: 'ack' },
]
