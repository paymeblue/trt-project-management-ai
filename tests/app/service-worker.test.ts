import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Drives the REAL shipped public/sw.js through a fake ServiceWorkerGlobalScope
// via node:vm, rather than re-implementing/text-grepping the logic — this is
// the enforcement mechanism for T-kyw-01/T-kyw-05 in the plan's threat model.

type Handler = (event: unknown) => void

function loadServiceWorker() {
  const swSource = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf-8')

  const listeners = new Map<string, Handler>()
  const cacheStore = new Map<string, Map<string, Response>>()
  const putCalls: Array<{ cacheName: string; request: unknown }> = []
  const fetchSpy = vi.fn()

  function makeCache(name: string) {
    if (!cacheStore.has(name)) cacheStore.set(name, new Map())
    const store = cacheStore.get(name)!
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) store.set(u, new Response(`precached:${u}`, { status: 200 }))
      },
      match: async (request: Request | string) => {
        const key = typeof request === 'string' ? request : new URL(request.url).pathname
        return store.get(key)
      },
      put: async (request: Request | string, response: Response) => {
        const key = typeof request === 'string' ? request : new URL(request.url).pathname
        store.set(key, response)
        putCalls.push({ cacheName: name, request: key })
      },
    }
  }

  const caches = {
    open: async (name: string) => makeCache(name),
    match: async (key: Request | string) => {
      const pathname = typeof key === 'string' ? key : new URL(key.url).pathname
      for (const store of cacheStore.values()) {
        if (store.has(pathname)) return store.get(pathname)
      }
      return undefined
    },
    keys: async () => Array.from(cacheStore.keys()),
    delete: async (name: string) => cacheStore.delete(name),
  }

  const self: Record<string, unknown> = {
    addEventListener: (type: string, handler: Handler) => listeners.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    location: { origin: 'https://app.example' },
  }

  const context = vm.createContext({
    self,
    caches,
    fetch: fetchSpy,
    Request,
    Response,
    URL,
    console,
  })

  vm.runInContext(swSource, context)

  return { listeners, caches, cacheStore, putCalls, fetchSpy, self }
}

// Real Request/Fetch implementations (undici, and browsers) refuse
// `mode: 'navigate'` as a constructor option — it's a browser-internal
// value only ever observed on an incoming fetch event, never settable by
// script. Use a minimal fake for navigation-mode assertions; sw.js only
// ever reads request.method/mode/headers/url.
function makeNavigateRequest(url: string) {
  return {
    method: 'GET',
    mode: 'navigate',
    url,
    headers: { get: () => null },
  }
}

function makeEvent(request: unknown) {
  let respondWithCalled = false
  let respondWithValue: unknown
  return {
    event: {
      request,
      respondWith: vi.fn((p: unknown) => {
        respondWithCalled = true
        respondWithValue = p
      }),
      waitUntil: vi.fn(),
    },
    wasRespondWithCalled: () => respondWithCalled,
    getRespondWithValue: () => respondWithValue,
  }
}

describe('public/sw.js fetch handler', () => {
  let sw: ReturnType<typeof loadServiceWorker>

  beforeEach(() => {
    sw = loadServiceWorker()
  })

  it('1. passthrough: POST to /api/*', () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const request = new Request('https://app.example/api/checklists', { method: 'POST' })
    const { event, wasRespondWithCalled } = makeEvent(request)
    fetchHandler(event)
    expect(wasRespondWithCalled()).toBe(false)
  })

  it('2. passthrough: GET /api/*', () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const request = new Request('https://app.example/api/projects')
    const { event, wasRespondWithCalled } = makeEvent(request)
    fetchHandler(event)
    expect(wasRespondWithCalled()).toBe(false)
  })

  it('3. passthrough: RSC-header GET to a page path', () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const request = new Request('https://app.example/dashboard', {
      headers: { RSC: '1' },
    })
    const { event, wasRespondWithCalled } = makeEvent(request)
    fetchHandler(event)
    expect(wasRespondWithCalled()).toBe(false)
  })

  it('4. navigation resolves to network response and writes zero cache entries', async () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const networkResponse = new Response('<html>dashboard</html>', { status: 200 })
    sw.fetchSpy.mockResolvedValueOnce(networkResponse)

    const request = makeNavigateRequest('https://app.example/dashboard')
    const { event, wasRespondWithCalled, getRespondWithValue } = makeEvent(request)
    fetchHandler(event)
    expect(wasRespondWithCalled()).toBe(true)
    const resolved = await getRespondWithValue()
    expect(resolved).toBe(networkResponse)
    expect(sw.putCalls.length).toBe(0)
  })

  it('5. navigation falls back to the precached /offline response when fetch rejects', async () => {
    const installHandler = sw.listeners.get('install')!
    await new Promise<void>((resolve) => {
      installHandler({ waitUntil: (p: Promise<unknown>) => p.then(() => resolve()) })
    })

    const fetchHandler = sw.listeners.get('fetch')!
    sw.fetchSpy.mockRejectedValueOnce(new Error('network down'))

    const request = makeNavigateRequest('https://app.example/dashboard')
    const { event, getRespondWithValue } = makeEvent(request)
    fetchHandler(event)
    const resolved = (await getRespondWithValue()) as Response
    expect(await resolved.text()).toContain('precached:/offline')
  })

  it('6. immutable static asset resolves from cache without hitting fetch', async () => {
    const cache = await sw.caches.open('trt-pm-v1-static')
    await cache.put('/_next/static/chunks/abc.js', new Response('cached-js', { status: 200 }))
    sw.fetchSpy.mockClear()

    const fetchHandler = sw.listeners.get('fetch')!
    const request = new Request('https://app.example/_next/static/chunks/abc.js')
    const { event, getRespondWithValue } = makeEvent(request)
    fetchHandler(event)
    const resolved = (await getRespondWithValue()) as Response
    expect(await resolved.text()).toBe('cached-js')
    expect(sw.fetchSpy).not.toHaveBeenCalled()
  })

  it('7. immutable static asset cache-miss fetches and records exactly one put', async () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const networkResponse = new Response('fresh-js', { status: 200 })
    sw.fetchSpy.mockResolvedValueOnce(networkResponse)

    const request = new Request('https://app.example/_next/static/chunks/new.js')
    const { event, getRespondWithValue } = makeEvent(request)
    fetchHandler(event)
    await getRespondWithValue()
    // allow the async cache.put() inside the fetch .then() to flush
    await new Promise((r) => setTimeout(r, 0))
    expect(sw.putCalls.length).toBe(1)
  })

  it('8. passthrough: cross-origin GET', () => {
    const fetchHandler = sw.listeners.get('fetch')!
    const request = new Request('https://fonts.googleapis.com/css2')
    const { event, wasRespondWithCalled } = makeEvent(request)
    fetchHandler(event)
    expect(wasRespondWithCalled()).toBe(false)
  })
})

describe('app/offline/page.tsx stays session-free', () => {
  it('imports none of the session/DB modules', () => {
    const source = readFileSync(path.join(process.cwd(), 'app/offline/page.tsx'), 'utf-8')
    expect(source).not.toMatch(/@\/lib\/dal|@\/db|next-auth/)
  })
})
