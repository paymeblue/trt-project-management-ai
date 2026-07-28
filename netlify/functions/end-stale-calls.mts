import type { Config } from '@netlify/functions'

// Quick task 260728-vce (T-vce-02/T-vce-03): thin scheduled trigger, zero
// DB/GetStream/predicate logic here — all real logic lives in
// lib/video-calls.ts's sweepStaleCalls(), invoked via the
// CRON_SECRET-protected internal route (app/api/cron/end-stale-calls/route.ts).
// This function's only job is "wake up every 10 minutes, fetch the internal
// URL, done." Mirrors send-call-reminders.mts exactly.
export default async () => {
  // SITE_URL is the primary source (explicit, user-configured in Netlify's
  // dashboard) — process.env.URL is only a documented fallback, since its
  // behavior specifically for scheduled/cron invocations across deploy
  // contexts (production vs. branch/preview) isn't explicitly documented
  // (RESEARCH.md Pitfall #3).
  const baseUrl = process.env.SITE_URL ?? process.env.URL

  if (!baseUrl) {
    console.error('end-stale-calls: SITE_URL/URL not set — cannot reach internal API')
    return
  }

  const res = await fetch(`${baseUrl}/api/cron/end-stale-calls`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
    },
  })

  if (!res.ok) {
    console.error('end-stale-calls trigger failed:', res.status, await res.text())
  }
}

// 10 minutes, not 5 (unlike send-call-reminders.mts): the sweep's tightest
// window is a 15-minute empty-call grace period (EMPTY_GRACE_MINUTES in
// lib/call-sweep.ts) — a 10-minute cadence bounds worst-case staleness at
// 25 minutes past that grace window while halving the invocation count
// versus a 5-minute cadence.
export const config: Config = {
  schedule: '*/10 * * * *',
}
