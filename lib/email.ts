import 'server-only'

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'TRT PM <notifications@trtarredo.com>'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

// This repo's own returned-error contract, not a mirror of any SDK's shape.
// Every existing caller (lib/notify-*-email.ts) and tests/lib/email.test.ts
// treat a provider failure as a RETURNED error, never a throw — a throw here
// would fail the workflow step or call that the email reports on, and every
// send in this app is best-effort by design.
export type SendEmailResult = {
  data: { id: string | null } | null
  error: { name: string; message: string } | null
}

/**
 * BOTH spellings are accepted deliberately. This repo's existing convention is
 * the un-underscored form (`GETSTREAM_APIKEY`), and `SENDGRID_APIKEY` is what
 * was actually provisioned — while `SENDGRID_API_KEY` is SendGrid's own
 * documented name and what most deployment guides tell you to set. Reading only
 * one silently ignores a correctly-set key with no error anywhere, which is
 * exactly what happened here.
 */
export function sendGridApiKey(): string | undefined {
  return process.env.SENDGRID_API_KEY || process.env.SENDGRID_APIKEY || undefined
}

/** True when this deployment has a SendGrid key configured. */
export function isEmailServiceActive(): boolean {
  return !!sendGridApiKey()
}

/**
 * PURE. Splits an RFC 5322-style `Name <addr@host>` into the discrete
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
 * ONE PERSONALIZATION PER RECIPIENT, deliberately: putting the whole recipient
 * array in a single shared `to` would put every officer's address in every
 * other officer's To: header — a real (if minor) disclosure, since
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
      Authorization: `Bearer ${sendGridApiKey()}`,
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
    hint = ' — check SENDGRID_API_KEY/SENDGRID_APIKEY is set correctly and has Mail Send permission.'
  }
  console.warn(`[email] ${context} failed: ${message}${hint}`)
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!sendGridApiKey()) {
    throw new Error(
      'SendGrid is not configured. Set SENDGRID_API_KEY (or SENDGRID_APIKEY) before calling sendEmail().'
    )
  }
  return sendViaSendGrid(args)
}
