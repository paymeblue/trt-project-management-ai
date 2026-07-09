import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Architect department shell (v2.0 Phase 19/21) — separated from Design as
// its own role so Head Designer's assignment steps can target a pool
// spanning both design and architect. Follows the same shell pattern as
// design/production (Phase 15).
const TILES: Tile[] = [
  { title: 'Project flows', description: 'Kickoff, Design Meeting, Brief Taking and Design Stage appear in your pending work above once assigned.', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function ArchitectDashboardPage() {
  const session = await auth()
  return <DashboardShell userName={session?.user?.name ?? 'Architect'} role="architect" tiles={TILES} />
}
