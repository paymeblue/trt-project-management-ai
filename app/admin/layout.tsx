import { requireRole } from '@/lib/dal'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole('super_admin')
  return <>{children}</>
}
