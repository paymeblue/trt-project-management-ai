/*
 * TRT PM service worker.
 *
 * INVARIANT: this service worker must never cache HTML, RSC payloads, or
 * /api responses. Tablets are shared between PMs and every app route
 * renders the signed-in user's own data — caching any of that would let
 * the next person to pick up the same tablet see the previous user's
 * projects, checklists, or messages.
 *
 * Only immutable, user-agnostic static assets are cached (cache-first):
 * hashed Next.js build chunks, PWA icons, and a small set of static brand
 * assets. Everything else — every non-GET, every cross-origin request,
 * every /api/* call, every RSC data fetch, every page navigation — is left
 * to the network untouched, with a network-only + /offline-fallback
 * strategy for navigations specifically.
 */

const CACHE_VERSION = 'trt-pm-v1'
const STATIC_CACHE = CACHE_VERSION + '-static'

const STATIC_ASSET_PATHS = ['/manifest.webmanifest', '/favicon.ico', '/icon.svg', '/trt-logo.webp']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(['/offline']))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 1. Only GET requests are ever considered for caching.
  if (request.method !== 'GET') return

  // 2. Same-origin only.
  if (url.origin !== self.location.origin) return

  // 3. Never touch /api/* — these are always user-scoped mutations/reads.
  if (url.pathname.startsWith('/api/')) return

  // 4. Never touch RSC data requests — they carry the signed-in user's
  //    rendered data even though they may share a pathname with a page.
  if (
    request.headers.get('RSC') ||
    request.headers.get('Next-Router-Prefetch') ||
    url.searchParams.has('_rsc')
  ) {
    return
  }

  // 5. Navigations: network-only, fall back to the precached offline page.
  //    Never written to a cache — a cached navigation response is exactly
  //    the shared-tablet staleness risk this worker exists to prevent.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  // Immutable allowlist: content-hashed build chunks, icons, and static
  // brand assets. Cache-first, network fallback, populate cache only on a
  // genuinely successful, non-opaque 200.
  const isImmutableAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    STATIC_ASSET_PATHS.includes(url.pathname)

  if (!isImmutableAsset) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response && response.ok && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
