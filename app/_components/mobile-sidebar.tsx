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
  alwaysVisible = false,
}: {
  name: string
  role: string
  roleLabel: string
  initials: string
  avatarData?: string | null
  /**
   * Set for phone/tablet User-Agents. The hamburger then renders at EVERY
   * width, because real Android tablets report a >=1024px CSS viewport — a
   * width-based `lg:hidden` there hides the only way to navigate.
   */
  alwaysVisible?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={alwaysVisible ? '' : 'lg:hidden'}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
      >
        {/*
          Inline SVG, deliberately NOT the `material-symbols-outlined` ligature
          used elsewhere in the header. That icon font is fetched from
          fonts.googleapis.com; when it is slow, blocked, or still loading, a
          ligature renders as its literal text ("menu") — so the one control
          that opens navigation would look like stray text instead of a
          hamburger. This is the only way to navigate on a handheld, so it must
          not depend on a third-party font request.
        */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
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
