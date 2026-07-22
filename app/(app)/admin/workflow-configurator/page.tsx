import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { checklistDefinitions } from '@/db/schema'
import { verifySession, isAdminRole } from '@/lib/dal'
import type { UserRole } from '@/lib/workflow'
import { getGraphSteps, getGraphEdges, getConfigAccess } from '@/lib/workflow-graph'
import { getPositions } from '@/lib/positions'
import { isConfiguratorUnlocked } from '@/actions/workflow-config'
import ConfiguratorPinGate from '@/app/_components/workflow-configurator-pin-gate'
import ConfiguratorEditor from '@/app/_components/workflow-configurator-editor'

export const dynamic = 'force-dynamic'

const GRAPH = 'live'

export default async function WorkflowConfiguratorPage() {
  const { role } = await verifySession()

  if (!isAdminRole(role as UserRole)) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Workflow Configurator</h1>
        <p className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Only a super admin or Operations can reach the workflow configurator.
        </p>
      </div>
    )
  }

  const unlocked = await isConfiguratorUnlocked()

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Workflow Configurator</h1>
      <p className="mb-6 text-sm text-gray-500">
        Add, remove, reorder, and edit every step in the live project workflow — no code change or
        redeploy needed.
      </p>

      {!unlocked ? (
        <ConfiguratorPinGate hint={(await getConfigAccess()).hint} />
      ) : (
        <ConfiguratorEditorSection />
      )}
    </div>
  )
}

async function ConfiguratorEditorSection() {
  const steps = await getGraphSteps(GRAPH)
  const edges = await getGraphEdges(GRAPH)
  const access = await getConfigAccess()
  const positions = await getPositions()
  // Quick task readiness-ack-sync (UX follow-up): fed to the "Which
  // checklist?" picker (workflow-configurator-shared.tsx) so a super admin
  // chooses an existing checklist by its real NAME instead of typing a raw
  // slug from memory — the raw-text-field version led directly to someone
  // typing a literal question ("has this been uploaded?") into the slug
  // field, since nothing there hinted what a "slug" even was.
  const checklists = await db
    .select({ slug: checklistDefinitions.slug, name: checklistDefinitions.name })
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.isActive, true))
    .orderBy(asc(checklistDefinitions.name))
  return (
    <ConfiguratorEditor
      graph={GRAPH}
      steps={steps}
      edges={edges}
      currentHint={access.hint}
      positions={positions}
      checklists={checklists}
    />
  )
}
