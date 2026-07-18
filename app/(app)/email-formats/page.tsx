import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { staticContent } from '@/db/schema'
import { verifySession, isAdminRole } from '@/lib/dal'
import { updateEmailFormatsAction } from '@/actions/email-formats'
import TabTokenForm from '@/app/_components/tab-token-form'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
  operations: '/admin/dashboard',
}

const TEMPLATES: { title: string; subject: string; body: string }[] = [
  {
    title: 'Delivery confirmation',
    subject: 'Delivery Confirmation — [Project Name] / [Unit]',
    body: `Dear [Client/Recipient],

This is to confirm that the delivery for [Project Name] ([Unit]) was received on [Date].
Items were checked against the packing list and verified as complete.

Any exceptions are noted below:
- [Exception / None]

Regards,
[Your Name]
TRT Arredo`,
  },
  {
    title: 'Site readiness request',
    subject: 'Site Readiness Request — [Project Name]',
    body: `Dear [Recipient],

Ahead of installation for [Project Name], please confirm the site will be ready by [Date]:
- Power and lighting available
- Floors/walls finished and clear
- Access route confirmed for delivery

Kindly confirm readiness or advise of any delays.

Regards,
[Your Name]
TRT Arredo`,
  },
  {
    title: 'Change request acknowledgement',
    subject: 'Change Request Acknowledgement — [Project Name] / [CR #]',
    body: `Dear [Recipient],

We acknowledge receipt of your change request [CR #] for [Project Name] dated [Date].
Summary: [Brief description].

We are reviewing the impact on scope, schedule and cost and will revert by [Date].

Regards,
[Your Name]
TRT Arredo`,
  },
]

export default async function EmailFormatsPage() {
  const { role } = await verifySession()
  const [content] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'email_formats'))
    .limit(1)

  const body = content?.body ?? ''
  const isAdmin = isAdminRole(role)

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Email Formats</h1>

      {/* Standard templates — click a row to expand the format */}
      <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {TEMPLATES.map((t, i) => (
          <details key={t.title} className={i > 0 ? 'border-t border-gray-100' : undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary">mail</span>
                {t.title}
              </span>
              <span className="material-symbols-outlined text-base text-gray-400">expand_more</span>
            </summary>
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Subject
              </p>
              <p className="mb-3 text-sm text-gray-800">{t.subject}</p>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Body</p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">{t.body}</pre>
            </div>
          </details>
        ))}
      </div>

      {isAdmin ? (
        <TabTokenForm
          action={updateEmailFormatsAction}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            Additional notes / custom templates (PMs can view, only you can edit)
          </label>
          <textarea
            name="body"
            defaultValue={body}
            rows={12}
            placeholder="Paste the standard email formats here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Save
          </button>
        </TabTokenForm>
      ) : (
        body && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Additional notes
            </p>
            <p className="whitespace-pre-wrap">{body}</p>
          </div>
        )
      )}
    </div>
  )
}
