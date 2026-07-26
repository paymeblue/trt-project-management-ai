import type { Config } from '@netlify/functions'

// Quick task 260726-dw4 (REM-04): thin scheduled trigger, zero DB/GetStream/
// notification logic here — all real logic lives in lib/video-calls.ts's
// sendDueCallReminders(), invoked via the CRON_SECRET-protected internal
// route (app/api/cron/call-reminders/route.ts). This function's only job is
// "wake up every 5 minutes, fetch the internal URL, done."
export default async () => {
  // SITE_URL is the primary source (explicit, user-configured in Netlify's
  // dashboard) — process.env.URL is only a documented fallback, since its
  // behavior specifically for scheduled/cron invocations across deploy
  // contexts (production vs. branch/preview) isn't explicitly documented
  // (RESEARCH.md Pitfall #3).
  const baseUrl = process.env.SITE_URL ?? process.env.URL

  if (!baseUrl) {
    console.error('send-call-reminders: SITE_URL/URL not set — cannot reach internal API')
    return
  }

  const res = await fetch(`${baseUrl}/api/cron/call-reminders`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
    },
  })

  if (!res.ok) {
    console.error('call-reminders trigger failed:', res.status, await res.text())
  }
}

export const config: Config = {
  schedule: '*/5 * * * *',
}
