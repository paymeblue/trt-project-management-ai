// End-to-end workflow, rendered straight from the live DB-driven step graph
// (Phase 17, WF-06 — getLiveWorkflowSteps()) so the diagram can never drift out
// of order. It is the real interleaved sequence — Operations → Site PM →
// Factory PM → … — not a Factory/Site two-lane handoff. Async server
// component, dark-mode aware via semantic tokens; role accent colours are
// fixed hues legible on both themes.

import { getLiveWorkflowSteps } from '@/lib/workflow-graph';
import { workflowRoleLabel, type WorkflowRole } from '@/lib/workflow';

const ROLE_COLOR: Record<WorkflowRole, string> = {
  operations: '#6366f1', // indigo
  site_pm: '#0ea5e9', // sky
  factory_pm: '#f97316', // orange
  super_admin: '#059669', // emerald
  customer_care: '#d946ef', // fuchsia
  design: '#e11d48', // rose
  architect: '#a855f7', // purple
  factory_operations: '#ca8a04', // amber
  factory_manager: '#0d9488', // teal
};

// Short, role-accurate blurbs keyed by the canonical step key.
const DETAIL: Record<string, string> = {
  new_project:
    "Customer Care captures the client's intent and creates the project (unpaid by default).",
  assign_designer_brief:
    "Head Designer manually assigns a Designer or Architect to take the client's brief (1 day).",
  kickoff_meeting:
    'The assigned designer holds the kickoff meeting with the client.',
  brief_taking:
    'The assigned designer records the brief taken from the client (2 days).',
  invoice_upload:
    'Customer Care confirms the invoice has been sent to the client and uploads it (1/2), then confirms once the client has finally paid, marking the project paid (2/2).',
  set_delivery_timeline:
    'Operations sets the overall delivery date and a deadline for every remaining step (1-day target).',
  design_initiation:
    'Head Designer assigns a designer to begin actual design work.',
  design_stage:
    "The assigned designer produces the drawing and records the client's approval.",
  ops_design_confirmation:
    'Head of Projects assigns a Site PM to carry out the site confirmation.',
  confirmation_correction:
    'The designer re-uploads the corrected drawing — only the front page of the drawing is to be sent/uploaded.',
  internal_approval:
    'Operations Manager (Admin) uploads the internally approved drawing.',
  send_for_production:
    'Operations approves the design and sends to the Factory (1/2); the Chief Production Officer approves for production (2/2).',
  project_review_authorisation:
    'The Chief Production Officer reviews the drawing and authorises production.',
  production_process:
    'Factory Operations works through the production checklist (optimisation, cutting, edging, drilling & grooving, spray, hardwood & upholstery, glass).',
  factory_manager_readiness:
    'Factory Manager uploads the 3 readiness forms (material, upholstery, accessories), prompting Factory PM and Site PM simultaneously.',
  confirmation:
    'The Site PM assigned above confirms the project details to start the on-site workflow.',
  materials_readiness:
    'Dual confirmation (v2.0 Phase 22e): Factory PM confirms materials & accessories are complete (sign digitally or upload the signed form) AND Site PM confirms the site is ready to receive the delivery — both must confirm independently before the project advances.',
  delivery_project_check:
    'Factory PM completes production QA (labelled, fragile-wrapped, ready to dispatch) and records the final project check report.',
  approval_installation:
    'Operations approves commencement of on-site installation.',
  installation_process:
    'Site PM completes one on-site checklist covering sorting, execution (installation), and close-out.',
  sign_off:
    'Site PM uploads the signed-off document to close the project.',
};

const ROLES: WorkflowRole[] = [
  'customer_care',
  'operations',
  'design',
  'architect',
  'site_pm',
  'factory_pm',
  'factory_operations',
  'factory_manager',
  'super_admin',
];

export default async function TrtFlowDiagram() {
  const steps = await getLiveWorkflowSteps();
  return (
    <div>
      {/* Super Admin oversight banner */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
          <span className="material-symbols-outlined text-[20px]">
            admin_panel_settings
          </span>
        </span>
        <div>
          <p className="text-sm font-bold text-on-surface">
            Super Admin — oversight across everything
          </p>
          <p className="text-xs text-on-surface-variant">
            Monitors every step (read-only), manages users &amp; content, and
            authors the process flow charts. Cannot edit another Super Admin.
          </p>
        </div>
      </div>

      {/* Role legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {ROLES.map((role) => (
          <span
            key={role}
            className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: ROLE_COLOR[role] }}
            />
            {workflowRoleLabel(role)}
          </span>
        ))}
      </div>

      {/* Sequential timeline */}
      <ol className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        {steps.map((step, i) => {
          const color = ROLE_COLOR[step.role];
          const last = i === steps.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              {/* Number badge + connecting rail */}
              <div className="flex flex-col items-center">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {step.n}
                </span>
                {!last && (
                  <span className="my-1 w-px flex-1 bg-outline-variant" />
                )}
              </div>

              <div className={`flex-1 ${last ? '' : 'pb-4'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">
                    {step.label}
                  </p>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {workflowRoleLabel(step.role)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
                  {DETAIL[step.key]}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-on-surface-variant">
        Throughout, anyone can ask{' '}
        <span className="font-semibold text-primary">Paul Arredo</span> (the
        PMI-certified AI assistant) for guidance, and teams coordinate via
        dashboard chat.
      </p>
    </div>
  );
}
