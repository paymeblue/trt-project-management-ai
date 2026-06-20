import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { staticContent } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { updateAboutAction } from '@/actions/content'

export const dynamic = 'force-dynamic'

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function AboutPage() {
  const { role } = await verifySession()
  const [about] = await db
    .select()
    .from(staticContent)
    .where(eq(staticContent.slug, 'about_trt'))
    .limit(1)

  const body = about?.body ?? ''
  const isAdmin = role === 'super_admin'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">About TRT</h1>

      {isAdmin ? (
        <form
          action={updateAboutAction}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-700">
            Company info, policies, management team, website…
          </label>
          <textarea
            name="body"
            defaultValue={body}
            rows={12}
            placeholder="Write the About TRT content here…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Save
          </button>
        </form>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-700 shadow-sm">
          {body ? (
            <p className="whitespace-pre-wrap">{body}</p>
          ) : (
            <p className="text-gray-400">No content yet. A Super Admin can add it here.</p>
          )}
        </div>
      )}
    </div>
  )
}
