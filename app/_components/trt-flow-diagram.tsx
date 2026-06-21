// End-to-end flow of how work moves Factory PM → Site PM, with Super Admin
// overseeing both. Pure server component (styled boxes + arrows), responsive,
// dark-mode aware via semantic tokens.

type Step = { n: number; title: string; detail: string }

const FACTORY: Step[] = [
  { n: 1, title: 'Floor Project created', detail: 'A manufacturing job is opened with its delivery timeline.' },
  { n: 2, title: 'Delivery Project Checklist', detail: 'Production completed & quality-checked, items labelled, fragile wrapped.' },
  { n: 3, title: 'Materials / Accessories Readiness Form', detail: 'Confirm materials complete; sign digitally or upload the signed form.' },
  { n: 4, title: 'Mark Delivered → Dispatch', detail: 'Project status flips to Delivered and is handed to the Site PM.' },
]

const SITE: Step[] = [
  { n: 5, title: 'Confirmation / Verification', detail: 'On arrival, verify the delivery against the architect’s drawing with photos.' },
  { n: 6, title: 'Project Production Checklist', detail: 'Full QA across Kitchen, Closet, Vanity & TV units (boxes, doors, panels…).' },
  { n: 7, title: 'Delivery Site Readiness + Issue Log', detail: 'Confirm the site is ready; log and track any on-site issues.' },
  { n: 8, title: 'Close Out', detail: 'Final sign-off completes the project on site.' },
]

function Lane({
  label,
  sub,
  icon,
  steps,
}: {
  label: string
  sub: string
  icon: string
  steps: Step[]
}) {
  return (
    <div className="flex-1 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
        <div>
          <p className="text-sm font-bold text-on-surface">{label}</p>
          <p className="text-xs text-on-surface-variant">{sub}</p>
        </div>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li
            key={s.n}
            className="flex gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-on-surface">{s.title}</p>
              <p className="text-xs leading-relaxed text-on-surface-variant">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function TrtFlowDiagram() {
  return (
    <div>
      {/* Super Admin oversight banner spanning both lanes */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
          <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
        </span>
        <div>
          <p className="text-sm font-bold text-on-surface">Super Admin — oversight across everything</p>
          <p className="text-xs text-on-surface-variant">
            Monitors both lanes (read-only), manages users &amp; content, and authors the process
            flow charts. Cannot edit another Super Admin.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <Lane
          label="Factory PM"
          sub="Manufacturing floor"
          icon="factory"
          steps={FACTORY}
        />

        {/* Handoff connector */}
        <div className="flex items-center justify-center md:flex-col md:pt-24">
          <div className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow">
            <span className="material-symbols-outlined text-[16px]">local_shipping</span>
            Handoff
          </div>
          <span className="material-symbols-outlined rotate-90 text-on-surface-variant md:rotate-0">
            arrow_forward
          </span>
        </div>

        <Lane label="Site PM" sub="Installation site" icon="apartment" steps={SITE} />
      </div>

      <p className="mt-4 text-xs text-on-surface-variant">
        Throughout, anyone can ask <span className="font-semibold text-primary">Paul Arredo</span> (the
        PMI-certified AI assistant) for guidance, and teams coordinate via dashboard chat.
      </p>
    </div>
  )
}
