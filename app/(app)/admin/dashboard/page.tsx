import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { users } from '@/db/schema'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'
import { Roles } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'Projects Timeline', description: 'Track every project’s current step and deadline (green = on time, red = overdue).', href: '/admin/timeline', status: 'ready' },
  { title: 'Overview', description: 'Read-only view of all projects, checklists and verifications.', href: '/admin/overview', status: 'ready' },
  { title: 'User Management', description: 'Create / invite accounts and assign roles.', href: '/admin/users', status: 'ready' },
  { title: 'Content Management', description: 'Edit About TRT, Processes and Email Formats.', href: '/admin/content', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Curate the official process library.', href: '/processes', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management (you can edit).', href: '/about', status: 'ready' },
]

export default async function AdminDashboardPage() {
  const session = await auth()
  const [me] = session?.user?.id
    ? await db
        .select({ position: users.position })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
    : []
  const role = session?.user?.role ?? Roles.SuperAdmin
  const roleLabel =
    me?.position?.trim() || (role === Roles.Operations ? 'Operations' : 'Super Admin')

  return (
    <DashboardShell
      userName={session?.user?.name ?? 'Admin'}
      role={role}
      roleLabel={roleLabel}
      tiles={TILES}
    />
  )
}
