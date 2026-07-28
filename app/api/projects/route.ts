import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { getBoardProjects } from '@/lib/projects-board'
import type { UserRole } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

// Polled by ProjectStepsBoard so newly created projects and step advances show
// up on the Projects page without a manual refresh.
//
// Quick task 260728-cfn: this poll REPLACES the board's entire client state
// every 4s (see ProjectStepsBoard's refresh()), so passing `role` here is
// LOAD-BEARING — if this line were dropped, any gatedToUserId resolved by the
// server-rendered initial page would be silently overwritten with `null` a
// few seconds after load, un-gating the board for a non-assignee.
export async function GET() {
  const { role } = await verifySession()
  const board = await getBoardProjects(role as UserRole)
  return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } })
}
