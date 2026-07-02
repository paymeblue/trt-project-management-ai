import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { roleDashboard } from '@/lib/workflow'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { role } = await verifySession()
  // Single source of truth for each role's home (covers future departments).
  const dest = roleDashboard(role)
  redirect(dest === '/dashboard' ? '/sign-in' : dest)
}
