import { NextResponse } from 'next/server'
import { sendDueCallReminders } from '@/lib/video-calls'

export const dynamic = 'force-dynamic'

// Machine-to-machine only (Netlify Scheduled Function -> this route, quick
// task 260726-dw4/REM-03) — no session/DAL involved, mirrors
// app/api/auth/tab-refresh/route.ts's plain Request/NextResponse shape.
// Authenticated via a shared-secret Bearer token, not a user session.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sendDueCallReminders()

  return NextResponse.json({
    ok: true,
    remindedCount: result.remindedCallIds.length,
    remindedCallIds: result.remindedCallIds,
  })
}
