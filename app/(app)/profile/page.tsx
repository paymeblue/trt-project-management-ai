import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { updateProfileAction } from '@/actions/profile'

export const dynamic = 'force-dynamic'

const ROLE_LABELS: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
}

const DASH: Record<string, string> = {
  factory_pm: '/factory-pm/dashboard',
  site_pm: '/site-pm/dashboard',
  super_admin: '/admin/dashboard',
}

export default async function ProfilePage() {
  const { userId, role } = await verifySession()
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href={DASH[role]} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Profile</h1>

      <form
        action={updateProfileAction}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            name="name"
            defaultValue={u?.name ?? ''}
            required
            minLength={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Position</label>
          <input
            name="position"
            defaultValue={u?.position ?? ''}
            placeholder="e.g. Senior Site Manager"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              value={u?.email ?? ''}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
            <input
              value={ROLE_LABELS[role] ?? role}
              disabled
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
            />
          </div>
        </div>
        <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-500">
          ID Card upload arrives with file storage (S3). Editable by Super Admin only.
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Save profile
        </button>
      </form>
    </div>
  )
}
