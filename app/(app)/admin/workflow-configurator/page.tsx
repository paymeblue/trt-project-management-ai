import { verifySession, isAdminRole } from '@/lib/dal'
import type { UserRole } from '@/lib/workflow'
import { getGraphSteps, getGraphEdges, getConfigAccess } from '@/lib/workflow-graph'
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
  return <ConfiguratorEditor graph={GRAPH} steps={steps} edges={edges} currentHint={access.hint} />
}
