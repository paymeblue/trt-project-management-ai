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
//
// Grew again from 18 to 26 steps (v2.0 Phase 22, 2026-07-10) with the
// production-pipeline extension: Invoice (after Brief Taking), an
// Operations/Correction/Internal-Approval chain after Design Stage, Send for
// Production (two-party approval), Project Review & Authorisation,
// Production Process (Factory Operations checklist), and Factory
// Manager Readiness Forms (fans out to Materials Readiness + Delivery
// Readiness in parallel, replacing the old direct materials->delivery edge).
// See scripts/migrate-v2-production-pipeline.ts for that migration — it also
// repaired a prior Configurator-drag corruption of this same graph.
//
// Grew again from 26 to 27 steps (v2.0 Phase 22b, 2026-07-10): Payment
// Confirmation no longer collected deadlines — it just confirmed payment.
// A new 'invoice_timeline' step, Head of Operations only, did that once
// the invoice was uploaded: sets the overall delivery date + a deadline
// for every step from Design Initiation onward. Assign Designer and
// Brief Taking are handled manually before this point (Head Designer
// assigns; the assigned designer takes the brief), not a deadline
// collected here. See scripts/migrate-insert-invoice-timeline-step.ts for
// that migration.
//
// Shrank from 27 to 26 steps (v2.0 Phase 22c, 2026-07-10): removed
// 'payment_confirmation' entirely, per the user's original handwritten
// process notes — step 1 (Customer Care creates the project) is directly
// followed by step 2 (Head Designer assigns Architect for the brief), no
// separate approval step in between. Assign Designer/Architect for Brief is
// now the FIRST actionable step. See
// scripts/migrate-remove-payment-confirmation-step.ts for that migration.
//
// Shrank from 26 to 24 steps (v2.0 Phase 22d, 2026-07-10): removed
// 'design_meeting' entirely (kickoff_meeting -> design_stage directly), and
// merged 'delivery_project' + 'project_check_report' (both factory_pm
// checklists) into one combined step 'delivery_project_check' — its
// predecessors are materials_readiness AND delivery_readiness (inherited
// from project_check_report's join requirement), successor stays
// approval_installation. "Head of Operations" was also renamed to
// "Operations Manager" everywhere in the UI (the underlying `users.position`
// slug `head_of_operations` is unchanged for gating stability). See
// scripts/migrate-remove-design-meeting-merge-checks.ts for that migration.
//
// Shrank from 24 to 23 steps (v2.0 Phase 22e, ad hoc, 2026-07-11): merged
// 'materials_readiness' + 'delivery_readiness' into one dual-confirmation
// step — the graph's only remaining parallel branch/join collapsed to
// linear. Survivor is 'materials_readiness' (id preserved, factory_pm,
// kind=readiness), now carrying dualRoles=[factory_pm, site_pm] +
// checklistSlug='delivery_site_readiness' (site_pm's half routes to the
// same checklist 'delivery_readiness' used to own — see stepHref() in
// lib/workflow.ts). Both roles must independently confirm via
// confirmDualRoleStep (actions/workflow.ts) before the project advances.
// 'delivery_readiness' is removed; everything after it shifts orderIndex
// down by 1. See scripts/migrate-merge-readiness-dualroles.ts for that
// migration. receiverRole (also added this session) has NO live migration
// target — the only approval-kind step is still 'send_for_production'
// (operations -> chief_production_officer), not a factory_pm/site_pm
// delivery approval — so it ships Configurator-UI-only for future use.
//
// Shrank from 23 to 22 steps (quick task 260713-rb2, 2026-07-13): merged
// 'invoice_upload' (was mis-assigned to customer_care) and 'invoice_timeline'
// (operations, requiredPosition=head_of_operations) into ONE Operations-owned
// step at orderIndex 4 — invoice + timeline are one operational act, not two
// hops owned by two roles. Survivor is 'invoice_upload' (id preserved), now
// role=operations, kind=yes_no_upload, requiredPosition=null (D-01:
// role=operations already admits operations-role users AND super_admins via
// isAdminRole; a requiredPosition of head_of_operations would wrongly block
// a super_admin whose position isn't that exact slug). The DB row also
// carries additionalKinds=[timeline_setting] (not representable on the base
// WorkflowStep type here — see lib/workflow-graph.ts's GraphStep), which
// drives a 2-part wizard on /workflow/step: part 1 uploads the invoice, part
// 2 sets the delivery date + per-step deadlines, completing the step once.
// 'invoice_timeline' is removed; everything after it shifts orderIndex down
// by 1. See scripts/migrate-merge-invoice-upload-timeline.ts for that
// migration.
//
// Restructured from 22 to 21 steps (quick task 260714-qe4, workflow graph
// restructure batch 2, 2026-07-14 — see
// .planning/notes/2026-07-14-workflow-restructure-batch2.md): the merged
// invoice_upload UN-MERGES into two ownership-correct steps — 'invoice_upload'
// stays at 4, now labeled "Invoicing", role customer_care, a 2-phase step
// (1/2 uploads the invoice, 2/2 confirms the client paid, setting
// projects.paymentStatus='paid'; drives via additionalKinds=
// ['payment_confirmation'] on the live row — not representable on the base
// WorkflowStep type here); the timeline-setting half becomes a NEW step 5
// 'set_delivery_timeline' (role operations, kind timeline_setting, no
// position narrowing). 'ops_design_confirmation' (9) is replaced with
// "Assign Site PM for Site Confirmation" (role super_admin, requiredPosition
// head_of_projects, kind assignment, targetRoles=[site_pm] on the live row).
// 'confirmation' (site_pm checklist) MOVES from 14 to immediately after it
// (10), before confirmation_correction. 'installation_readiness' is removed
// entirely. 'sorting' + 'close_out' merge into ONE 'installation_process'
// checklist step (id preserved from 'sorting'; 'close_out' removed).
// 'sign_off' becomes role site_pm, kind yes_no_upload (was super_admin ack).
// See scripts/migrate-workflow-restructure-batch2.ts for that migration.

