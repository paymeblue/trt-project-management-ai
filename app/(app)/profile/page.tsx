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

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-50">
          {u?.avatarData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={u.avatarData} alt={u?.name ?? 'Avatar'} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-primary">
              {(u?.name ?? 'U').slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{u?.name}</p>
          <p className="text-sm text-gray-500">{ROLE_LABELS[role] ?? role}</p>
        </div>
      </div>

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
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
          <textarea
            name="bio"
            defaultValue={u?.bio ?? ''}
            rows={3}
            maxLength={500}
            placeholder="A line about you and your work."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
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
