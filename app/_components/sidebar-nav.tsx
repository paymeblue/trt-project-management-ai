'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Roles } from '@/lib/workflow'

type Item = { href: string; icon: string; label: string }
type Group = { group: string; icon: string; items: Item[] }
type Entry = Item | Group
const isGroup = (e: Entry): e is Group => 'group' in e

const NAV: Record<string, Entry[]> = {
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
  // Admin nav grouped into collapsible sections to keep it short.
  super_admin: [
    { href: '/admin/dashboard', icon: 'dashboard', label: 'Dashboard' },
    {
      group: 'Projects',
      icon: 'folder_open',
      items: [
        { href: '/admin/projects/new', icon: 'add_box', label: 'New Project' },
        { href: '/admin/timeline', icon: 'timeline', label: 'Timeline' },
        { href: '/admin/approvals', icon: 'approval', label: 'Approvals' },
      ],
    },
    {
      group: 'Insights',
      icon: 'insights',
      items: [
        { href: '/admin/analytics', icon: 'analytics', label: 'Analytics' },
        { href: '/admin/overview', icon: 'monitoring', label: 'Overview' },
      ],
    },
    {
      group: 'Manage',
      icon: 'tune',
      items: [
        { href: '/admin/users', icon: 'group', label: 'Users' },
        { href: '/admin/content', icon: 'edit_note', label: 'Content' },
        { href: '/admin/checklists', icon: 'fact_check', label: 'Checklists' },
        { href: '/admin/issues', icon: 'assignment_late', label: 'Issue Log' },
        { href: '/admin/workflow-configurator', icon: 'account_tree', label: 'Workflow Configurator' },
      ],
    },
    {
      group: 'Company',
      icon: 'apartment',
      items: [
        { href: '/processes', icon: 'account_tree', label: 'Processes' },
        { href: '/about', icon: 'info', label: 'About TRT' },
        { href: '/profile', icon: 'person', label: 'Profile' },
      ],
    },
  ],
  design: [
    { href: '/design/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  production: [
    { href: '/production/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  architect: [
    { href: '/architect/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  customer_care: [
    { href: '/customer-care/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/customer-care/projects/new', icon: 'add_box', label: 'New Project' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  factory_operations: [
    { href: '/factory-operations/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
  factory_manager: [
    { href: '/factory-manager/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { href: '/processes', icon: 'account_tree', label: 'Processes' },
    { href: '/profile', icon: 'person', label: 'Profile' },
    { href: '/about', icon: 'info', label: 'About TRT' },
  ],
}

export default function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname()
  // Operations shares the full admin navigation.
  const entries = NAV[role] ?? NAV[role === Roles.Operations ? Roles.SuperAdmin : role] ?? []
  const flatItems = entries.flatMap((e) => (isGroup(e) ? e.items : [e]))

  // Collapsible groups — a group defaults to open when it holds the active route
  // (see `isOpen` below); an explicit toggle overrides that.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  // Until the icon/text fonts finish loading, Material Symbols render as raw
  // ligature text ("dashboard", "fact_check"…). Show a skeleton instead.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    const t = setTimeout(() => alive && setFontsReady(true), fonts ? 2500 : 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  if (!fontsReady) {
    return (
      <nav className="flex-1 space-y-1 px-3 py-4" aria-hidden>
        {flatItems.map((it) => (
          <div key={it.href} className="flex items-center gap-3 rounded-full px-4 py-3">
            <span className="h-5 w-5 shrink-0 animate-pulse rounded bg-surface-container-high" />
            <span className="h-3 w-24 animate-pulse rounded bg-surface-container-high" />
          </div>
        ))}
      </nav>
    )
  }

  const linkClass = (active: boolean, indented = false) =>
    `flex items-center gap-3 rounded-full py-3 transition-colors ${indented ? 'pl-6 pr-4' : 'px-4'} ${
      active
        ? 'bg-secondary-container font-bold text-on-secondary-container'
        : 'text-on-surface-variant hover:bg-surface-container-high'
    }`

  return (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {entries.map((e) => {
        if (!isGroup(e)) {
          const active = pathname === e.href
          return (
            <Link key={e.href} href={e.href} className={linkClass(active)}>
              <span className={`material-symbols-outlined ${active ? 'fill' : ''}`}>{e.icon}</span>
              <span className="text-label-md font-label-md">{e.label}</span>
            </Link>
          )
        }
        const hasActive = e.items.some((i) => i.href === pathname)
        const isOpen = openGroups[e.group] ?? hasActive
        return (
          <div key={e.group}>
            <button
              type="button"
              onClick={() => setOpenGroups((prev) => ({ ...prev, [e.group]: !isOpen }))}
              className={`flex w-full items-center gap-3 rounded-full px-4 py-3 transition-colors ${
                hasActive
                  ? 'text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined">{e.icon}</span>
              <span className="flex-1 text-left text-label-md font-label-md">{e.group}</span>
              <span className="material-symbols-outlined text-base">
                {isOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {isOpen && (
              <div className="mt-1 space-y-1">
                {e.items.map((it) => {
                  const active = pathname === it.href
                  return (
                    <Link key={it.href} href={it.href} className={linkClass(active, true)}>
                      <span className={`material-symbols-outlined ${active ? 'fill' : ''}`}>
                        {it.icon}
                      </span>
                      <span className="text-label-md font-label-md">{it.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
