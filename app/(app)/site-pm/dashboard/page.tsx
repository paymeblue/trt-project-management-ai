import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Workflow-step checklists (Confirmation, Delivery Readiness, Sorting, Change
// Request, Close Out) now live inside the Projects screen — per project, gated
// by the current step. The dashboard keeps only standalone tools.
const TILES: Tile[] = [
  { title: 'Projects', description: 'Open an Operations-created project to act on its steps (Confirmation → Close Out).', href: '/site-pm/projects', status: 'ready' },
  { title: 'Issue Log', description: 'Log and track site issues.', href: '/site-pm/issues', status: 'ready' },
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
