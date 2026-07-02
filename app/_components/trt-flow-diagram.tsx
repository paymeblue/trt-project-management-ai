// End-to-end workflow, rendered straight from WORKFLOW_STEPS (the single source
// of truth in lib/workflow.ts) so the diagram can never drift out of order. It
// is the real interleaved sequence — Operations → Site PM → Factory PM → … —
// not a Factory/Site two-lane handoff. Pure server component, dark-mode aware
// via semantic tokens; role accent colours are fixed hues legible on both themes.

import { WORKFLOW_STEPS, workflowRoleLabel, type WorkflowRole } from '@/lib/workflow'

const ROLE_COLOR: Record<WorkflowRole, string> = {
  operations: '#6366f1', // indigo
  site_pm: '#0ea5e9', // sky
  factory_pm: '#f97316', // orange
  super_admin: '#059669', // emerald
}

// Short, role-accurate blurbs keyed by the canonical step key.
const DETAIL: Record<string, string> = {
  new_project: 'Operations opens the project and sets its delivery timeline.',
  confirmation: 'Site PM confirms the project details to start the workflow.',
  materials_readiness:
    'Factory PM confirms materials & accessories are complete — sign digitally or upload the signed form.',
  delivery_readiness: 'Site PM confirms the site is ready to receive the delivery.',
  delivery_project:
    'Factory PM completes production QA — items labelled, fragile-wrapped, ready to dispatch.',
  project_check_report: 'Factory PM records the final production check report before handoff.',
  approval_installation: 'Operations approves commencement of on-site installation.',
  installation_readiness: 'Site PM confirms everything is ready to begin installation.',
  sorting: 'Site PM sorts and stages the delivered items on site.',
  close_out: 'Site PM completes the on-site close-out checklist.',
  sign_off: 'Super Admin gives the final sign-off — the project is complete only after this.',
}

const ROLES: WorkflowRole[] = ['operations', 'site_pm', 'factory_pm', 'super_admin']

export default function TrtFlowDiagram() {
  return (
    <div>
      {/* Super Admin oversight banner */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
        </span>
        <div>
          <p className="text-sm font-bold text-on-surface">Super Admin — oversight across everything</p>
          <p className="text-xs text-on-surface-variant">
            Monitors every step (read-only), manages users &amp; content, and authors the process
            flow charts. Cannot edit another Super Admin.
          </p>
        </div>
      </div>

      {/* Role legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {ROLES.map((role) => (
          <span key={role} className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">
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
        {WORKFLOW_STEPS.map((step, i) => {
          const color = ROLE_COLOR[step.role]
          const last = i === WORKFLOW_STEPS.length - 1
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
                {!last && <span className="my-1 w-px flex-1 bg-outline-variant" />}
              </div>

              <div className={`flex-1 ${last ? '' : 'pb-4'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-on-surface">{step.label}</p>
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
          )
        })}
      </ol>

      <p className="mt-4 text-xs text-on-surface-variant">
        Throughout, anyone can ask <span className="font-semibold text-primary">Paul Arredo</span> (the
        PMI-certified AI assistant) for guidance, and teams coordinate via dashboard chat.
      </p>
    </div>
  )
}
