import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'Projects', description: 'View Operations-created projects and act on your current workflow step.', href: '/factory-pm/projects', status: 'ready' },
  { title: 'Delivery Project Checklist', description: 'Create new and review delivery checklists.', href: '/checklists/delivery_project', status: 'ready' },
  { title: 'Product Readiness Checklist', description: 'Track readiness files (name + link).', href: '/factory-pm/product-readiness', status: 'ready' },
  { title: 'Materials / Accessories Readiness Form', description: 'Upload the signed form or create & sign a digital version.', href: '/factory-pm/readiness', status: 'ready' },
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
