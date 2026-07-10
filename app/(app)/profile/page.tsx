import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { updateProfileAction } from '@/actions/profile'
import ProfileAvatarField from '@/app/_components/profile-avatar-field'
import { userRoleLabel, roleDashboard } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const { userId, role } = await verifySession()
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href={roleDashboard(role)} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Profile</h1>

      <form
        action={updateProfileAction}
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <ProfileAvatarField initial={u?.avatarData ?? null} name={u?.name ?? 'U'} />

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
            list="known-positions"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
          <datalist id="known-positions">
            <option value="head_designer" />
            <option value="head_of_operations" />
            <option value="chief_production_officer" />
          </datalist>
          <p className="mt-1 text-xs text-gray-400">
            Some workflow steps are restricted to an exact position — use{' '}
            <code className="rounded bg-gray-100 px-1">head_designer</code>,{' '}
            <code className="rounded bg-gray-100 px-1">head_of_operations</code>, or{' '}
            <code className="rounded bg-gray-100 px-1">chief_production_officer</code> if you hold one of
            those titles. Must match exactly (case and spelling) — start typing to see suggestions.
          </p>
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
              value={userRoleLabel(role)}
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
