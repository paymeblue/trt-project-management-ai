import { requireRole } from '@/lib/dal'

export default async function SitePmLayout({ children }: { children: React.ReactNode }) {
  await requireRole('site_pm')
  return <>{children}</>
}
