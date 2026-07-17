import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { Roles } from '@/lib/workflow'
import { sendEmail, isEmailServiceActive } from '@/lib/email'
import { taskCompletedEmail, projectClosedOutEmail } from '@/lib/email-templates'

// Item #11: email every super admin when a task completes or a project
// closes out. Deliberately non-blocking/best-effort — a failed or
// unconfigured email send must never roll back or fail the step completion
// it's reporting on. Reuses the `notifications` table's target audience
// (every super_admin-role user) but through email, not the in-app feed —
// this is an oversight digest, not a position-scoped action notification, so
// broadcasting to all super admins here is intentional (unlike the
// per-step position-scoped notifications fixed elsewhere).
async function superAdminEmails(): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(users).where(eq(users.role, Roles.SuperAdmin))
  return rows.map((r) => r.email)
}

export async function emailSuperAdminsTaskCompleted(input: {
  projectName: string
  stepLabel: string
  actorName: string
}): Promise<void> {
  if (!isEmailServiceActive()) return
  try {
    const to = await superAdminEmails()
    if (to.length === 0) return
    const { subject, html, text } = taskCompletedEmail(input)
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
