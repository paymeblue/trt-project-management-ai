'use client'

import { useEffect } from 'react'

// Mounted once in the root layout, alongside (not wrapping) children.
//
// Production: registers /sw.js.
// Dev: actively unregisters any existing registration and clears every
// cache. `npm run dev` uses --webpack, and a leftover SW from a local
// production build (`npm run build && npm start`) would otherwise serve
// stale hashed chunks against a dev server and break HMR.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.warn('Service worker registration failed', err)
      })
      return
    }

    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => {})

    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {})
    }
  }, [])

  return null
}
