---
phase: quick/260905-kyw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/generate-pwa-icons.ts
  - public/icons/icon-192.png
  - public/icons/icon-512.png
  - public/icons/icon-maskable-512.png
  - app/apple-icon.png
  - app/manifest.ts
  - app/layout.tsx
  - app/offline/page.tsx
  - app/_components/service-worker-register.tsx
  - public/sw.js
  - proxy.ts
  - next.config.ts
  - package.json
  - app/(app)/layout.tsx
  - app/_components/mobile-sidebar.tsx
  - tests/app/manifest.test.ts
  - tests/app/service-worker.test.ts
  - tests/app/nav-breakpoints.test.ts
autonomous: false
requirements: [PWA-01, PWA-02, PWA-03, NAV-01, NAV-02]
user_setup: []

must_haves:
  truths:
    - "A PM on an Android tablet can install the app to the home screen and it launches standalone (no browser chrome)."
    - "A PM on any viewport width from 320px to 2560px always has a working navigation affordance — either the persistent sidebar or a tappable hamburger, never neither."
    - "At tablet widths (768-1023px) the hamburger renders, the drawer opens, and tapping a nav link navigates and closes the drawer."
    - "The service worker never serves a cached HTML page, RSC payload, or /api response — a second user signing in on the same shared tablet can never see the first user's data from cache."
    - "A non-GET request is never intercepted or cached by the service worker."
    - "/sw.js and /manifest.webmanifest are fetchable while signed out (they are not redirected to /sign-in)."
    - "With the network offline, a navigation renders the /offline page instead of the browser error page."
  artifacts:
    - path: "app/manifest.ts"
      provides: "Web app manifest route (/manifest.webmanifest) with name, short_name, icons 192+512+maskable, display standalone, start_url, theme_color, background_color"
      exports: ["default"]
    - path: "public/sw.js"
      provides: "Hand-written minimal service worker: cache-first for immutable static assets only, offline navigation fallback, versioned cache purge"
      contains: "addEventListener('fetch'"
    - path: "app/_components/service-worker-register.tsx"
      provides: "Production-only SW registration + dev-time unregistration"
    - path: "app/offline/page.tsx"
      provides: "Static, session-free offline fallback page"
    - path: "public/icons/icon-512.png"
      provides: "PWA install icon at 512x512"
    - path: "app/apple-icon.png"
      provides: "iOS home-screen icon (Next auto-emits rel=apple-touch-icon)"
    - path: "tests/app/service-worker.test.ts"
      provides: "Behavioral test driving the real public/sw.js fetch handler through a fake ServiceWorkerGlobalScope"
    - path: "tests/app/nav-breakpoints.test.ts"
      provides: "Dead-zone regression guard asserting the sidebar/padding/hamburger breakpoint triad stays in lockstep"
  key_links:
    - from: "app/layout.tsx"
      to: "app/_components/service-worker-register.tsx"
      via: "component mount in <body>"
      pattern: "ServiceWorkerRegister"
    - from: "proxy.ts"
      to: "/sw.js, /manifest.webmanifest, /offline, /icons/"
      via: "negative lookahead in config.matcher"
      pattern: "sw\\.js|manifest\\.webmanifest"
    - from: "app/(app)/layout.tsx"
      to: "app/_components/mobile-sidebar.tsx"
      via: "shared lg: breakpoint — aside lg:flex / main lg:pl-72 / hamburger lg:hidden"
      pattern: "lg:pl-72"
---

<objective>
Make TRT PM a real installable PWA, and remove the tablet navigation dead zone that currently leaves Samsung-tablet users unable to navigate.

Purpose: PMs work on the factory floor and on installation sites from Android tablets. Today (a) there is no manifest, no service worker, and no home-screen icon — the app cannot be installed; and (b) the nav switches from hamburger to persistent sidebar at `md` (768px), so a tablet reporting a 768-1023px CSS viewport gets a 288px fixed sidebar crammed into an 800px screen, `md:pl-72` gutter eating the content area, and **no hamburger at all**.

