import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { Roles, isAdminRole } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { role } = await verifySession()

  if (role === Roles.FactoryPm) redirect('/factory-pm/dashboard')
  if (role === Roles.SitePm) redirect('/site-pm/dashboard')
  if (isAdminRole(role)) redirect('/admin/dashboard')

  // Fallback: should not be reached, but send unauthenticated users to sign-in
  redirect('/sign-in')
}
