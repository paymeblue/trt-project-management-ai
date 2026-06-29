import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { projects } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import type { BoardProject } from '@/app/_components/project-steps-board'

export const dynamic = 'force-dynamic'

// Polled by ProjectStepsBoard so newly created projects and step advances show
// up on the Projects page without a manual refresh.
export async function GET() {
  await verifySession()
  const rows = await db.select().from(projects).orderBy(desc(projects.createdAt))

  const board: BoardProject[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    deliveryDate: p.deliveryDate ? p.deliveryDate.toISOString() : null,
    currentStep: p.currentStep,
    status: p.status,
  }))

  return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } })
}
