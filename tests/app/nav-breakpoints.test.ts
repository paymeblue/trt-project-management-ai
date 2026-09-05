import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Dead-zone regression guard. Two bugs are locked down here.
//
// Bug 1 (original): the sidebar/gutter/hamburger triad all sat on `md` (768px)
// — a tablet reporting a 768-1023px CSS viewport got a 288px fixed sidebar +
// matching content gutter AND no hamburger at all, since the drawer's
// `md:hidden` fired at the same width the sidebar appeared.
//
// Bug 2 (field report, Galaxy Tab A11 SM-X135G): moving to `lg` was still not
// enough. Chrome on Android tablets can request the *desktop* site, which
// forces a >=1024px layout viewport regardless of physical screen size. The
// `lg:` rules then fired on an 8-11" touch screen: the persistent sidebar ate
// the width and the hamburger vanished — the original symptom, at a new
// trigger. The fix gates the sidebar on `pointer: fine` as well, so a touch
// device (coarse pointer) ALWAYS gets the drawer no matter what width the
// browser reports.
//
// The invariant that matters: the condition under which the sidebar appears
// must be character-for-character the condition under which the hamburger
// hides. If they ever drift, there is a width/pointer combination with either
// no navigation at all or two competing navs.

const CONDITION = '((?:sm|md|lg|xl|2xl):(?:pointer-fine:)?)'

describe('nav visibility condition stays in lockstep', () => {
  const appLayout = readFileSync(
    path.join(process.cwd(), 'app/(app)/layout.tsx'),
    'utf-8'
  )
  const mobileSidebar = readFileSync(
    path.join(process.cwd(), 'app/_components/mobile-sidebar.tsx'),
    'utf-8'
  )

  // <aside> visibility utility: the line with the fixed sidebar's `hidden` +
  // `w-72` + a <condition>flex utility.
  const asideLine = appLayout
    .split('\n')
    .find((line) => line.includes('w-72') && line.includes('hidden'))
  const asideMatch = asideLine?.match(new RegExp(`${CONDITION}flex`))

  // Main-canvas padding utility (the content gutter that must open exactly
  // when the sidebar appears).
  const mainCanvasMatch = appLayout.match(new RegExp(`${CONDITION}pl-72`))

  // Mobile-sidebar wrapper's hide-when-sidebar-is-showing utility.
  const mobileSidebarMatch = mobileSidebar.match(new RegExp(`${CONDITION}hidden`))

  it('finds a visibility condition on the <aside> utility', () => {
    expect(asideMatch, 'no <breakpoint>[:pointer-fine]:flex found on the sidebar <aside> line').not.toBeNull()
  })

  it('finds a visibility condition on the main-canvas padding utility', () => {
    expect(mainCanvasMatch, 'no <breakpoint>[:pointer-fine]:pl-72 found in app/(app)/layout.tsx').not.toBeNull()
  })

  it('finds a visibility condition on the mobile-sidebar wrapper', () => {
    expect(
      mobileSidebarMatch,
      'no <breakpoint>[:pointer-fine]:hidden found in mobile-sidebar.tsx'
    ).not.toBeNull()
  })

  it('all three conditions are identical — the dead-zone invariant', () => {
    const asideCondition = asideMatch![1]
    const mainCanvasCondition = mainCanvasMatch![1]
    const mobileSidebarCondition = mobileSidebarMatch![1]
    expect(asideCondition).toBe(mainCanvasCondition)
    expect(mainCanvasCondition).toBe(mobileSidebarCondition)
  })

  it('the shared condition is lg:pointer-fine: — width alone is not enough, because Chrome\'s "Desktop site" mode on an Android tablet reports a >=1024px viewport on a touch screen', () => {
    expect(asideMatch![1]).toBe('lg:pointer-fine:')
  })

  it('gates on pointer-fine so any coarse-pointer (touch) device always gets the drawer', () => {
    // If this drops back to a bare `lg:`, a desktop-site-mode tablet loses its
    // hamburger again — the exact field-reported regression.
    expect(asideMatch![1]).toContain('pointer-fine:')
  })

  it('the aside still carries a bare `hidden` for the default (drawer) state', () => {
    expect(asideLine).toContain('hidden')
  })

  it('the hamburger button is 44px (h-11 w-11)', () => {
    expect(mobileSidebar).toMatch(/h-11 w-11/)
  })
})
