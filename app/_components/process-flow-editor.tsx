'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { saveProcessDiagramAction } from '@/actions/processes'
import type { ProcessDiagram } from '@/db/schema'

type FlowNode = Node<{ label: string }>

let idSeq = 0
function nextId(existing: FlowNode[]): string {
  // Keep ids unique even after reloads of saved diagrams.
  let n = existing.length + idSeq++ + 1
  const used = new Set(existing.map((x) => x.id))
  while (used.has(`n${n}`)) n++
  return `n${n}`
}

export default function ProcessFlowEditor({
  slug,
  initial,
}: {
  slug: string
  initial: ProcessDiagram | null
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
    (initial?.nodes as FlowNode[]) ?? [],
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    (initial?.edges as Edge[]) ?? [],
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const rfRef = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  )

  const addNode = useCallback(() => {
    setNodes((nds) => {
      const id = nextId(nds)
      // Drop the new node near the centre of the current viewport.
      const center = rfRef.current?.screenToFlowPosition?.({
        x: window.innerWidth / 2,
        y: 240,
      })
      const node: FlowNode = {
        id,
        position: center ?? { x: 120 + nds.length * 30, y: 80 + nds.length * 30 },
        data: { label: 'New step' },
      }
      return [...nds, node]
    })
  }, [setNodes])

  const renameSelected = useCallback(() => {
    const selected = nodes.find((n) => n.selected)
    if (!selected) {
      setErrorMsg('Select a node first, then Rename.')
      setStatus('error')
      return
    }
    const label = window.prompt('Step label', selected.data.label)
    if (label == null) return
    setNodes((nds) =>
      nds.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, label } } : n)),
    )
  }, [nodes, setNodes])

  const deleteSelected = useCallback(() => {
    const selNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const selEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    if (selNodeIds.size === 0 && selEdgeIds.size === 0) {
      setErrorMsg('Select a node or connection to delete.')
      setStatus('error')
      return
    }
    setNodes((nds) => nds.filter((n) => !selNodeIds.has(n.id)))
    setEdges((eds) =>
      eds.filter(
        (e) => !selEdgeIds.has(e.id) && !selNodeIds.has(e.source) && !selNodeIds.has(e.target),
      ),
    )
  }, [nodes, edges, setNodes, setEdges])

  const save = useCallback(async () => {
    setStatus('saving')
    setErrorMsg('')
    const diagram: ProcessDiagram = {
      nodes: nodes.map((n) => ({
        id: n.id,
        position: n.position,
        data: { label: n.data.label },
        type: n.type,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
    }
    const res = await saveProcessDiagramAction(slug, diagram)
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('error')
      setErrorMsg(res.error ?? 'Could not save.')
    }
  }, [nodes, edges, slug])

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3">
        <button
          type="button"
          onClick={addNode}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary/90"
        >
          + Add step
        </button>
        <button
          type="button"
          onClick={renameSelected}
          className="rounded-md border border-outline-variant px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-high"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          className="rounded-md border border-outline-variant px-3 py-1.5 text-sm text-on-surface hover:bg-surface-container-high"
        >
          Delete
        </button>
        <span className="ml-auto flex items-center gap-3">
          {status === 'saved' && <span className="text-sm text-green-600">Saved ✓</span>}
          {status === 'error' && <span className="text-sm text-error">{errorMsg}</span>}
          <button
            type="button"
            onClick={save}
            disabled={status === 'saving'}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-60"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </span>
      </div>
      <p className="px-4 pt-2 text-xs text-on-surface-variant">
        Drag to move. Drag from a node’s edge handle to another node to connect. Click a node then
        Rename to relabel.
      </p>
      <div style={{ height: 520 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => {
            rfRef.current = inst
          }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  )
}
