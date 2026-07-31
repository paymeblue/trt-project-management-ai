import { NextResponse } from 'next/server'
import { refreshAllUsersDeliverability } from '@/lib/email-deliverability-refresh'

export const dynamic = 'force-dynamic'

// Machine-to-machine only (Netlify Scheduled Function -> this route, quick
// task 260731-sgo), mirroring app/api/cron/call-reminders/route.ts's shape —
// no session/DAL involved, authenticated via a shared-secret Bearer token.
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const counts = await refreshAllUsersDeliverability()

  return NextResponse.json({ ok: true, ...counts })
}
