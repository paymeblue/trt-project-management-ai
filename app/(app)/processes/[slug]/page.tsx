import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { processes } from '@/db/schema'
import Link from 'next/link'
import Mermaid from '@/app/_components/mermaid'
import ProcessExcalidraw from '@/app/_components/process-excalidraw'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

/** Pull the first ```mermaid fenced block out of the body; return [mermaid, rest]. */
function splitMermaid(body: string): { chart: string | null; rest: string } {
  const m = body.match(/```mermaid\s*([\s\S]*?)```/)
  if (!m) return { chart: null, rest: body }
  const rest = body.replace(m[0], '').trim()
  return { chart: m[1].trim(), rest }
}

export default async function ProcessDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await verifySession()
  const [proc] = await db.select().from(processes).where(eq(processes.slug, slug)).limit(1)

  if (!proc) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Link href="/processes" className="text-sm text-primary hover:underline">← Processes</Link>
        <p className="mt-6 text-gray-500">Process “{slug}” not found.</p>
      </div>
    )
  }

  const { chart, rest } = splitMermaid(proc.body)
  const hasDiagram =
    !!proc.diagram && Array.isArray(proc.diagram.elements) && proc.diagram.elements.length > 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/processes" className="text-sm text-primary hover:underline">← Processes</Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">{proc.title}</h1>

      {/* Visual flow chart — any PM can draw and save (Excalidraw). */}
      <section className="mb-6">
        <ProcessExcalidraw slug={proc.slug} initial={proc.diagram ?? null} />
      </section>

      {/* Legacy mermaid block (older processes authored before the visual editor) */}
      {!hasDiagram && chart && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <Mermaid chart={chart} />
        </div>
      )}

      {rest && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
          <p className="whitespace-pre-wrap">{rest}</p>
        </div>
      )}
    </div>
  )
}
