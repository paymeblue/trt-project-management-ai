'use client'

import { useState } from 'react'
import SidebarNav from '@/app/_components/sidebar-nav'
import SignOutButton from '@/app/_components/sign-out-button'
import { TrtLogo } from '@/app/_components/trt-logo'

export default function MobileSidebar({
  name,
  role,
  roleLabel,
  initials,
  avatarData,
}: {
  name: string
  role: string
  roleLabel: string
  initials: string
  avatarData?: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="flex h-10 w-10 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          {/* Drawer — close on any nav link tap (event delegation) */}
          <aside
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false)
            }}
            className="relative z-10 flex h-full w-72 max-w-[80%] flex-col overflow-y-auto border-r border-outline-variant bg-surface-container-low"
          >
            <div className="flex items-center border-b border-outline-variant px-6 py-4">
              <TrtLogo />
            </div>
            <div className="flex items-center gap-3 border-b border-outline-variant p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-container text-title-md font-bold text-on-primary-container">
                {avatarData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarData} alt={name} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-title-md font-bold text-primary">{name}</p>
                <p className="text-body-md text-on-surface-variant">{roleLabel}</p>
              </div>
            </div>

            <SidebarNav role={role} />

            <div className="border-t border-outline-variant p-4">
              <SignOutButton />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
