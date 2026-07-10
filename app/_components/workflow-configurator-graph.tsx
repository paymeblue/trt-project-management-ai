'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dagre from 'dagre'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  addConfigEdgeAction,
  removeConfigEdgeAction,
  updateConfigStepPositionAction,
} from '@/actions/workflow-config'
import type { GraphStep, WorkflowRole } from '@/lib/workflow'
import { ROLE_COLOR, KIND_OPTIONS, StepFieldsPanel } from '@/app/_components/workflow-configurator-shared'

type StepNodeData = { step: GraphStep; stepNumber: number }
type StepNode = Node<StepNodeData, 'stepNode'>

const NODE_WIDTH = 240
const NODE_HEIGHT = 84

function layout(nodes: StepNode[], edges: Edge[]): StepNode[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Left-to-right: with up to 18+ steps, a top-to-bottom layout gets too
  // tall to see the whole pipeline without zooming out to illegibility.
  // Left-to-right fits this canvas's wide-rectangle shape far better.
  g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90 })
  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { ...n, position: { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 } }
  })
}

function StepNodeCard({ data, selected }: NodeProps<StepNode>) {
  const { step, stepNumber } = data
  const color = ROLE_COLOR[step.role as WorkflowRole] ?? '#6b7280'
  const kindLabel = KIND_OPTIONS.find((k) => k.value === step.kind)?.label ?? step.kind
  return (
    <div
      style={{ borderColor: color, width: NODE_WIDTH }}
      className={`rounded-xl border-2 bg-white p-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div className="flex items-start gap-2">
        <span
          style={{ background: color }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        >
          {stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900" title={step.label}>
            {step.label}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              style={{ color, borderColor: color, backgroundColor: `${color}1a` }}
              className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
            >
              {step.role}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {kindLabel}
            </span>
            {step.additionalKinds?.map((k) => (
              <span
                key={k}
                className="rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                + {KIND_OPTIONS.find((o) => o.value === k)?.label ?? k}
              </span>
            ))}
            {step.requiredPosition && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                🔒 {step.requiredPosition}
              </span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  )
}

const nodeTypes = { stepNode: StepNodeCard }

function GraphInner({
  graph,
  steps,
  edges: initialEdgeList,
  onChanged,
}: {
  graph: string
  steps: GraphStep[]
  edges: { fromStepId: string; toStepId: string }[]
  onChanged: () => void
}) {
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps])
  const orderedIndex = useMemo(() => new Map(steps.map((s, i) => [s.id, i + 1])), [steps])

  const initialNodes = useMemo<StepNode[]>(() => {
    const built = steps.map((step) => ({
      id: step.id,
      type: 'stepNode' as const,
      position: { x: step.positionX ?? 0, y: step.positionY ?? 0 },
      data: { step, stepNumber: orderedIndex.get(step.id) ?? 0 },
    }))
    const hasAnyPersistedPosition = steps.some((s) => s.positionX != null && s.positionY != null)
    if (hasAnyPersistedPosition) return built
    const initialEdges = initialEdgeList.map((e) => ({ id: `${e.fromStepId}->${e.toStepId}`, source: e.fromStepId, target: e.toStepId }))
    return layout(built, initialEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute only when the step/edge set itself changes, not on every render
  }, [steps])

  const initialEdges = useMemo<Edge[]>(
    () =>
      initialEdgeList.map((e) => ({
        id: `${e.fromStepId}->${e.toStepId}`,
        source: e.fromStepId,
        target: e.toStepId,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      })),
    [initialEdgeList],
  )

  const [nodes, setNodes, onNodesChangeDefault] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChangeDefault] = useEdgesState(initialEdges)
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [edgeError, setEdgeError] = useState<string | null>(null)

  // Re-sync when the server data changes underneath us (e.g. after a
  // side-panel save triggers a full refresh from the parent).
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges])

  const onNodesChange = useCallback(
    (changes: NodeChange<StepNode>[]) => {
      onNodesChangeDefault(changes)
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateConfigStepPositionAction(change.id, change.position.x, change.position.y)
        }
      }
    },
    [onNodesChangeDefault],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          const removed = edges.find((e) => e.id === change.id)
          if (removed) {
            removeConfigEdgeAction(graph, removed.source, removed.target).then((res) => {
              if (res.status === 'error') {
                setEdgeError(res.message ?? 'Could not remove that connection.')
                onChanged()
              }
            })
          }
        }
      }
      onEdgesChangeDefault(changes)
    },
    [edges, graph, onChanged, onEdgesChangeDefault],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdgeError(null)
      setEdges((eds) =>
        addEdge({ ...connection, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds),
      )
      addConfigEdgeAction(graph, connection.source, connection.target).then((res) => {
        if (res.status === 'error') {
          setEdgeError(res.message ?? 'Could not create that connection.')
          onChanged()
        }
      })
    },
    [graph, onChanged, setEdges],
  )

  const selectedStep = selectedStepId ? stepById.get(selectedStepId) : null

  return (
    <div className="flex gap-4">
      <div
        className="h-[420px] flex-1 overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
        style={{ minWidth: 0 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedStepId(node.id)}
          onPaneClick={() => setSelectedStepId(null)}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultViewport={{ x: 40, y: 40, zoom: 0.75 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {selectedStep && (
        <div className="w-[380px] shrink-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Step {orderedIndex.get(selectedStep.id)} · {selectedStep.key}
              </p>
              <h3 className="text-sm font-bold text-gray-900">{selectedStep.label}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStepId(null)}
              className="text-gray-400 hover:text-gray-600"
              title="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <StepFieldsPanel step={selectedStep} onSaved={onChanged} />
        </div>
      )}

      {!selectedStep && (
        <div className="flex w-[380px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-400">
          <span className="material-symbols-outlined mb-2 text-3xl text-gray-300">touch_app</span>
          Click any step on the canvas to edit it here.
          <br />
          Drag between the small dots on a step&rsquo;s top/bottom edge to connect it to another step.
          {edgeError && <p className="mt-3 text-error">{edgeError}</p>}
        </div>
      )}
    </div>
  )
}

export default function ConfiguratorGraph(props: {
  graph: string
  steps: GraphStep[]
  edges: { fromStepId: string; toStepId: string }[]
  onChanged: () => void
}) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  )
}