Output: `app/manifest.ts`, generated PNG icon set, `public/sw.js` + registration, `/offline` page, proxy matcher exclusions, and the nav breakpoint triad moved `md:` → `lg:` with 44px touch targets — all covered by three new vitest suites.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@AGENTS.md

@app/(app)/layout.tsx
@app/_components/mobile-sidebar.tsx
@app/layout.tsx
@proxy.ts
@auth.config.ts
@next.config.ts
@vitest.config.ts
</context>

<investigation_findings>
Findings from planning — treat as established fact, do not re-derive.

**PWA: nothing exists today.**
- `public/` holds only `file.svg globe.svg next.svg trt-logo.webp vercel.svg window.svg`. No manifest, no sw.js, no icons dir.
- Zero matches for `manifest|service.?worker|apple-touch|standalone` across `app/`, `next.config.ts`, `package.json`.
- `app/layout.tsx` exports `metadata` only — **no `viewport` export**. Next 16 auto-emits `width=device-width, initial-scale=1` by default (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` line 124: "The `viewport` meta tag is automatically set... the default is sufficient"), so the missing viewport export is NOT the tablet bug.
- Existing icon assets: `app/favicon.ico`, `app/icon.svg` (40x40 rounded-rect TRT mark, gradient `#f97316` → `#9d4300`).

**Nav dead zone: root-caused.** Exactly three class strings form the breakpoint triad, all on `md` (768px):
1. `app/(app)/layout.tsx:84` — `<aside className="fixed ... hidden w-72 ... md:flex">`
2. `app/(app)/layout.tsx:124` — `<div className="... flex-col md:pl-72">`
3. `app/_components/mobile-sidebar.tsx:24` — `<div className="md:hidden">`

Tailwind v4 **defaults** are in force — `app/globals.css` `@theme` (line 7) defines only spacing/color tokens, zero `--breakpoint-*` overrides. So `md` = 48rem = 768px, `lg` = 64rem = 1024px.

Consequence at a Samsung tablet's 768-1023px CSS viewport: `md:` fires, so the hamburger is hidden AND a 288px sidebar + 288px `pl-72` gutter consume 36% of the screen. Moving all three to `lg:` gives the whole tablet range a drawer, and keeps the persistent sidebar for ≥1024px.

Grep confirms no other consumer of the sidebar offset: `pl-72|left-72|ml-72` appears **only** at `app/(app)/layout.tsx:124`. `PaulArredo` is `fixed bottom-6 right-6` (viewport-anchored, sidebar-independent). `chat-drawer.tsx:779` and `paul-arredo.tsx:274` have their own `hidden ... md:flex` panels, but those are **inside full-screen overlays** and their `md:hidden` toggle buttons are the exact complement — no dead zone, **leave them alone**.

**Touch targets:** hamburger is `h-10 w-10` (40px) — under the 44px practical minimum for gloved factory-floor use. Sidebar nav links are already `px-4 py-3` with a 20px icon ≈ 44px — fine, leave them.

**CRITICAL — proxy blocks PWA assets.** `proxy.ts` matcher is
`"/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|trt-logo.webp).*)"`,
so `/sw.js`, `/manifest.webmanifest`, `/offline`, `/icons/*`, `/apple-icon*` all run through NextAuth. `auth.config.ts`'s `authorized()` treats only `/sign-in /sign-up /reset-password /verify-email /tab-session/restore /` as public and returns `false` otherwise → **302 to /sign-in**. Signed out, the SW script would be served as HTML (registration dies on a MIME error) and the manifest would 302 (install prompt never appears). The matcher must be widened.

**Tooling available:** `sharp@0.34.5` is already resolvable in `node_modules` (vendored by Next for image optimization) — icons can be rasterized with **zero new runtime dependencies**. `tsx` is available and `scripts/*.ts` + a `package.json` script is the established pattern in this repo. Vitest config: `environment: 'node'`, `globals: true`, include `tests/**/*.test.{ts,tsx}`, alias `@` → repo root. Current green baseline: **561 passed + 1 todo**.
</investigation_findings>

<tasks>

<task type="auto">
  <name>Task 1: Manifest, icon set, and PWA route exposure</name>
  <files>scripts/generate-pwa-icons.ts, public/icons/icon-192.png, public/icons/icon-512.png, public/icons/icon-maskable-512.png, app/apple-icon.png, app/manifest.ts, app/layout.tsx, proxy.ts, package.json, tests/app/manifest.test.ts</files>
  <action>
Create the PWA metadata layer. Four pieces, in order.

(a) `scripts/generate-pwa-icons.ts` — a one-shot rasterizer, following the existing `scripts/*.ts` + tsx convention. Import `sharp` (already resolvable at 0.34.5 via Next; do NOT add it to `dependencies`). Read `app/icon.svg` and emit four PNGs with `sharp(buffer, { density: 384 })` so the 40x40 viewBox upscales without blur:
  - `public/icons/icon-192.png` — 192x192, transparent background, no padding.
  - `public/icons/icon-512.png` — 512x512, transparent background, no padding.
  - `public/icons/icon-maskable-512.png` — 512x512 with the mark scaled to 410px (80%) and centred on an opaque `#9d4300` background, so Android's maskable safe zone cannot clip the mark. Use `sharp().resize(410,410).extend({top:51,bottom:51,left:51,right:51,background:'#9d4300'})` or `.flatten({background:'#9d4300'})` + composite — either is fine, the invariant is 512x512, fully opaque, mark within the inner 80%.
  - `app/apple-icon.png` — 180x180, flattened onto opaque `#9d4300` (iOS does not honour transparency and renders it black). Next's `apple-icon` file convention auto-emits `<link rel="apple-touch-icon">` — do NOT hand-write that link tag.
Add `"pwa:icons": "tsx scripts/generate-pwa-icons.ts"` to `package.json` scripts, run it once, and commit the generated PNGs (they are build inputs, not build output).

(b) `app/manifest.ts` — export default a `MetadataRoute.Manifest` (import the type from `next`), per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`. Values, sourced from `app/globals.css` tokens:
  `name: 'TRT Arredo — Project Management'`, `short_name: 'TRT PM'`,
  `description: 'Industrial precision in architectural logistics.'`,
  `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, `orientation: 'any'`,
  `theme_color: '#9d4300'` (= `--color-primary`), `background_color: '#f8f9ff'` (= light `--color-background`),
  `icons`: the three generated PNGs — 192 `purpose: 'any'`, 512 `purpose: 'any'`, maskable-512 `purpose: 'maskable'`, each with `type: 'image/png'` and the correct `sizes`.
  `orientation: 'any'` is deliberate: PMs rotate tablets between portrait form-filling and landscape review — do not lock it.

(c) `app/layout.tsx` — add `export const viewport: Viewport` (import `type { Viewport } from 'next'`) with `width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`, and a `themeColor` array of two entries: `{ media: '(prefers-color-scheme: light)', color: '#f8f9ff' }` and `{ media: '(prefers-color-scheme: dark)', color: '#14181f' }` so the standalone status bar matches the app's own theme toggle. Do NOT set `maximumScale`/`userScalable: false` — pinch-zoom is an accessibility affordance and this is a production tool used by people reading small checklist text on a factory floor. Also add `appleWebApp: { capable: true, title: 'TRT PM', statusBarStyle: 'default' }` to the existing `metadata` export for the iOS standalone meta tags. Then verify Next auto-injects the manifest link: after building, grep the rendered HTML for `rel="manifest"` — if it is absent, add `manifest: '/manifest.webmanifest'` to the `metadata` export; if present, do not add it (redundant duplicate link).

(d) `proxy.ts` — widen the negative lookahead so the PWA assets bypass NextAuth entirely. New matcher:
  `"/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|trt-logo.webp|manifest.webmanifest|sw.js|offline|icons/).*)"`
  `sw.js` and `offline` are included now even though they land in Task 2 — one matcher edit, not two. Leave `auth.config.ts` untouched; the matcher is the correct layer because these assets carry no session data.

(e) `tests/app/manifest.test.ts` — import the default export from `@/app/manifest` and assert the installability contract: `display === 'standalone'`, `start_url` and `scope` both `'/'`, `name`/`short_name` non-empty and `short_name.length <= 12`, `theme_color`/`background_color` match `/^#[0-9a-f]{6}$/i`, icons include at least one 192x192 and one 512x512 with `purpose` containing `any`, and at least one entry with `purpose` containing `maskable`. Also assert every icon `src` resolves to a file that exists on disk (`node:fs.existsSync(path.join(process.cwd(),'public',src))`) — this catches a renamed or ungenerated PNG.
  </action>
  <verify>
    <automated>npx tsx scripts/generate-pwa-icons.ts && npx vitest run tests/app/manifest.test.ts && node -e "const s=require('sharp');Promise.all([['public/icons/icon-192.png',192],['public/icons/icon-512.png',512],['public/icons/icon-maskable-512.png',512],['app/apple-icon.png',180]].map(async([f,n])=>{const m=await s(f).metadata();if(m.width!==n||m.height!==n)throw new Error(f+' is '+m.width+'x'+m.height+', expected '+n);if(f.includes('maskable')&&m.hasAlpha&&!(await s(f).stats()).isOpaque)throw new Error('maskable icon must be opaque')})).then(()=>console.log('icons OK'))" && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>Running `npm run pwa:icons` produces four correctly-sized PNGs (maskable one opaque); `app/manifest.ts` passes the installability contract test; `proxy.ts` matcher excludes manifest/sw/offline/icons/apple-icon; tsc and lint clean.</done>
</task>

<task type="auto">
  <name>Task 2: Minimal hand-written service worker with a no-user-data cache policy</name>
  <files>public/sw.js, app/_components/service-worker-register.tsx, app/offline/page.tsx, app/layout.tsx, next.config.ts, tests/app/service-worker.test.ts</files>
  <action>
Write the service worker by hand — no `next-pwa`, no `workbox`. Rationale to record in the SUMMARY: both libraries default to precaching and runtime-caching *navigations*, which is exactly the behaviour that is unsafe here. This app is a system of record where every `(app)` route is server-rendered with the signed-in user's own data, and tablets are shared between PMs on a shift. A generic caching library would have to be configured almost entirely in denial mode, so a ~70-line hand-written SW with an explicit allowlist is both smaller and auditable. No new dependency is added.

(a) `public/sw.js` — plain JS (not a module). Structure:
  - `const CACHE_VERSION = 'trt-pm-v1'` and `const STATIC_CACHE = CACHE_VERSION + '-static'`.
  - `install`: `event.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(['/offline'])))` then `self.skipWaiting()`. Precache **only** `/offline` — nothing else, because nothing else is both static and user-agnostic.
  - `activate`: delete every cache key that does not start with `CACHE_VERSION`, then `self.clients.claim()`. This is what prevents a stale SW from pinning a previous deploy's chunks.
  - `fetch`: an **allowlist**, not a denylist. Bail out (return without calling `respondWith`, leaving the request to the network untouched) for every one of these, checked in this order:
      1. `request.method !== 'GET'`
      2. `url.origin !== self.location.origin`
      3. `url.pathname.startsWith('/api/')`
      4. `request.headers.get('RSC') || request.headers.get('Next-Router-Prefetch') || url.searchParams.has('_rsc')` — Next 16 RSC payload requests carry the signed-in user's rendered data
      5. `request.mode === 'navigate'` is handled separately (see below), not cached
    Only then, cache-first for the immutable allowlist: `url.pathname.startsWith('/_next/static/')`, `url.pathname.startsWith('/icons/')`, or pathname in `['/manifest.webmanifest','/favicon.ico','/icon.svg','/trt-logo.webp']`. These are content-hashed or static brand assets. On a cache miss, fetch, and put a clone into `STATIC_CACHE` **only when `response.ok && response.status === 200 && response.type !== 'opaque'`**.
    For `request.mode === 'navigate'`: network-only with an offline fallback — `event.respondWith(fetch(request).catch(() => caches.match('/offline')))`. Never write the navigation response to a cache.
  - Add a top-of-file comment block stating the invariant in plain English: *"This service worker must never cache HTML, RSC payloads, or /api responses. Tablets are shared between PMs and every app route renders the signed-in user's own data."*

(b) `app/offline/page.tsx` — a static server component under `app/offline/` (deliberately OUTSIDE the `(app)` route group, so it inherits no auth layout and reads no session). Plain markup only: TRT wordmark, "You're offline", a line explaining that project data cannot be loaded without a connection and nothing was lost, and a `<button>`-free hint to retry. It must import nothing from `@/lib/dal`, `@/db`, or `next-auth` — assert this in the test below. Add `export const dynamic = 'force-static'`.

(c) `app/_components/service-worker-register.tsx` — a `'use client'` component with a `useEffect` that:
  - returns early if `!('serviceWorker' in navigator)`;
  - when `process.env.NODE_ENV === 'production'`, calls `navigator.serviceWorker.register('/sw.js', { scope: '/' })` and swallows failures with a non-secret `console.warn` (registration failing must never break the app);
  - **otherwise (dev), actively unregisters** every existing registration and deletes every cache key. `npm run dev` uses `--webpack`, and a leftover SW from a local production build would serve stale hashed chunks and break HMR. This cleanup is the guard.
  Render `null`. Mount it in `app/layout.tsx` inside `<body>`, alongside `TabSessionProvider` (it must not wrap children).

(d) `next.config.ts` — add a second entry to the existing `headers()` array (do not touch the existing Permissions-Policy entry) for `source: '/sw.js'` with `Cache-Control: public, max-age=0, must-revalidate`. Netlify would otherwise serve `public/` assets with a long-lived cache and a bad SW could survive a deploy.

(e) `tests/app/service-worker.test.ts` — a real behavioural test of the shipped file, not a text grep. Read `public/sw.js` with `node:fs`, run it via `node:vm` in a context supplying: a fake `self` (an object with `addEventListener` capturing handlers by type, `skipWaiting`, `clients.claim`, `location: { origin: 'https://app.example' }`), a stubbed `caches` (`open`/`match`/`keys`/`delete` backed by a Map), Node's global `Request`/`Response`/`URL`, and a `fetch` spy. Grab the captured `fetch` handler and drive it with synthetic events (`{ request, respondWith: vi.fn(), waitUntil: vi.fn() }`). Assert:
    1. `POST https://app.example/api/checklists` → `respondWith` NOT called (passthrough).
    2. `GET https://app.example/api/projects` → `respondWith` NOT called.
    3. `GET https://app.example/dashboard` with header `RSC: 1` → `respondWith` NOT called.
    4. `GET https://app.example/dashboard` with `mode: 'navigate'`, network resolving OK → `respondWith` called, resolves to the network response, and the `caches` stub recorded **zero** `put` calls.
    5. Same navigation with `fetch` rejecting → resolves to the precached `/offline` response.
    6. `GET https://app.example/_next/static/chunks/abc.js` with the cache pre-populated → resolves from cache and the `fetch` spy was NOT called.
    7. `GET https://app.example/_next/static/chunks/new.js` cache-empty → fetches and records exactly one `put`.
    8. Cross-origin `GET https://fonts.googleapis.com/css2` → `respondWith` NOT called.
  Add a ninth assertion in the same file guarding the offline page: read `app/offline/page.tsx` as text and assert it matches none of `/@\/lib\/dal|@\/db|next-auth/`.
  </action>
  <verify>
    <automated>npx vitest run tests/app/service-worker.test.ts && npx tsc --noEmit && npm run lint && grep -v '^ *\*' public/sw.js | grep -v '^ *//' | grep -cE "respondWith" | { read n; [ "$n" -ge 1 ] || { echo "sw.js has no respondWith outside comments"; exit 1; }; echo "sw.js fetch handler present"; }</automated>
  </verify>
  <done>All eight SW behaviour assertions pass against the real `public/sw.js`; `/offline` imports no session/DB module; registration is production-gated with a dev unregister path; `/sw.js` is served must-revalidate; tsc and lint clean.</done>
</task>

<task type="auto">
  <name>Task 3: Close the tablet nav dead zone and enlarge touch targets</name>
  <files>app/(app)/layout.tsx, app/_components/mobile-sidebar.tsx, tests/app/nav-breakpoints.test.ts</files>
  <action>
Move the nav breakpoint triad from `md` (768px) to `lg` (1024px) so the entire 768-1023px tablet band gets the drawer instead of a crushed sidebar with no hamburger. Change exactly these three class strings and nothing else:

  1. `app/(app)/layout.tsx:84` — `<aside>`: `md:flex` → `lg:flex`.
  2. `app/(app)/layout.tsx:124` — main canvas wrapper: `md:pl-72` → `lg:pl-72`.
  3. `app/_components/mobile-sidebar.tsx:24` — wrapper `<div>`: `md:hidden` → `lg:hidden`.

All three must move together. Leaving `md:pl-72` behind while the sidebar moves to `lg` produces a 288px empty gutter with no sidebar in it — the mirror image of the current bug.

Do NOT touch the cosmetic `md:h-20` / `md:px-margin-desktop` on the brand block, header, and `<main>` (lines 86, 89, 125, 150). Those are padding/height only, independent of sidebar presence, and switching them would shrink the header at tablet widths for no reason.

Do NOT touch `app/_components/chat-drawer.tsx` (779, 818, 843, 874) or `app/_components/paul-arredo.tsx` (274, 333). Those `hidden md:flex` / `md:hidden` pairs are exact complements *inside full-screen overlays*, so they have no dead zone. They are explicitly out of scope for this task.

Touch targets, for gloved factory-floor use:
  - `mobile-sidebar.tsx` hamburger button: `h-10 w-10` → `h-11 w-11` (40px → 44px).
  - Same file, the drawer scrim `<button>`: leave as-is (full-bleed).
  - Sidebar nav links (`sidebar-nav.tsx`, `px-4 py-3` + 20px icon ≈ 44px) already clear the bar — do not modify that file.

Then write `tests/app/nav-breakpoints.test.ts` — the regression guard that would have caught this bug. Read `app/(app)/layout.tsx` and `app/_components/mobile-sidebar.tsx` as text and assert:
  - Extract the breakpoint prefix from the `<aside>` visibility utility (regex for `(sm|md|lg|xl|2xl):flex` on the line that also contains `w-72` and `hidden`), from the main-canvas padding (`(sm|md|lg|xl|2xl):pl-72`), and from the mobile-sidebar wrapper (`(sm|md|lg|xl|2xl):hidden`).
  - Assert all three are found (a null match must fail loudly, not silently pass).
  - Assert all three prefixes are **identical** — this is the dead-zone invariant: the width at which the sidebar appears must be exactly the width at which the hamburger disappears and exactly the width at which the content gutter opens.
  - Assert the shared prefix is `lg`, with a comment explaining the choice (tablets report 768-1023px CSS widths; a 288px sidebar there leaves under 512px of content).
  - Assert the aside still carries a bare `hidden` (so it is hidden by default below the breakpoint) and that the hamburger button's classes match `/h-11 w-11/`.
  </action>
  <verify>
    <automated>npx vitest run tests/app/nav-breakpoints.test.ts && npx tsc --noEmit && npm run lint && grep -cE "md:(flex|pl-72|hidden)" "app/(app)/layout.tsx" app/_components/mobile-sidebar.tsx | grep -q ":0$" && echo "no md: nav utilities remain" || (echo "stale md: nav utility found"; exit 1)</automated>
  </verify>
  <done>The sidebar/gutter/hamburger triad all read `lg:`; the invariant test passes and fails loudly if any one of the three drifts; the hamburger is 44px; chat-drawer and paul-arredo are untouched (`git diff --stat` lists neither).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Human verification on tablet widths and a real production build</name>
  <action>Run the production build, then walk the human through sections A-D below and block until they respond. Do not self-approve: the nav dead zone and the cache-contents check both require a real browser at real viewport widths, and the multi-user staleness check requires two real sign-ins.</action>
  <what-built>
Installable PWA (manifest + icon set + hand-written service worker + `/offline` fallback + proxy exclusions) and the tablet nav fix (sidebar/gutter/hamburger triad moved 768px → 1024px, hamburger enlarged to 44px). Three new vitest suites cover the manifest installability contract, the service worker's cache policy, and the nav breakpoint invariant.
  </what-built>
  <how-to-verify>
The service worker only registers in production, so this must be a production build.

```
npm run build && PORT=3011 npm start
```

**A. Nav dead zone — the reported bug.** Open `http://localhost:3011`, sign in as any role, then open DevTools device toolbar and step through these widths, checking each one: **375, 767, 768, 800, 834, 1023, 1024, 1280**.
   1. At 375-1023: the hamburger is visible in the header, the sidebar is absent, and there is **no empty left gutter**.
   2. At 1024 and 1280: the persistent sidebar is visible and there is **no hamburger**.
   3. There must be **no width where neither appears**, and none where both appear.
   4. At 800px, tap the hamburger → drawer slides in → tap a nav link → it navigates AND the drawer closes.
   5. Repeat step 1-4 signed in as **Factory PM, Site PM, and Super Admin** — each role renders a different `SidebarNav` item set, so confirm the drawer scrolls and every item is reachable for the role with the longest nav.
   6. If a real Samsung tablet is on hand, load the dev server over the LAN in both portrait and landscape and confirm the hamburger is tappable with a fingertip (not a stylus).

**B. Installability.** In Chrome DevTools → Application → Manifest: no errors, icons render, "Installable" shows no warnings. Then Application → Service Workers: `sw.js` is **activated and running**. Use the browser's install affordance (address-bar icon / ⋮ → "Install") and confirm the app launches in its own window with **no browser URL bar** and the TRT orange icon.

**C. The data-staleness guard — most important check.** With the SW active:
   1. Application → Service Workers → check **"Offline"**, then navigate to any project route → the `/offline` page renders (not the browser's dinosaur/error page).
   2. Uncheck Offline. Application → Cache Storage → open `trt-pm-v1-static`. Confirm it contains **only** `/offline` and `/_next/static/...` entries — **no HTML page, no `/api/...`, no `?_rsc=` entry**. If any app route or API URL appears here, stop and report it.
   3. Sign out, sign in as a **different** user, and confirm the header, sidebar name, and dashboard show the *second* user's identity and data — not a cached view of the first.
   4. While signed out, hit `http://localhost:3011/sw.js` and `http://localhost:3011/manifest.webmanifest` directly — both must return their real content, **not** a redirect to `/sign-in`.

**D. Regression.** `npm test` — expect the 561-passed baseline plus the new suites, still 0 failures.
  </how-to-verify>
  <resume-signal>Type "approved" or describe which check failed (include the width for A, or the offending cache entry for C).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| service worker → browser cache | The SW is a persistent interception layer that outlives a page load and a sign-out; anything it caches is readable by the *next* person to use the device |
| shared tablet → multiple PM identities | One physical Samsung tablet is used by different PMs across shifts; the browser profile is shared |
| public internet → proxy-excluded routes | Paths removed from the `proxy.ts` matcher are served with no auth check |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kyw-01 | Information Disclosure | `public/sw.js` cache policy | mitigate | Allowlist-only caching. Non-GET, cross-origin, `/api/*`, RSC-header/`_rsc` requests, and `mode === 'navigate'` responses are never written to cache. Enforced by 8 behavioural assertions in `tests/app/service-worker.test.ts` driving the real shipped file, not by code review. |
| T-kyw-02 | Information Disclosure | `app/offline/page.tsx` | mitigate | Precached and therefore readable by any user of the device. Placed outside the `(app)` route group, `force-static`, renders zero session data; test asserts it imports none of `@/lib/dal`, `@/db`, `next-auth`. |
| T-kyw-03 | Tampering | SW update lifecycle | mitigate | `skipWaiting()` + `clients.claim()` + activate-time purge of every cache key not prefixed `trt-pm-v1`, plus `Cache-Control: public, max-age=0, must-revalidate` on `/sw.js` via `next.config.ts`. Prevents a stale SW pinning a prior deploy's chunks against new HTML. |
| T-kyw-04 | Information Disclosure | `proxy.ts` matcher widening | accept | `sw.js`, `manifest.webmanifest`, `offline`, `icons/`, `apple-icon` become world-readable. All are static brand/config assets containing no user, project, or session data — the manifest exposes only the app name and colors, which are already on the public sign-in page. Task 2(e) test enforces that `/offline` stays session-free, which is the only member of this set that could regress into carrying data. |
| T-kyw-05 | Denial of Service | SW caching a mutation response | mitigate | `request.method !== 'GET'` is the first bail-out in the fetch handler; asserted directly (assertion 1). A cached POST response to a checklist submission would corrupt the system of record. |
| T-kyw-06 | Elevation of Privilege | Dev-machine leftover SW | mitigate | `service-worker-register.tsx` actively unregisters all registrations and clears all caches when `NODE_ENV !== 'production'`, so a locally-run production build cannot leave a SW intercepting `npm run dev`. |
| T-kyw-SC | Tampering | npm installs | mitigate | **No packages are installed by this plan.** `sharp@0.34.5` is already resolvable in `node_modules` (vendored by Next for image optimization) and is used only by a dev-time script; it is not added to `dependencies`. No `next-pwa`/`workbox` dependency is introduced — the SW is hand-written, which is also why the package legitimacy gate does not apply here. |
</threat_model>

<verification>
- `npm run build` succeeds (a broken `app/manifest.ts` or `app/offline/page.tsx` fails the build).
- `npx tsc --noEmit` clean.
- `npm run lint` clean — no new errors. Note the pre-existing warning baseline (5 warnings: 4 pre-existing + 1 from `send-call-reminders.mts`); do not "fix" unrelated warnings.
- `npm test` — 561-passed baseline plus the three new suites, 0 failures.
- `git diff --stat` lists neither `app/_components/chat-drawer.tsx` nor `app/_components/paul-arredo.tsx` nor `app/_components/sidebar-nav.tsx` (explicitly out of scope).
- `git diff --stat` lists neither `auth.config.ts` nor `app/globals.css` — the proxy matcher, not the auth callback, is the layer that changed, and Tailwind's default breakpoints are used as-is.
</verification>

<success_criteria>
- At every viewport width from 320px to 2560px, exactly one nav affordance is present — hamburger below 1024px, persistent sidebar at 1024px and above; verified at the eight widths in the checkpoint across all three role dashboards.
- The hamburger opens a drawer at tablet widths (768-1023px), where it previously did not render at all, and its hit area is ≥44px.
- The app passes Chrome's installability check and launches standalone from the home screen with the TRT icon.
- Chrome's Cache Storage for `trt-pm-v1-static` contains only `/offline` and `/_next/static/*` — zero HTML, API, or RSC entries — confirmed by human inspection AND by eight automated assertions against the real `public/sw.js`.
- Signing out and signing in as a second user on the same browser profile shows the second user's data everywhere.
- `/sw.js` and `/manifest.webmanifest` return real content while signed out.
- Navigating with the network offline renders `/offline` rather than a browser error page.
</success_criteria>

<output>
Create `.planning/quick/260905-kyw-pwa-setup-and-tablet-responsive-nav-fix/260905-kyw-SUMMARY.md` when done.

The SUMMARY must record: (1) the confirmed root cause of the tablet nav bug (the `md`-breakpoint triad, with the three exact file:line locations); (2) the decision to hand-write the SW instead of adopting `next-pwa`/`workbox`, with the shared-tablet-staleness rationale; (3) whether Next 16 auto-injected `<link rel="manifest">` or whether an explicit `metadata.manifest` was needed; (4) the final test count vs. the 561 baseline.
</output>
