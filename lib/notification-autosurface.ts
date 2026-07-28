import { useEffect, useSyncExternalStore } from 'react'

// Quick task 260728-esc (ESC-C).
//
// DESIGN DECISION: the bell must NOT auto-open on every navigation — that is
// hostile on every page load and trains users to dismiss reflexively.
// Instead it auto-opens ONCE PER SESSION while at least one unread
// notification has not yet been auto-surfaced, so the actual titles/bodies
// get read; after that it stays closed for the session unless a NEW unread
// arrives, which re-arms it exactly once more. It is fully dismissible, it
// never marks anything read (the badge must survive an unread notification
// the user glanced at but did not act on), and it never moves focus.
//
// PRECEDENCE: PendingCallGate (z-[70]) > PendingStepGate (z-[60]) > bell
// auto-surface. The bell dropdown is a header-anchored, non-modal popover; a
// forcing modal is a full-screen demand for a decision. Two things demanding
// the screen at once is the failure mode to avoid, so the bell yields — it
// does not race, it defers, and re-evaluates on the next poll tick once the
// modal is gone or dismissed.

export const AUTO_SURFACED_KEY = 'trt.bell.autoSurfacedIds'

/**
 * Pure decision (node-testable, no React, no DOM). Returns true only when
 * the panel is closed, no forcing overlay is active, the user is not typing,
 * and at least one unread id has not already been auto-surfaced this
 * session.
 */
export function shouldAutoOpenBell(input: {
  unreadIds: string[]
  autoSurfacedIds: ReadonlySet<string>
  isOpen: boolean
  forcingOverlayActive: boolean
  isTypingInForm: boolean
}): boolean {
  if (input.isOpen || input.forcingOverlayActive || input.isTypingInForm) return false
  return input.unreadIds.some((id) => !input.autoSurfacedIds.has(id))
}

// ── Forcing-overlay registration store ─────────────────────────────────────
// Module-scope counter + listener Set, exposed through useSyncExternalStore
// — no context provider, so the gates and the bell do not need a shared
// ancestor beyond being client components.
let forcingOverlayCount = 0
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return forcingOverlayCount > 0
}

function getServerSnapshot(): boolean {
  return false
}

/**
 * Registers whether a forcing overlay (step gate / call gate) is currently
 * rendering. Safe to call unconditionally with `false` (hooks rules) —
 * increments on mount-while-active, decrements on cleanup/deactivate.
 */
export function useRegisterForcingOverlay(active: boolean): void {
  useEffect(() => {
    if (!active) return
    forcingOverlayCount += 1
    notifyListeners()
    return () => {
      forcingOverlayCount -= 1
      notifyListeners()
    }
  }, [active])
}

export function useForcingOverlayActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
