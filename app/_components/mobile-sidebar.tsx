'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
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
  const pathname = usePathname()
  const [lastPathname, setLastPathname] = useState(pathname)

  // Close on navigation. Keyed off the pathname rather than the link click so
  // it also covers back/forward, programmatic navigation, and a tap on the
  // already-active route — the anchor-click handler alone missed those.
  // Adjusted during render, not in an effect: an effect would paint the drawer
  // once over the new page before closing it (and trips the cascading-render
  // lint rule).
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  // The drawer is full-screen, so there is no visible scrim left to tap.
  // Escape must work, and the page behind must not scroll under it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

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
        // h-dvh, not h-screen: on mobile browsers 100vh is the *largest*
        // viewport and sits behind the address bar, which would push the
        // sign-out row off-screen.
        <div className="fixed inset-0 z-50 flex h-dvh w-screen">
          {/* Drawer — full screen. Closes on any nav link tap (event
              delegation) as immediate feedback; the pathname check above is
              the real guarantee. */}
          <aside
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setOpen(false)
            }}
            className="relative z-10 flex h-full w-full flex-col overflow-y-auto bg-surface-container-low"
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
              <TrtLogo />
              {/* Full-screen leaves no scrim to tap, so an explicit close
                  control is the only way out besides navigating. */}
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
              >
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
                  <line x1="5" y1="5" x2="19" y2="19" />
                  <line x1="19" y1="5" x2="5" y2="19" />
                </svg>
              </button>
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
