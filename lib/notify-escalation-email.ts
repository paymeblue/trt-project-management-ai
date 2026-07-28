import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { sendEmail, isEmailServiceActive } from '@/lib/email'
import { escalationAmendedEmail } from '@/lib/email-templates'
import { absoluteUrl } from '@/lib/email-layout'

// Quick task 260728-eml — Operator note — making mail reach real recipients:
//   1. The Resend account currently has ZERO verified domains, so every send
//      to an address other than the account owner's returns HTTP 403 and is
//      silently dropped by design.
//   2. Verify a domain at https://resend.com/domains.
//   3. Set EMAIL_FROM to an address on that verified domain (e.g.
//      "TRT PM <no-reply@trtarredo.com>") — the current default
//      onboarding@resend.dev only works for owner-addressed test sends.
//   4. Set APP_URL to the public origin (e.g. https://trt-pm.netlify.app).
//      Until then EVERY CTA button in EVERY email points at
//      http://localhost:3000 and is dead for the recipient.

/**
 * Emailed to the officer who raised an escalation once a supervisor amends
 * the checklist they escalated — the out-of-app half of the existing
 * notifyUser call in actions/escalation.ts (see 260728-esc). Best-effort:
 * mirrors lib/notify-super-admins-email.ts's shape — guarded, try/catch,
 * never throws — so an email fault can never fail or roll back the amend
 * that already committed before this is called.
 */
export async function emailEscalationAmended(input: {
  recipientId: string
  projectId: string
  projectName: string
  checklistLabel: string
  stepN: number | null
  amenderName: string | null
}): Promise<void> {
  if (!isEmailServiceActive()) return
  try {
    const [recipient] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.recipientId))
      .limit(1)
    if (!recipient?.email) return

    const { subject, html, text } = escalationAmendedEmail({
      projectName: input.projectName,
      checklistLabel: input.checklistLabel,
      stepN: input.stepN,
      amenderName: input.amenderName,
      disputeUrl: absoluteUrl(`/disputes/${input.projectId}`),
    })
    await sendEmail({ to: recipient.email, subject, html, text })
  } catch (err) {
    // With zero verified Resend domains, every non-owner recipient 403s in
    // this environment — a silent swallow would make that look like a code
    // bug. Log Resend's own message only; never the error object, the full
    // environment, or any credential.
    console.warn(
      '[260728-eml] escalation-amended email not delivered:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}
