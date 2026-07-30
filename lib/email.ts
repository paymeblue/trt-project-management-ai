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

// Normalised result shape shared by BOTH transports. Deliberately mirrors the
// Resend SDK's `{ data, error }` contract rather than inventing a new one:
// every existing caller (lib/notify-*-email.ts) and tests/lib/email.test.ts
// already treat a provider failure as a RETURNED error, never a throw, and
// switching providers must not silently turn best-effort sends into throws.
export type SendEmailResult = {
  data: { id: string | null } | null
  error: { name: string; message: string } | null
}

export type EmailProvider = 'sendgrid' | 'resend'

/**
 * Which transport this deployment will actually use. SendGrid wins when both
 * keys are present so that setting SENDGRID_API_KEY is a complete cutover with
 * no second step — the Resend key can stay in place as a rollback (drop
 * SENDGRID_API_KEY and delivery falls straight back) without a code change.
 */
export function activeEmailProvider(): EmailProvider | null {
  if (process.env.SENDGRID_API_KEY) return 'sendgrid'
  if (process.env.RESEND_API_KEY) return 'resend'
  return null
}

/** True when this deployment has credentials for SOME email transport. */
export function isEmailServiceActive(): boolean {
  return activeEmailProvider() !== null
}

/**
 * PURE. Splits an RFC 5322-style `Name <addr@host>` (the shape EMAIL_FROM has
 * always carried, and what Resend accepts verbatim) into the discrete
 * `{ email, name }` object SendGrid's v3 API requires — it rejects a combined
 * display-name string outright. A bare address with no display name is
 * returned as-is with no name.
 */
export function parseEmailFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/)
  if (!match) return { email: from.trim() }
  const name = match[1].replace(/^"|"$/g, '').trim()
  const email = match[2].trim()
  return name ? { email, name } : { email }
}

type SendGridPayload = {
  personalizations: { to: { email: string }[] }[]
  from: { email: string; name?: string }
  subject: string
  content: { type: string; value: string }[]
}

/**
 * PURE. Builds the SendGrid v3 `/mail/send` body.
 *
 * ONE PERSONALIZATION PER RECIPIENT, deliberately: the Resend path passed the
 * whole recipient array as a single `to`, which put every officer's address in
 * every other officer's To: header — a real (if minor) disclosure, since
 * emailStepTurn fans out to every eligible officer for a step. Separate
 * personalizations make SendGrid deliver one private copy each.
 *
 * `text/plain` MUST precede `text/html` in `content` — SendGrid orders parts by
 * increasing preference and rejects the reverse.
 */
export function buildSendGridPayload(args: {
  from: string
  to: string | string[]
  subject: string
  html: string
  text?: string
}): SendGridPayload {
  const recipients = (Array.isArray(args.to) ? args.to : [args.to])
    .map((address) => address.trim())
    .filter((address) => address.length > 0)

  const content: { type: string; value: string }[] = []
  if (args.text !== undefined) content.push({ type: 'text/plain', value: args.text })
  content.push({ type: 'text/html', value: args.html })

  return {
    personalizations: recipients.map((email) => ({ to: [{ email }] })),
    from: parseEmailFrom(args.from),
    subject: args.subject,
    content,
  }
}

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send'

async function sendViaSendGrid(args: SendEmailArgs): Promise<SendEmailResult> {
  const payload = buildSendGridPayload({ from: EMAIL_FROM, ...args })
  if (payload.personalizations.length === 0) {
    return { data: null, error: { name: 'validation_error', message: 'No recipients supplied.' } }
  }

  const res = await fetch(SENDGRID_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  // A successful send is 202 Accepted with an EMPTY body — the only useful
  // identifier is the x-message-id header.
  if (res.ok) {
    return { data: { id: res.headers.get('x-message-id') }, error: null }
  }

  // Surface SendGrid's own reason (it returns { errors: [{ message, field }] })
  // WITHOUT ever including the Authorization header or the key itself.
  let message = `SendGrid responded ${res.status}`
  try {
    const body = (await res.json()) as { errors?: { message?: string }[] }
    const first = body.errors?.[0]?.message
    if (first) message = `${message}: ${first}`
  } catch {
    // Non-JSON error body — the status alone is the diagnostic.
  }
  return { data: null, error: { name: 'sendgrid_error', message } }
}

async function sendViaResend(args: SendEmailArgs): Promise<SendEmailResult> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({
    from: EMAIL_FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    ...(args.text !== undefined ? { text: args.text } : {}),
  }) as unknown as Promise<SendEmailResult>
}

/**
 * Logs a RETURNED provider error. Provider failures are returned, not thrown
 * (see SendEmailResult), so a caller that only wraps sendEmail in try/catch
 * sees nothing at all when delivery is rejected — which is exactly how an
 * unverified SendGrid sender would fail silently forever. Every best-effort
 * caller routes its result through here so there is always a trace.
 *
 * The two most common misconfigurations get an actionable hint instead of a
 * bare status code. Never logs the API key — only the provider's own message.
 */
export function logEmailFailure(context: string, result: SendEmailResult): void {
  if (!result.error) return
  const { message } = result.error
  let hint = ''
  if (/verified Sender Identity|from address does not match/i.test(message)) {
    hint =
      ' — EMAIL_FROM is not a verified sender in SendGrid. Verify the address (or authenticate the domain) and set EMAIL_FROM to it.'
  } else if (/authorization grant is invalid|Permission denied|401|403/i.test(message)) {
    hint = ' — check SENDGRID_API_KEY is set correctly and has Mail Send permission.'
  }
  console.warn(`[email] ${context} failed: ${message}${hint}`)
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const provider = activeEmailProvider()
  if (!provider) {
    throw new Error(
      'No email transport is configured. Set SENDGRID_API_KEY (preferred) or RESEND_API_KEY before calling sendEmail().'
    )
  }
  return provider === 'sendgrid' ? sendViaSendGrid(args) : sendViaResend(args)
}
