import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'New Project', description: 'Start a new site project (name, location, you as PM) and view previous ones.', href: '/site-pm/projects', status: 'ready' },
  { title: 'Confirmation / Verification', description: 'Verify on-site reality against the architect’s design.', status: 'soon' },
  { title: 'Delivery Site Readiness', description: 'Out-of-state processes / planning checklist.', status: 'soon' },
  { title: 'Issue Log', description: 'Log and track site issues.', status: 'soon' },
  { title: 'Sorting Checklist', description: 'Run the sorting checklist.', status: 'soon' },
  { title: 'Change Request Checklist', description: 'Raise and track change requests.', status: 'soon' },
  { title: 'Close Out Process', description: 'Project close-out checklist.', status: 'soon' },
  { title: 'Email Formats', description: 'Standard email templates (view only).', status: 'soon' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', status: 'soon' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function SitePmDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Site PM'} role="site_pm" tiles={TILES} />
  )
}
