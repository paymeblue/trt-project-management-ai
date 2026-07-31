// Quick task 260728-eml: every template below now renders its body through
// the shared branded layout (lib/email-layout.ts) instead of a bare <p>
// fragment. Exported function NAMES, ARGS and SUBJECTS are unchanged —
// lib/auth/email-flows.ts, actions/admin-users.ts and
// lib/notify-super-admins-email.ts call these and must not need edits.
import { escapeHtml, absoluteUrl, renderBrandedEmail } from '@/lib/email-layout'

export function verificationEmail({ name, verifyUrl }: { name: string; verifyUrl: string }) {
  const subject = 'Verify your TRT PM account'
  const url = absoluteUrl(verifyUrl)
  const { html, text } = renderBrandedEmail({
    preheader: 'Confirm your email address to activate your TRT PM account.',
    heading: 'Confirm your email address',
    paragraphs: [
      `Hi ${escapeHtml(name)},`,
      'Welcome to TRT PM. Please confirm your email address to activate your account.',
    ],
    cta: { label: 'Verify email', url },
    footNote: 'If you did not create an account, you can safely ignore this email.',
  })

  return { subject, html, text }
}

export function credentialsEmail({
  name,
  email,
  password,
  roleLabel,
  loginUrl,
}: {
  name: string
  email: string
  password: string
  roleLabel: string
  loginUrl: string
}) {
  const subject = 'Your TRT PM account'
  const url = absoluteUrl(loginUrl)
  // The temporary password stays in the email body (not behind a link)
  // because this is the only channel the recipient has at account-creation
  // time — there is no existing session or token flow to hand them a
  // password-set link instead. Do not "improve" this into a link without
  // building that token flow first.
  const { html, text } = renderBrandedEmail({
    preheader: `An account has been created for you on TRT PM as ${roleLabel}.`,
    heading: 'Your TRT PM account is ready',
    paragraphs: [
      `Hi ${escapeHtml(name)},`,
      `An account has been created for you on TRT PM as <strong>${escapeHtml(roleLabel)}</strong>. Use these credentials to sign in:`,
      `<div style="margin:8px 0;padding:12px 16px;background-color:#fafafa;border:1px solid #e4e4e7;border-radius:6px;"><strong>Email:</strong> ${escapeHtml(email)}<br/><strong>Temporary password:</strong> ${escapeHtml(password)}</div>`,
    ],
    cta: { label: 'Sign in to TRT PM', url },
    footNote: 'For your security, please change your password after your first sign-in.',
  })

  return { subject, html, text }
}

export function passwordResetEmail({ name, resetUrl }: { name: string; resetUrl: string }) {
  const subject = 'Reset your TRT PM password'
  const url = absoluteUrl(resetUrl)
  const { html, text } = renderBrandedEmail({
    preheader: 'We received a request to reset your TRT PM password.',
    heading: 'Reset your password',
    paragraphs: [
      `Hi ${escapeHtml(name)},`,
      'We received a request to reset your TRT PM password.',
    ],
    cta: { label: 'Reset password', url },
    footNote:
      'This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.',
  })

  return { subject, html, text }
}

// Item #11: super admins get emailed when each task/step is completed for a
// project, and again when the project is closed out (with a deadline
// met/missed flag). Both fire from a single choke point (completeGraphStep)
// so every completion path — checklist, yes/no+upload, approval, assignment,
// skip — is covered without touching each individual action.
export function stepTurnEmail({
  projectName,
  stepLabel,
}: {
  projectName: string
  stepLabel: string
}) {
  const subject = `Your turn: ${stepLabel} — ${projectName}`
  const { html, text } = renderBrandedEmail({
    preheader: `${stepLabel} is now pending on ${projectName}.`,
    heading: "It's your turn",
    paragraphs: [
      `It is your turn to act: <strong>${escapeHtml(stepLabel)}</strong> is now pending on <strong>${escapeHtml(projectName)}</strong>.`,
    ],
    cta: { label: 'Open TRT PM', url: absoluteUrl('/dashboard') },
  })

  return { subject, html, text }
}

