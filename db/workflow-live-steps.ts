// ── Canonical 18-step bootstrap data for graph='live' ──────────────────────
// This is seed/bootstrap data ONLY — consumed by db/seed-workflow-graph.ts
// (and scripts/verify-live-workflow.ts's parity reference). The app runtime
// never imports this module; it reads steps from the DB via
// getLiveWorkflowSteps() (lib/workflow-graph.ts). Relocated verbatim from
// the retired WORKFLOW_STEPS literal in lib/workflow.ts (Phase 17 Plan 06,
// WF-06). Grew from 11 to 12 steps when Payment Confirmation & Timeline was
// inserted as step 2 (v2.0, STG-01/PAY-01/PAY-02) — step 1's role changed
// from operations to customer_care (Project Intent), and every step from the
// former step 2 onward shifted down by one. See
// scripts/migrate-insert-payment-confirmation-step.ts for that migration.
//
// Grew again from 12 to 18 steps (v2.0 Phase 21, STG-02..07) when 6 Design
// steps were inserted between Payment Confirmation (2) and Confirmation
// (was 3, now 9): Head Designer assigns a Designer/Architect for the brief,
// Brief Taking, a SECOND distinct Head Designer assignment (Design
// Initiation — may differ from the first), Kickoff Meeting, Design Meeting,
// and Design Stage client approval. This order matches the user's original
// handwritten process notes (assignment -> brief taken immediately ->
// second assignment -> kickoff meetings -> design stage), reconciled
// 2026-07-10 after an initial build used a different order. Everything from
// the former step 3 onward shifted down by 6, otherwise byte-for-byte
// unchanged. See scripts/migrate-insert-design-stages.ts for that migration.

import type { WorkflowStep } from '@/lib/workflow'

export const LIVE_WORKFLOW_STEPS: WorkflowStep[] = [
  { n: 1, key: 'new_project', label: 'Project Intent', role: 'customer_care', kind: 'creation' },
  { n: 2, key: 'payment_confirmation', label: 'Payment Confirmation & Timeline', role: 'operations', kind: 'payment_confirmation' },
  { n: 3, key: 'assign_designer_brief', label: 'Assign Designer/Architect for Brief', role: 'design', kind: 'assignment' },
  { n: 4, key: 'brief_taking', label: 'Brief Taking', role: 'design', kind: 'yes_no_upload' },
  { n: 5, key: 'design_initiation', label: 'Design Initiation', role: 'design', kind: 'assignment' },
  { n: 6, key: 'kickoff_meeting', label: 'Kickoff Meeting', role: 'design', kind: 'yes_no_upload' },
  { n: 7, key: 'design_meeting', label: 'Design Meeting', role: 'design', kind: 'yes_no_upload' },
  { n: 8, key: 'design_stage', label: 'Design Stage', role: 'design', kind: 'yes_no_upload' },
  { n: 9, key: 'confirmation', label: 'Confirmation', role: 'site_pm', kind: 'checklist', slug: 'confirmation' },
  { n: 10, key: 'materials_readiness', label: 'Materials / Accessories Readiness', role: 'factory_pm', kind: 'readiness' },
  { n: 11, key: 'delivery_readiness', label: 'Delivery Readiness', role: 'site_pm', kind: 'checklist', slug: 'delivery_site_readiness' },
  { n: 12, key: 'delivery_project', label: 'Delivery Project Checklist', role: 'factory_pm', kind: 'checklist', slug: 'delivery_project' },
  { n: 13, key: 'project_check_report', label: 'Project Check Report', role: 'factory_pm', kind: 'checklist', slug: 'project_check_report' },
  { n: 14, key: 'approval_installation', label: 'Approval to Commence Installation', role: 'operations', kind: 'checklist', slug: 'approval_to_commence_installation' },
  { n: 15, key: 'installation_readiness', label: 'Installation Readiness', role: 'site_pm', kind: 'checklist', slug: 'installation_readiness' },
  { n: 16, key: 'sorting', label: 'Sorting', role: 'site_pm', kind: 'checklist', slug: 'sorting' },
  { n: 17, key: 'close_out', label: 'Close Out', role: 'site_pm', kind: 'checklist', slug: 'close_out' },
  { n: 18, key: 'sign_off', label: 'Sign Off', role: 'super_admin', kind: 'ack' },
]
