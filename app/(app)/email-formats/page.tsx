import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { staticContent } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { updateEmailFormatsAction } from '@/actions/email-formats'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function EmailFormatsPage() {
  const { role } = await verifySession()
  const [content] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'email_formats'))
    .limit(1)

  const body = content?.body ?? ''
  const isAdmin = role === 'super_admin'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Email Formats</h1>

      {isAdmin ? (
        <form
          action={updateEmailFormatsAction}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            Standard email templates (PMs can view, only you can edit)
          </label>
          <textarea
            name="body"
            defaultValue={body}
            rows={12}
            placeholder="Paste the standard email formats here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
          {body ? (
            <p className="whitespace-pre-wrap">{body}</p>
          ) : (
            <p className="text-gray-400">No email formats yet. A Super Admin can add them.</p>
          )}
        </div>
      )}
    </div>
  )
}
