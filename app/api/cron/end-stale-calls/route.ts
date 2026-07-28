import { NextResponse } from 'next/server'
import { sweepStaleCalls } from '@/lib/video-calls'

export const dynamic = 'force-dynamic'

// Machine-to-machine only (Netlify Scheduled Function -> this route, quick
// task 260728-vce) — no session/DAL involved, structural copy of
// app/api/cron/call-reminders/route.ts's shape. Authenticated via a
// shared-secret Bearer token, not a user session.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sweepStaleCalls()

  return NextResponse.json({
    ok: true,
    endedCount: result.endedCallIds.length,
    endedCallIds: result.endedCallIds,
    skippedCount: result.skipped.length,
  })
}
