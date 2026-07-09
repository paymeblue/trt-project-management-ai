import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'New Project', description: 'Capture a client\'s intent and create their project.', href: '/customer-care/projects/new', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function CustomerCareDashboardPage() {
  const session = await auth()
  return <DashboardShell userName={session?.user?.name ?? 'Customer Care'} role="customer_care" tiles={TILES} />
}
