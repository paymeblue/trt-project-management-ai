// ── Canonical 11-step bootstrap data for graph='live' ─────────────────────
// This is seed/bootstrap data ONLY — consumed by db/seed-workflow-graph.ts
// (and scripts/verify-live-workflow.ts's parity reference). The app runtime
// never imports this module; it reads steps from the DB via
// getLiveWorkflowSteps() (lib/workflow-graph.ts). Relocated verbatim from
// the retired WORKFLOW_STEPS literal in lib/workflow.ts (Phase 17 Plan 06,
// WF-06).

import type { WorkflowStep } from '@/lib/workflow'

export const LIVE_WORKFLOW_STEPS: WorkflowStep[] = [
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
