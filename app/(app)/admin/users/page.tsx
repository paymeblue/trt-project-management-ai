import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { requireAdmin } from '@/lib/dal'
import { Roles } from '@/lib/workflow'
import { getPositionsWithCounts, getPositions } from '@/lib/positions'
import AdminUsersTable from '@/app/_components/admin-users-table'
import AdminCreateUser from '@/app/_components/admin-create-user'
import PositionsManager from '@/app/_components/positions-manager'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const { userId, role } = await requireAdmin()
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, position: users.position })
    .from(users)
    .orderBy(desc(users.createdAt))
  const positions = await getPositionsWithCounts()
  const positionOptions = await getPositions()
  const isSuperAdmin = role === Roles.SuperAdmin

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <a href="/admin/dashboard" className="text-sm text-primary hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-gray-900">User Management</h1>
      <p className="mb-6 text-sm text-gray-500">
        Create Factory PM / Site PM accounts (credentials are emailed to them), update roles, or
        remove users. Administrator accounts are protected — they can’t be modified or deleted here.
      </p>

      <AdminCreateUser />

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        All users
      </h2>
      <AdminUsersTable users={rows} meId={userId} positionOptions={positionOptions} />

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Positions
      </h2>
      <PositionsManager positions={positions} canRename={isSuperAdmin} />
    </div>
  )
}
