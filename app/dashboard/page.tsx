import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { role } = await verifySession()

  if (role === 'factory_pm') redirect('/factory-pm/dashboard')
  if (role === 'site_pm') redirect('/site-pm/dashboard')
  if (role === 'super_admin') redirect('/admin/dashboard')

  // Fallback: should not be reached, but send unauthenticated users to sign-in
  redirect('/sign-in')
}
