import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'New Project', description: 'Start a new site project (name, location, you as PM) and view previous ones.', href: '/site-pm/projects', status: 'ready' },
  { title: 'Confirmation / Verification', description: 'Verify on-site reality against the architect’s design.', href: '/checklists/confirmation', status: 'ready' },
  { title: 'Project Production Checklist', description: 'Full production QA across kitchen, closet, vanity & TV units.', href: '/checklists/production', status: 'ready' },
  { title: 'Delivery Site Readiness', description: 'Out-of-state processes / planning checklist.', href: '/checklists/delivery_site_readiness', status: 'ready' },
  { title: 'Issue Log', description: 'Log and track site issues.', href: '/site-pm/issues', status: 'ready' },
  { title: 'Sorting Checklist', description: 'Run the sorting checklist.', href: '/checklists/sorting', status: 'ready' },
  { title: 'Change Request Checklist', description: 'Raise and track change requests.', href: '/checklists/change_request', status: 'ready' },
  { title: 'Close Out Process', description: 'Project close-out checklist.', href: '/checklists/close_out', status: 'ready' },
  { title: 'Email Formats', description: 'Standard email templates (view only).', href: '/email-formats', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function SitePmDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Site PM'} role="site_pm" tiles={TILES} />
  )
}
