import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'Overview', description: 'Read-only view of all projects, checklists and verifications.', status: 'soon' },
  { title: 'User Management', description: 'Create / invite accounts and assign roles.', status: 'soon' },
  { title: 'Content Management', description: 'Edit About TRT, Processes and Email Formats.', status: 'soon' },
  { title: 'Processes & Flow Charts', description: 'Curate the official process library.', status: 'soon' },
  { title: 'About TRT', description: 'Company info, policies and management.', status: 'soon' },
]

export default async function AdminDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Super Admin'} role="super_admin" tiles={TILES} />
  )
}
