import 'server-only'
import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { sendEmail, isEmailServiceActive } from '@/lib/email'
import { videoCallScheduledEmail } from '@/lib/email-templates'
import { absoluteUrl } from '@/lib/email-layout'

/**
 * Emailed to every invited participant of a call scheduled for later (never
 * the scheduler — `invitees` already excludes the creator by construction in
 * lib/video-calls.ts). Best-effort, mirroring lib/notify-escalation-email.ts:
 * guarded, single try/catch, never throws — an email fault can never fail or
 * roll back a call creation that already fully exists by the time this runs.
 */
export async function emailVideoCallScheduled(input: {
  callId: string
  title: string | null
  scheduledFor: Date
  schedulerName: string
  inviteeIds: string[]
}): Promise<void> {
  if (!isEmailServiceActive()) return
  if (input.inviteeIds.length === 0) return
  try {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, input.inviteeIds))
    if (rows.length === 0) return

    const participantNames = [input.schedulerName, ...rows.map((r) => r.name)]
    const { subject, html, text } = videoCallScheduledEmail({
      title: input.title,
      scheduledFor: input.scheduledFor,
      schedulerName: input.schedulerName,
      participantNames,
      joinUrl: absoluteUrl(`/calls/${input.callId}`),
    })
    // Single Resend call for every invitee — one 403 at worst, not N. All
    // recipients are internal colleagues on the same call who already see
    // each other in the participant list, so a shared `to:` leaks nothing
    // they don't already have (T-eml-04, accepted).
    await sendEmail({ to: rows.map((r) => r.email), subject, html, text })
  } catch (err) {
    console.warn(
      '[260728-eml] video-call-scheduled email not delivered:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}
