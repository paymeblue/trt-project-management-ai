import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { getMyWork } from '@/lib/my-work'
import type { UserRole } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

// Polled by MyWorkProvider so the header switcher + forcing gate stay current
// without a manual refresh.
export async function GET() {
  const { role, userId } = await verifySession()
  const work = await getMyWork(role as UserRole, userId)
  return NextResponse.json(work, { headers: { 'Cache-Control': 'no-store' } })
}
