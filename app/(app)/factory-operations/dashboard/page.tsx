import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Factory Operations department shell (v2.0 Phase 19/22) — runs the
// Production Process checklist on the factory floor (optimisation, cutting,
// edging, drilling & grooving, spray, hardwood & upholstery, glass). Follows
// the same shell pattern as design/production/architect (Phase 15/19).
const TILES: Tile[] = [
  {
    title: 'Project flows',
    description:
      'The Production Process checklist appears in your pending work above once a project is assigned.',
    status: 'ready',
  },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function FactoryOperationsDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell
      userName={session?.user?.name ?? 'Factory Operations'}
      role="factory_operations"
      tiles={TILES}
    />
  )
}
