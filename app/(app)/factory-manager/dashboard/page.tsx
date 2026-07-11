import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Factory Manager department shell (v2.0 Phase 19/22) — performs Quality
// Control immediately before Materials/Accessories Readiness, uploading the
// Material / Accessories / Upholstery readiness forms. Follows the same
// shell pattern as design/production/architect (Phase 15/19).
const TILES: Tile[] = [
  {
    title: 'Project flows',
    description:
      'Quality Control readiness forms (material, accessories, upholstery) appear in your pending work above once a project is assigned.',
    status: 'ready',
  },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function FactoryManagerDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell
      userName={session?.user?.name ?? 'Factory Manager'}
      role="factory_manager"
      tiles={TILES}
    />
  )
}
