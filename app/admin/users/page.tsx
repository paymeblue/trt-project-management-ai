import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { requireRole } from '@/lib/dal'
import { setUserRoleAction } from '@/actions/admin-users'

export const dynamic = 'force-dynamic'

const ROLES = [
  { value: 'factory_pm', label: 'Factory PM' },
  { value: 'site_pm', label: 'Site PM' },
  { value: 'super_admin', label: 'Super Admin' },
]

export default async function AdminUsersPage() {
  await requireRole('super_admin')
  const rows = await db.select().from(users).orderBy(desc(users.createdAt))

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <a href="/admin/dashboard" className="text-sm text-blue-600 hover:underline">
        ← Dashboard
      </a>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-gray-900">User Management</h1>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <form action={setUserRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <select
                      name="newRole"
                      defaultValue={u.role}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Update
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
