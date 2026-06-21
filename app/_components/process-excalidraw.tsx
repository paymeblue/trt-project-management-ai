'use client'

import { useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import '@excalidraw/excalidraw/index.css'
import { saveProcessSceneAction, createProcessWithSceneAction } from '@/actions/processes'
import type { ProcessScene } from '@/db/schema'

// Excalidraw touches `window`, so load it client-only. Cast to a loose prop
// shape to avoid friction with the dynamic import's generated types.
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false },
) as unknown as React.ComponentType<{
  initialData?: unknown
  excalidrawAPI?: (api: ExcalidrawApi) => void
}>

type ExcalidrawApi = {
  getSceneElements: () => readonly unknown[]
  getFiles: () => unknown
}

export default function ProcessExcalidraw({
  slug,
  initial,
  height = 600,
}: {
  slug?: string
  initial: ProcessScene | null
  height?: number
}) {
  const router = useRouter()
  const apiRef = useRef<ExcalidrawApi | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const sceneNow = useCallback((): ProcessScene => {
    const elements = (apiRef.current?.getSceneElements() ?? []) as unknown[]
    const files = apiRef.current?.getFiles()
    return { elements, files }
  }, [])

  // Edit mode: save into the existing process.
  const saveExisting = useCallback(async () => {
    if (!slug) return
    setStatus('saving')
    setError('')
    const res = await saveProcessSceneAction(slug, sceneNow())
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('error')
      setError(res.error ?? 'Could not save.')
    }
  }, [slug, sceneNow])

  // New mode: create the process with the name the user just typed.
  const createNew = useCallback(async () => {
    setStatus('saving')
    setError('')
    const res = await createProcessWithSceneAction(name, sceneNow())
    if (res.ok && res.slug) {
      setNaming(false)
      router.push(`/processes/${res.slug}`)
    } else {
      setStatus('error')
      setError(res.error ?? 'Could not save.')
    }
  }, [name, sceneNow, router])

  function onSaveClick() {
    if (slug) {
      saveExisting()
    } else {
      setError('')
      setNaming(true)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-4 py-3">
        <p className="text-sm font-medium text-on-surface">
          {slug ? 'Flow chart' : 'New flow chart'}
          <span className="ml-2 hidden text-xs font-normal text-on-surface-variant sm:inline">
            draw freely — boxes, arrows, text, sticky notes
          </span>
        </p>
        <span className="flex items-center gap-3">
          {status === 'saved' && <span className="text-sm text-green-600">Saved ✓</span>}
          {status === 'error' && <span className="text-sm text-error">{error}</span>}
          <button
            type="button"
            onClick={onSaveClick}
            disabled={status === 'saving'}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {status === 'saving' && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {slug ? 'Save' : 'Save as new'}
          </button>
        </span>
      </div>
      <div style={{ height }}>
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
          }}
          initialData={
            initial && Array.isArray(initial.elements)
              ? { elements: initial.elements, files: initial.files, scrollToContent: true }
              : undefined
          }
        />
      </div>

      {/* Name-on-save modal (new mode) */}
      {naming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Name this process</h3>
            <p className="mt-1 text-sm text-gray-500">Give your flow chart a clear title.</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') createNew()
              }}
              placeholder="e.g. Order Fulfillment"
              className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            {status === 'error' && <p className="mt-2 text-sm text-error">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createNew}
                disabled={status === 'saving' || !name.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {status === 'saving' ? 'Saving…' : 'Save process'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
