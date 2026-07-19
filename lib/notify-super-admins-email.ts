import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { Roles } from '@/lib/workflow'
import { sendEmail, isEmailServiceActive } from '@/lib/email'
import { stepTurnEmail, projectClosedOutEmail } from '@/lib/email-templates'

// Step/project email notifications. Deliberately non-blocking/best-effort —
// a failed or unconfigured email send must never roll back or fail the step
// completion it's reporting on.
//
// 2026-07-19 (user decision): the former every-step "task completed"
// broadcast to ALL super admins is GONE — per-step emails are now scoped to
// the officer(s) responsible for the newly-pending step (see
// notifyNextStepOfficers in lib/workflow-graph.ts, which calls emailStepTurn
// below). Only the one-time project CLOSEOUT digest still goes to every
// super admin — that is project-level oversight, not a step notification.
async function superAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(users).where(eq(users.role, Roles.SuperAdmin))
  return rows.map((r) => r.email)
}

// Position/role-scoped "your turn" email to exactly the officers who can act
// on the newly-pending step — recipient resolution lives with the graph
// (notifyNextStepOfficers); this helper only sends.
export async function emailStepTurn(
  to: string[],
  input: { projectName: string; stepLabel: string },
): Promise<void> {
  if (!isEmailServiceActive()) return
  if (to.length === 0) return
  try {
    const { subject, html, text } = stepTurnEmail(input)
    await sendEmail({ to, subject, html, text })
  } catch {
    // Best-effort — never let an email failure affect step completion.
  }
}

export async function emailSuperAdminsProjectClosedOut(input: {
  projectName: string
  metDeadline: boolean | null
}): Promise<void> {
  if (!isEmailServiceActive()) return
  try {
    const to = await superAdminEmails()
    if (to.length === 0) return
    const { subject, html, text } = projectClosedOutEmail(input)
    await sendEmail({ to, subject, html, text })
  } catch {
    // Best-effort — never let an email failure affect step completion.
  }
}