export function projectClosedOutEmail({
  projectName,
  metDeadline,
}: {
  projectName: string
  metDeadline: boolean | null
}) {
  const subject = `Project closed out: ${projectName}`
  // These three sentences are pinned verbatim by
  // lib/email-templates.completion.test.ts (/PAST/, /within its final step
  // deadline/i, /could not be determined/i) — do not reword them.
  const deadlineLine =
    metDeadline === null
      ? 'No deadline was set for the final step, so on-time status could not be determined.'
      : metDeadline
        ? 'It was delivered within its final step deadline.'
        : 'It was delivered PAST its final step deadline.'
  const { html, text } = renderBrandedEmail({
    preheader: `${projectName} has been closed out.`,
    heading: 'Project closed out',
    paragraphs: [
      `<strong>${escapeHtml(projectName)}</strong> has been closed out — every step is complete.`,
      deadlineLine,
    ],
    cta: { label: 'Open TRT PM', url: absoluteUrl('/dashboard') },
  })

  return { subject, html, text }
}

// ── Quick task 260728-eml: escalation-amended + video-call-scheduled ───────

/**
 * Emailed to the officer who raised an escalation, once a supervisor amends
 * the checklist they escalated. Until this task the moment was in-app only
 * (notifyUser, actions/escalation.ts) — this is the out-of-app half of that
 * same notification.
 */
export function escalationAmendedEmail({
  projectName,
  checklistLabel,
  stepN,
  amenderName,
  disputeUrl,
}: {
  projectName: string
  checklistLabel: string
  stepN: number | null
  amenderName: string | null
  disputeUrl: string
}) {
  const subject = `Your escalated checklist was updated: ${checklistLabel} — ${projectName}`
  const stepSentence = stepN != null ? ` Step ${stepN}.` : ''
  const amender = amenderName ? escapeHtml(amenderName) : 'a supervisor'
  const { html, text } = renderBrandedEmail({
    preheader: `${checklistLabel} on ${projectName} was just updated.`,
    heading: 'Your escalated checklist was updated',
    paragraphs: [
      `<strong>${escapeHtml(checklistLabel)}</strong> on <strong>${escapeHtml(projectName)}</strong> — the checklist you escalated — was just amended by ${amender}.${escapeHtml(stepSentence)}`,
    ],
    cta: { label: 'View the escalation', url: absoluteUrl(disputeUrl) },
  })

  return { subject, html, text }
}

/**
 * Emailed to every invited participant of a call scheduled for later (never
 * the scheduler — the caller passes only the invitee list). An instant call
 * has no email counterpart; the in-app notification and the GetStream ring
 * already cover that case.
 */
export function videoCallScheduledEmail({
  title,
  scheduledFor,
  schedulerName,
  participantNames,
  joinUrl,
}: {
  title: string | null
  scheduledFor: Date
  schedulerName: string
  participantNames: string[]
  joinUrl: string
}) {
  const callName = title?.trim() || 'Video call'
  const subject = `You're invited: ${callName} — scheduled call`
  // This renders on the SERVER. A locale-default format would silently mean
  // "the server's timezone", which the reader has no way to know and which
  // differs between local dev and Netlify. Pinning to UTC and stating it
  // makes the string unambiguous for every recipient, regardless of where
  // they or the server are. (lib/video-calls.ts's in-app notification title
  // still uses an unlabelled local toLocaleString — that is a pre-existing,
  // out-of-scope choice left untouched by this task.)
  const when = `${scheduledFor.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })} UTC`
  const participants = participantNames.map((n) => escapeHtml(n)).join(', ')
  const { html, text } = renderBrandedEmail({
    preheader: `${escapeHtml(schedulerName)} scheduled ${callName} for ${when}.`,
    heading: "You're invited to a scheduled call",
    paragraphs: [
      `<strong>${escapeHtml(schedulerName)}</strong> scheduled <strong>${escapeHtml(callName)}</strong> for <strong>${escapeHtml(when)}</strong>.`,
      `Participants: ${participants}.`,
    ],
    cta: { label: 'Join the call', url: absoluteUrl(joinUrl) },
    footNote: 'The call room opens at the scheduled time.',
  })

  return { subject, html, text }
}
