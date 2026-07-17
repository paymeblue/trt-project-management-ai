import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { updateProfileAction } from '@/actions/profile'
import { getPositions } from '@/lib/positions'
import ProfileForm from '@/app/_components/profile-form'
import { userRoleLabel, roleDashboard } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const { userId, role } = await verifySession()
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const positions = await getPositions()

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <a href={roleDashboard(role)} className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">Profile</h1>

      <ProfileForm
        initial={{
          avatarData: u?.avatarData ?? null,
          name: u?.name ?? null,
          position: u?.position ?? null,
          bio: u?.bio ?? null,
          email: u?.email ?? null,
        }}
        positions={positions}
        roleLabel={userRoleLabel(role)}
        action={updateProfileAction}
      />
    </div>
  )
}
