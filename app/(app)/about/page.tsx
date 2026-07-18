import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { staticContent } from '@/db/schema';
import { verifySession, isAdminRole } from '@/lib/dal';
import { updateAboutAction } from '@/actions/content';
import TrtFlowDiagram from '@/app/_components/trt-flow-diagram';
import { roleDashboard } from '@/lib/workflow';
import TabTokenForm from '@/app/_components/tab-token-form'

export const dynamic = 'force-dynamic';

const ROLES: { name: string; icon: string; blurb: string }[] = [
  {
    name: 'Customer Care',
    icon: 'support_agent',
    blurb:
      "First point of contact. Captures a client's intent from the intake call and creates their project (unpaid by default) — the very first step in the workflow.",
  },
  {
    name: 'Operations',
    icon: 'settings',
    blurb:
      'Confirms payment and sets the delivery timeline right after Customer Care creates a project, then approves commencement of on-site installation once the factory side is ready. Full admin rights alongside Super Admin.',
  },
  {
    name: 'Factory PM',
    icon: 'factory',
    blurb:
      'Runs the manufacturing floor. Completes the Delivery Project Checklist, tracks Product Readiness, and submits the Materials / Accessories Readiness Form (upload a signed scan or sign a digital version). Manages factory-floor projects and their Delivered / Not-Delivered status.',
  },
  {
    name: 'Site PM',
    icon: 'apartment',
    blurb:
      'Runs the installation site. Handles Confirmation / Verification, the full Project Production Checklist (Kitchen, Closet, Vanity, TV units), Delivery Site Readiness, Sorting, Change Requests and Close-Out, and keeps the Issue Log.',
  },
  {
    name: 'Design',
    icon: 'design_services',
    blurb:
      "The Head of Design assigns a Designer or Architect to take the client's brief, then again — a second, independent assignment — to begin the actual design work. The assigned person runs the Kickoff Meeting, Design Meeting, and Brief Taking, then produces the drawing and records the client's approval at Design Stage, handing off to Confirmation.",
  },
  {
    name: 'Architect',
    icon: 'architecture',
    blurb:
      'Sits in the same assignment pool as Design — the Head Designer can hand either a brief or the design work itself to an Architect just as they would a Designer. Own dashboard and nav, same as every other role.',
  },
  {
    name: 'Production',
    icon: 'precision_manufacturing',
    blurb:
      'Production department shell is live; its workflow steps (production authorization, factory process, QC) are being rolled out and will appear here once configured.',
  },
  {
    name: 'Factory Operations',
    icon: 'precision_manufacturing',
    blurb:
      'Runs the Production Process checklist on the factory floor — the optimisation document, then cutting, edging, drilling & grooving, spray, hardwood & upholstery, and glass/accessories.',
  },
  {
    name: 'Factory Manager',
    icon: 'verified',
    blurb:
      'Performs Quality Control immediately before Materials / Accessories Readiness — uploads the Material, Accessories and Upholstery readiness forms, prompting Factory PM and Site PM simultaneously.',
  },
  {
    name: 'Super Admin',
    icon: 'admin_panel_settings',
    blurb:
      'Oversees everything (largely read-only). Manages users and static content (About TRT, Email Formats), authors process flow charts, and monitors activity across every role. Created from the CLI only.',
  },
];

export default async function AboutPage() {
  const { role } = await verifySession();
  const [about] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'about_trt'))
    .limit(1);

  const body = about?.body ?? '';
  const isAdmin = isAdminRole(role);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a
        href={roleDashboard(role)}
        className="text-sm text-primary hover:underline"
      >
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">About TRT</h1>

      {isAdmin ? (
        <TabTokenForm
          action={updateAboutAction}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            Company info, policies, management team, website…
          </label>
          <textarea
            name="body"
            defaultValue={body}
            rows={12}
            placeholder="Write the About TRT content here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Save
          </button>
        </TabTokenForm>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
          {body ? (
            <p className="whitespace-pre-wrap">{body}</p>
          ) : (
            <p className="text-gray-400">
              No content yet. A Super Admin can add it here.
            </p>
          )}
        </div>
      )}

      {/* How work flows: Factory → Site, with Super Admin oversight */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        How it works — factory to site
      </h2>
      <TrtFlowDiagram />

      {/* Roles on the platform — organogram with Super Admin as the superior */}
      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Roles on the platform
      </h2>
      {(() => {
        const superior = ROLES.find((r) => r.name === 'Super Admin');
        const subs = ROLES.filter((r) => r.name !== 'Super Admin');
        return (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center">
              {/* Superior */}
              {superior && (
                <div className="w-full max-w-md rounded-xl border-2 border-primary bg-primary/5 p-5 text-center shadow-sm">
                  <div className="mb-1 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-primary">
                      {superior.icon}
                    </span>
                    <h3 className="text-base font-bold text-gray-900">
                      {superior.name}
                    </h3>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Oversees all roles
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {superior.blurb}
                  </p>
                </div>
              )}
              {/* Connectors */}
              <div className="h-6 w-px bg-gray-300" />
              <div className="h-px w-2/3 bg-gray-300" />
              {/* Subordinates */}
              <div className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap">
                {subs.map((r) => (
                  <div
                    key={r.name}
                    className="flex min-w-[220px] flex-1 flex-col items-center"
                  >
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">
                          {r.icon}
                        </span>
                        <h3 className="text-base font-semibold text-gray-900">
                          {r.name}
                        </h3>
                      </div>
                      <p className="text-sm leading-relaxed text-gray-600">
                        {r.blurb}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
