import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Dead-zone regression guard. The reported bug: the sidebar/gutter/hamburger
// breakpoint triad all sat on `md` (768px) — a Samsung tablet reporting a
// 768-1023px CSS viewport got a 288px fixed sidebar + matching content gutter
// AND no hamburger at all, since the drawer's `md:hidden` fired at the same
// width the sidebar appeared. This test fails loudly (not silently) if any
// one of the three drifts from the other two.

const BREAKPOINT = '(sm|md|lg|xl|2xl)'

describe('nav breakpoint triad stays in lockstep', () => {
  const appLayout = readFileSync(
    path.join(process.cwd(), 'app/(app)/layout.tsx'),
    'utf-8'
  )
  const mobileSidebar = readFileSync(
    path.join(process.cwd(), 'app/_components/mobile-sidebar.tsx'),
    'utf-8'
  )

  // <aside> visibility utility: the line with the fixed sidebar's `hidden` +
  // `w-72` + a breakpoint:flex utility.
  const asideLine = appLayout
    .split('\n')
    .find((line) => line.includes('w-72') && line.includes('hidden'))
  const asideMatch = asideLine?.match(new RegExp(`${BREAKPOINT}:flex`))

  // Main-canvas padding utility (the content gutter that must open exactly
  // when the sidebar disappears).
  const mainCanvasMatch = appLayout.match(new RegExp(`${BREAKPOINT}:pl-72`))

  // Mobile-sidebar wrapper's hide-at-desktop utility.
  const mobileSidebarMatch = mobileSidebar.match(new RegExp(`${BREAKPOINT}:hidden`))

  it('finds a breakpoint prefix on the <aside> visibility utility', () => {
    expect(asideMatch, 'no (sm|md|lg|xl|2xl):flex found on the sidebar <aside> line').not.toBeNull()
  })

  it('finds a breakpoint prefix on the main-canvas padding utility', () => {
    expect(mainCanvasMatch, 'no (sm|md|lg|xl|2xl):pl-72 found in app/(app)/layout.tsx').not.toBeNull()
  })

  it('finds a breakpoint prefix on the mobile-sidebar wrapper', () => {
    expect(
      mobileSidebarMatch,
      'no (sm|md|lg|xl|2xl):hidden found in mobile-sidebar.tsx'
    ).not.toBeNull()
  })

  it('all three prefixes are identical — the dead-zone invariant', () => {
    const asidePrefix = asideMatch![1]
    const mainCanvasPrefix = mainCanvasMatch![1]
    const mobileSidebarPrefix = mobileSidebarMatch![1]
    expect(asidePrefix).toBe(mainCanvasPrefix)
    expect(mainCanvasPrefix).toBe(mobileSidebarPrefix)
  })

  it('the shared prefix is lg — tablets report 768-1023px CSS widths; a 288px sidebar there leaves under 512px of content, so the whole tablet band must get the drawer instead', () => {
    expect(asideMatch![1]).toBe('lg')
  })

  it('the aside still carries a bare `hidden` for below-breakpoint default state', () => {
    expect(asideLine).toContain('hidden')
  })

  it('the hamburger button is 44px (h-11 w-11)', () => {
    expect(mobileSidebar).toMatch(/h-11 w-11/)
  })
})
