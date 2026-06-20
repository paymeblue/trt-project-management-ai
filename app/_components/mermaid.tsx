'use client'

import { useEffect, useId, useRef, useState } from 'react'

interface MermaidProps {
  chart: string
}

export default function Mermaid({ chart }: MermaidProps) {
  const id = useId()
  // Replace chars that are invalid in HTML ids
  const safeId = 'm' + id.replace(/:/g, '-')
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chart.trim()) return

    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'default' })
        const { svg } = await mermaid.render(safeId, chart)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [chart, safeId])

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-md bg-gray-100 p-4 text-sm text-gray-700 whitespace-pre-wrap">
        {chart}
      </pre>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-4 overflow-x-auto rounded-md border border-gray-200 bg-white p-4"
      aria-label="Flow chart diagram"
    />
  )
}
