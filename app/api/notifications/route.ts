import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { getNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

// Polled by the header bell so super admins see new alerts without a refresh.
// Non-super-admins simply have no notifications (recipients are super admins).
export async function GET() {
  const { userId } = await verifySession()
  const feed = await getNotifications(userId)
  return NextResponse.json(feed, { headers: { 'Cache-Control': 'no-store' } })
}
