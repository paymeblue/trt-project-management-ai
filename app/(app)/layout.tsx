import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import SidebarNav from '@/app/_components/sidebar-nav'
import SignOutButton from '@/app/_components/sign-out-button'
import DaveAredo from '@/app/_components/dave-aredo'

const ROLE_LABELS: Record<string, string> = {
  factory_pm: 'Factory PM',
  site_pm: 'Site PM',
  super_admin: 'Super Admin',
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/sign-in')

  const name = session.user.name ?? 'User'
  const role = (session.user.role as string) ?? 'factory_pm'
  const initials =
    name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'

  return (
    <div className="min-h-screen bg-background text-on-surface">
      {/* NavigationDrawer (fixed, out of flow) */}
      <aside className="fixed left-0 top-0 bottom-0 z-40 hidden w-72 flex-col overflow-y-auto border-r border-outline-variant bg-surface-container-low md:flex">
        <div className="flex items-center gap-3 border-b border-outline-variant p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-container text-title-md font-title-md font-bold text-on-primary-container">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-title-md font-title-md font-bold text-primary">{name}</p>
            <p className="text-body-md font-body-md text-on-surface-variant">{ROLE_LABELS[role] ?? role}</p>
            <p className="text-label-sm font-label-sm uppercase tracking-wider text-on-surface-variant">
              Aredo Manufacturing
            </p>
          </div>
        </div>

        <SidebarNav role={role} />

        <div className="border-t border-outline-variant p-4">
          <SignOutButton />
        </div>
      </aside>

      {/* Main canvas — block with left padding for the fixed sidebar (can't collapse) */}
      <div className="flex min-h-screen w-full flex-col md:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant bg-surface/95 px-margin-mobile backdrop-blur-sm md:h-20 md:px-margin-desktop">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">architecture</span>
            <h1 className="text-headline-md font-headline-md font-extrabold text-primary">TRT Arredo</h1>
          </div>
          <span className="rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 text-label-md font-label-md text-on-surface-variant">
            {ROLE_LABELS[role] ?? role}
          </span>
        </header>

        <main className="w-full flex-1 px-margin-mobile py-lg md:px-margin-desktop">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {/* Dave Aredo floating assistant */}
      <DaveAredo />
    </div>
  )
}
