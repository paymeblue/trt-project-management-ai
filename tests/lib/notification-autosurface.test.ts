import { describe, it, expect } from 'vitest'
import { shouldAutoOpenBell } from '@/lib/notification-autosurface'

// Quick task 260728-esc (ESC-C): unit coverage of the pure auto-open
// decision matrix. No DOM, no React rendering — this repo's vitest config
// is `environment: 'node'` and there is no component-test harness, which is
// exactly why the decision is extracted as a pure function instead of
// living inline in the bell's effect.
describe('shouldAutoOpenBell', () => {
  it('returns true when there is at least one unread id not yet auto-surfaced, panel closed, no forcing overlay, not typing', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1', 'n-2'],
        autoSurfacedIds: new Set(),
        isOpen: false,
        forcingOverlayActive: false,
        isTypingInForm: false,
      }),
    ).toBe(true)
  })

  it('returns false once every unread id has already been auto-surfaced this session (once-per-session)', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1', 'n-2'],
        autoSurfacedIds: new Set(['n-1', 'n-2']),
        isOpen: false,
        forcingOverlayActive: false,
        isTypingInForm: false,
      }),
    ).toBe(false)
  })

  it('returns true again as soon as a NEW unread id appears alongside already-surfaced ones', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1', 'n-2', 'n-3'],
        autoSurfacedIds: new Set(['n-1', 'n-2']),
        isOpen: false,
        forcingOverlayActive: false,
        isTypingInForm: false,
      }),
    ).toBe(true)
  })

  it('returns false when a forcing overlay is active (step gate or call gate on screen)', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1'],
        autoSurfacedIds: new Set(),
        isOpen: false,
        forcingOverlayActive: true,
        isTypingInForm: false,
      }),
    ).toBe(false)
  })

  it('returns false when the user is typing in a field', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1'],
        autoSurfacedIds: new Set(),
        isOpen: false,
        forcingOverlayActive: false,
        isTypingInForm: true,
      }),
    ).toBe(false)
  })

  it('returns false when the panel is already open', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: ['n-1'],
        autoSurfacedIds: new Set(),
        isOpen: true,
        forcingOverlayActive: false,
        isTypingInForm: false,
      }),
    ).toBe(false)
  })

  it('returns false when unread is zero', () => {
    expect(
      shouldAutoOpenBell({
        unreadIds: [],
        autoSurfacedIds: new Set(),
        isOpen: false,
        forcingOverlayActive: false,
        isTypingInForm: false,
      }),
    ).toBe(false)
  })
})
