import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'Overview', description: 'Read-only view of all projects, checklists and verifications.', href: '/admin/overview', status: 'ready' },
  { title: 'User Management', description: 'Create / invite accounts and assign roles.', href: '/admin/users', status: 'ready' },
  { title: 'Content Management', description: 'Edit About TRT, Processes and Email Formats.', href: '/admin/content', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Curate the official process library.', href: '/processes', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management (you can edit).', href: '/about', status: 'ready' },
]

export default async function AdminDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Super Admin'} role="super_admin" tiles={TILES} />
  )
}
