import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

// Workflow-step screens (Materials / Accessories Readiness, Delivery Project
// Checklist, Project Check Report) now live inside the Projects screen — per
// project, gated by the current step. The dashboard keeps standalone tools.
const TILES: Tile[] = [
  { title: 'Projects', description: 'Open an Operations-created project to act on its steps (Factory Floor → Project Check Report).', href: '/factory-pm/projects', status: 'ready' },
  { title: 'Product Readiness Checklist', description: 'Track readiness files (name + link).', href: '/factory-pm/product-readiness', status: 'ready' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', href: '/processes', status: 'ready' },
  { title: 'Profile', description: 'Your name, position and ID card.', href: '/profile', status: 'ready' },
  { title: 'About TRT', description: 'Company info, policies and management.', href: '/about', status: 'ready' },
]

export default async function FactoryPmDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Factory PM'} role="factory_pm" tiles={TILES} />
  )
}
