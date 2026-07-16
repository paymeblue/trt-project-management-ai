import 'server-only'
import { Resend } from 'resend'

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'TRT PM <onboarding@resend.dev>'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

/** True when this deployment has the Resend credentials needed to send email. */
export function isEmailServiceActive(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs) {
  if (!isEmailServiceActive()) {
    throw new Error(
      'RESEND_API_KEY is not set. Add it to your environment variables before calling sendEmail().'
    )
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  return resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
    ...(text !== undefined ? { text } : {}),
  })
}
