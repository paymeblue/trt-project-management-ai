'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Roles } from '@/lib/workflow'

type Item = { href: string; icon: string; label: string }

const NAV: Record<string, Item[]> = {
  factory_pm: [
    { href: '/factory-pm/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/factory-pm/projects', icon: 'factory', label: 'Projects' },
    { href: '/factory-pm/product-readiness', icon: 'inventory_2', label: 'Product Readiness' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  site_pm: [
    { href: '/site-pm/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/site-pm/projects', icon: 'factory', label: 'Projects' },
    { href: '/site-pm/issues', icon: 'assignment_late', label: 'Issue Log' },
    { href: '/email-formats', icon: 'mail', label: 'Email Formats' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  super_admin: [
    { href: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/admin/projects/new', icon: 'add_box', label: 'New Project' },
    { href: '/admin/timeline', icon: 'timeline', label: 'Timeline' },
    { href: '/admin/overview', icon: 'monitoring', label: 'Overview' },
    { href: '/admin/users', icon: 'group', label: 'Users' },
    { href: '/admin/content', icon: 'edit_note', label: 'Content' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/about', icon: 'info', label: 'About TRT' },
    { href: '/profile', icon: 'person', label: 'Profile' },
  ],
}

export default function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname()
  // Operations shares the full admin navigation.
  const items = NAV[role] ?? NAV[role === Roles.Operations ? Roles.SuperAdmin : role] ?? []

  // Until the icon/text fonts finish loading, Material Symbols render as raw
  // ligature text ("dashboard", "fact_check"…). Show a skeleton instead.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    // Fallback so we never get stuck on the skeleton (and covers no-FontFaceSet).
    const t = setTimeout(() => alive && setFontsReady(true), fonts ? 2500 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  if (!fontsReady) {
    return (
      <nav className="flex-1 space-y-1 px-3 py-4" aria-hidden>
        {items.map((it) => (
          <div key={it.href} className="flex items-center gap-3 rounded-full px-4 py-3">
            <span className="h-5 w-5 shrink-0 animate-pulse rounded bg-surface-container-high" />
            <span className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
          </div>
        ))}
      </nav>
    )
  }

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((it) => {
        const active = pathname === it.href
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-3 rounded-full px-4 py-3 transition-colors ${
              active
                ? 'bg-secondary-container font-bold text-on-secondary-container'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className={`material-symbols-outlined ${active ? 'fill' : ''}`}>{it.icon}</span>
            <span className="text-label-md font-label-md">{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
