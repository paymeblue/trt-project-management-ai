'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

type Item = { href: string; icon: string; label: string }

const NAV: Record<string, Item[]> = {
  factory_pm: [
    { href: '/factory-pm/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/factory-pm/projects', icon: 'factory', label: 'Floor Projects' },
    { href: '/checklists/delivery_project', icon: 'fact_check', label: 'Delivery Checklist' },
    { href: '/factory-pm/product-readiness', icon: 'inventory_2', label: 'Product Readiness' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  site_pm: [
    { href: '/site-pm/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/site-pm/projects', icon: 'factory', label: 'Projects' },
    { href: '/checklists/confirmation', icon: 'fact_check', label: 'Confirmation' },
    { href: '/checklists/production', icon: 'inventory_2', label: 'Production' },
    { href: '/site-pm/issues', icon: 'assignment_late', label: 'Issue Log' },
    { href: '/email-formats', icon: 'mail', label: 'Email Formats' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  super_admin: [
    { href: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
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
  const items = NAV[role] ?? []

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
