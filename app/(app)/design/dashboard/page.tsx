import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Design department shell. Workflow steps for Design are not yet defined — its
// project tools will appear here once added (v1.1 #7 extensibility).
const TILES: Tile[] = [
  { title: 'Project flows', description: 'Design workflow steps will appear here once configured.', status: 'soon' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function DesignDashboardPage() {
  const session = await auth()
  return <DashboardShell userName={session?.user?.name ?? 'Design'} role="design" tiles={TILES} />
}
