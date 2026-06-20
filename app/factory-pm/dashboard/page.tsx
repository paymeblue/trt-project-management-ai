import { auth } from '@/auth'
import DashboardShell, { type Tile } from '@/app/_components/dashboard-shell'

export const dynamic = 'force-dynamic'

const TILES: Tile[] = [
  { title: 'Factory Floor Projects', description: 'Projects with delivery timeline and Delivered / Not Delivered status.', status: 'soon' },
  { title: 'Delivery Project Checklist', description: 'Create new and review delivery checklists.', status: 'soon' },
  { title: 'Product Readiness Checklist', description: 'Upload and browse readiness files (sortable).', status: 'soon' },
  { title: 'Processes & Flow Charts', description: 'Company processes and flowcharts.', status: 'soon' },
  { title: 'Profile', description: 'Your name, position and ID card.', status: 'soon' },
  { title: 'About TRT', description: 'Company info, policies and management.', status: 'soon' },
]

export default async function FactoryPmDashboardPage() {
  const session = await auth()
  return (
    <DashboardShell userName={session?.user?.name ?? 'Factory PM'} role="factory_pm" tiles={TILES} />
  )
}
