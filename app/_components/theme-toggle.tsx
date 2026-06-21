'use client'

import { useSyncExternalStore } from 'react'

// Tiny external store over the <html> `dark` class so we can read it without a
// setState-in-effect. Toggling notifies subscribers to re-render.
const listeners = new Set<() => void>()
function emit() {
  for (const l of listeners) l()
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function isDark() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false)

  function toggle() {
    const next = !isDark()
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
    emit()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition hover:bg-surface-container-high"
    >
      <span className="material-symbols-outlined text-[20px]">{dark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  )
}
