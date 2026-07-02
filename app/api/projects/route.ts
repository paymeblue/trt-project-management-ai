import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { getBoardProjects } from '@/lib/projects-board'

export const dynamic = 'force-dynamic'

// Polled by ProjectStepsBoard so newly created projects and step advances show
// up on the Projects page without a manual refresh.
export async function GET() {
  await verifySession()
  const board = await getBoardProjects()
  return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } })
}
