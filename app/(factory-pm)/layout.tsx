import { requireRole } from '@/lib/dal'

export default async function FactoryPmLayout({ children }: { children: React.ReactNode }) {
  await requireRole('factory_pm')
  return <>{children}</>
}
