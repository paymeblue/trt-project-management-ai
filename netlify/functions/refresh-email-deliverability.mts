import type { Config } from '@netlify/functions'

// Quick task 260731-sgo: thin scheduled trigger, zero DB/DNS/SendGrid logic
// here — all real logic lives in lib/email-deliverability-refresh.ts's
// refreshAllUsersDeliverability(), invoked via the CRON_SECRET-protected
// internal route (app/api/cron/email-deliverability/route.ts). This
// function's only job is "wake up once a day, fetch the internal URL, done."
// Once daily is deliberate — MX records and suppression lists do not change
// minute to minute, and this is exactly the kind of job that must not be a
// page-load cost.
export default async () => {
  const baseUrl = process.env.SITE_URL ?? process.env.URL

  if (!baseUrl) {
    console.error('refresh-email-deliverability: SITE_URL/URL not set — cannot reach internal API')
    return
  }

  const res = await fetch(`${baseUrl}/api/cron/email-deliverability`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
    },
  })

  if (!res.ok) {
    console.error('email-deliverability refresh trigger failed:', res.status, await res.text())
  }
}

export const config: Config = {
  schedule: '17 3 * * *',
}