import type { WorkflowStep } from '@/lib/workflow';

export const LIVE_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    n: 1,
    key: 'new_project',
    label: 'Project Intent',
    role: 'customer_care',
    kind: 'creation',
  },
  {
    n: 2,
    key: 'assign_designer_brief',
    label: 'Assign Designer/Architect for Brief',
    role: 'design',
    kind: 'assignment',
  },
  {
    n: 3,
    key: 'brief_taking',
    label: 'Brief Taking',
    role: 'design',
    kind: 'yes_no_upload',
  },
  {
    // quick task 260714-qe4: now a 2-phase Customer Care step —
    // additionalKinds=[payment_confirmation] on the live DB row (not
    // representable on the base WorkflowStep type here). Phase 1/2 uploads
    // the invoice; phase 2/2 confirms the client paid, setting
    // projects.paymentStatus='paid'.
    n: 4,
    key: 'invoice_upload',
    label: 'Invoicing',
    role: 'customer_care',
    kind: 'yes_no_upload',
  },
  {
    // quick task 260714-qe4: NEW — split out of the former merged
    // invoice_upload step. requiredPosition=null (role=operations only).
    n: 5,
    key: 'set_delivery_timeline',
    label: 'Set Delivery Timeline',
    role: 'operations',
    kind: 'timeline_setting',
  },
  {
    n: 6,
    key: 'design_initiation',
    label: 'Design Initiation',
    role: 'design',
    kind: 'assignment',
  },
  {
    n: 7,
    key: 'kickoff_meeting',
    label: 'Kickoff Meeting',
    role: 'design',
    kind: 'yes_no_upload',
  },
  {
    n: 8,
    key: 'design_stage',
    label: 'Design Stage',
    role: 'design',
    kind: 'yes_no_upload',
  },
  {
    // quick task 260714-qe4: replaced — was "Operations Confirmation
    // (Design Approved)" (yes_no_upload). Now a Head-of-Projects assignment
    // step (requiredPosition=head_of_projects on the live row, not
    // representable on the base WorkflowStep type here) that assigns a
    // site_pm (targetRoles=[site_pm]) to carry out the site confirmation.
    n: 9,
    key: 'ops_design_confirmation',
    label: 'Assign Site PM for Site Confirmation',
    role: 'super_admin',
    kind: 'assignment',
  },
  {
    // quick task 260714-qe4: MOVED from orderIndex 14 to immediately after
    // the new Assign Site PM step (9) and before confirmation_correction.
    n: 10,
    key: 'confirmation',
    label: 'Confirmation',
    role: 'site_pm',
    kind: 'checklist',
    slug: 'confirmation',
  },
  {
    n: 11,
    key: 'confirmation_correction',
    label: 'Confirmation Correction (Upload Drawing)',
    role: 'design',
    kind: 'yes_no_upload',
  },
  {
    n: 12,
    key: 'internal_approval',
    label: 'Internal Approval (Upload Approved Drawing)',
    role: 'operations',
    kind: 'yes_no_upload',
  },
  {
    n: 13,
    key: 'send_for_production',
    label: 'Send for Production',
    role: 'operations',
    kind: 'approval',
  },
  {
    n: 14,
    key: 'project_review_authorisation',
    label: 'Project Review & Authorisation',
    role: 'operations',
    kind: 'yes_no_upload',
  },
  {
    n: 15,
    key: 'production_process',
    label: 'Production Process',
    role: 'factory_operations',
    kind: 'checklist',
    slug: 'production_process',
  },
  {
    n: 16,
    key: 'factory_manager_readiness',
    label: 'Factory Manager Readiness Forms',
    role: 'factory_manager',
    kind: 'checklist',
    slug: 'factory_manager_readiness',
  },
  {
    // v2.0 Phase 22e (ad hoc): merged with the former 'delivery_readiness'
    // step — this is now a dual-confirmation step (dualRoles=[factory_pm,
    // site_pm] on the live DB row; not representable on the base
    // WorkflowStep type here, see lib/workflow-graph.ts's LiveWorkflowStep).
    // checklistSlug carries over from delivery_readiness so the site_pm
    // dualRole routes to the same checklist (see stepHref() in
    // lib/workflow.ts).
    n: 17,
    key: 'materials_readiness',
    label: 'Materials / Accessories Readiness',
    role: 'factory_pm',
    kind: 'readiness',
    slug: 'delivery_site_readiness',
  },
  {
    n: 18,
    key: 'delivery_project_check',
    label: 'Delivery & Project Check',
    role: 'factory_pm',
    kind: 'checklist',
    slug: 'delivery_project_check',
  },
  {
    n: 19,
    key: 'approval_installation',
    label: 'Approval to Commence Installation',
    role: 'operations',
    kind: 'checklist',
    slug: 'approval_to_commence_installation',
  },
  {
    // quick task 260714-qe4: replaces 'sorting' + 'close_out' (id preserved
    // from 'sorting'; 'close_out' removed). 'installation_readiness' also
    // removed entirely (approval_installation already covers it).
    n: 20,
    key: 'installation_process',
    label: 'Installation Process',
    role: 'site_pm',
    kind: 'checklist',
    slug: 'installation_process',
  },
  {
    // quick task 260714-qe4: role changed to site_pm, kind changed to
    // yes_no_upload (was super_admin ack) — site_pm uploads the signed-off
    // document to close the project.
    n: 21,
    key: 'sign_off',
    label: 'Sign Off',
    role: 'site_pm',
    kind: 'yes_no_upload',
  },
];
