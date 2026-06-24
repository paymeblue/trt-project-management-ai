import { requireAdmin } from '@/lib/dal'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
