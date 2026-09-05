import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isHandheldUserAgent } from '@/lib/device'

// Nav availability guard. There must never be a device/width combination that
// renders NEITHER the persistent sidebar NOR the hamburger, because that
// strands the user with no way to navigate.
//
// This bug was reported three times on a real Samsung Galaxy Tab A11
// (SM-X135G), and each CSS-only fix failed for a new reason:
//
//   1. `md:` (768px)          — tablet reported 768-1023px: sidebar rendered on
//                               an 8-11" screen AND `md:hidden` hid the hamburger.
//   2. `lg:` (1024px)         — tablet still reported >=1024px CSS width.
//   3. `lg:pointer-fine:`     — tablet did not report a coarse pointer either.
//
// Conclusion: on real Android tablets BOTH the viewport width and the `pointer`
// media feature are unreliable. The layout now decides from the User-Agent
// server-side, so a handheld always gets the hamburger regardless of width.

describe('handheld User-Agent detection', () => {
  it('detects the reported Galaxy Tab A11 (SM-X135G)', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; SM-X135G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(isHandheldUserAgent(ua)).toBe(true)
  })

  it('detects an Android tablet even when Chrome omits the "Mobile" token', () => {
    // Tablets drop the `Mobile` token that phones carry — matching on `Mobile`
    // alone would miss every Android tablet, which is the whole bug.
    const tabletUa =
      'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    expect(tabletUa).not.toContain('Mobile')
    expect(isHandheldUserAgent(tabletUa)).toBe(true)
  })

  it('detects iPhone and iPad', () => {
    expect(
      isHandheldUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')
    ).toBe(true)
    expect(isHandheldUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148')).toBe(
      true
    )
  })

  it('does NOT flag desktop browsers — they keep the persistent sidebar', () => {
    expect(
      isHandheldUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      )
    ).toBe(false)
    expect(
      isHandheldUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      )
    ).toBe(false)
  })

  it('treats a missing User-Agent as desktop rather than throwing', () => {
    expect(isHandheldUserAgent(null)).toBe(false)
    expect(isHandheldUserAgent(undefined)).toBe(false)
    expect(isHandheldUserAgent('')).toBe(false)
  })
})

describe('nav shell wiring', () => {
  const appLayout = readFileSync(path.join(process.cwd(), 'app/(app)/layout.tsx'), 'utf-8')
  const mobileSidebar = readFileSync(
    path.join(process.cwd(), 'app/_components/mobile-sidebar.tsx'),
    'utf-8'
  )

  it('layout derives isHandheld from the request User-Agent', () => {
    expect(appLayout).toMatch(/isHandheldUserAgent\(\s*\(await headers\(\)\)\.get\('user-agent'\)/)
  })

  it('the sidebar and its content gutter are both suppressed on handhelds', () => {
    // Both must be gated on the SAME flag. Suppressing only the sidebar would
    // leave a 288px empty gutter; suppressing only the gutter would leave the
    // sidebar overlaying content.
    const asideLine = appLayout.split('\n').find((l) => l.includes("isHandheld ? '' : 'lg:flex'"))
    const gutterLine = appLayout.split('\n').find((l) => l.includes("isHandheld ? '' : 'lg:pl-72'"))
    expect(asideLine, 'sidebar <aside> is not gated on isHandheld').toBeDefined()
    expect(gutterLine, 'main content gutter is not gated on isHandheld').toBeDefined()
  })

  it('the hamburger is forced visible on handhelds', () => {
    expect(appLayout).toMatch(/alwaysVisible=\{isHandheld\}/)
    expect(mobileSidebar).toMatch(/alwaysVisible \? '' : 'lg:hidden'/)
  })

  it('the hamburger button is 44px (h-11 w-11) for gloved factory-floor use', () => {
    expect(mobileSidebar).toMatch(/h-11 w-11/)
  })
})
