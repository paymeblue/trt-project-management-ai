---
quick_id: 260905-kyw
status: complete
completed: 2026-09-05
---

# Quick Task 260905-kyw: PWA setup and tablet responsive nav fix — Summary

## Root cause (tablet nav dead zone)

Three class strings formed a breakpoint triad, all pinned at Tailwind's default `md` (768px), with Tailwind v4 defaults in force (no `--breakpoint-*` overrides in `app/globals.css`):

1. `app/(app)/layout.tsx:84` — `<aside className="... hidden w-72 ... md:flex">`
2. `app/(app)/layout.tsx:124` — main canvas wrapper `md:pl-72`
3. `app/_components/mobile-sidebar.tsx:24` — `md:hidden`

At a Samsung tablet's 768-1023px CSS viewport, `md:` fired: the hamburger disappeared **and** a 288px sidebar plus 288px `pl-72` gutter consumed ~36% of the screen — no working nav affordance existed in that range. Fix: moved all three to `lg:` (1024px) together, so the whole tablet band gets the drawer and the persistent sidebar only appears at ≥1024px. Hamburger enlarged `h-10 w-10` → `h-11 w-11` (40px → 44px) for gloved factory-floor use. `chat-drawer.tsx` and `paul-arredo.tsx` were confirmed out of scope (their `md:` pairs are exact complements inside full-screen overlays, no dead zone) and left untouched.

## PWA implementation

- `app/manifest.ts` — web app manifest (`display: standalone`, `orientation: any`, 192/512/maskable-512 icons, theme/background colors from the design tokens).
- Icon set generated via a one-shot `scripts/generate-pwa-icons.ts` (sharp, already vendored by Next — **no new dependency**) from the existing `app/icon.svg`.
- `public/sw.js` — **hand-written**, not `next-pwa`/`workbox`. Rationale: every `(app)` route is server-rendered with the signed-in user's own data, and tablets are shared across shifts; a generic caching library defaults to precaching/runtime-caching navigations, which would leak one PM's cached page to the next PM on the same device. The SW uses an explicit allowlist — non-GET, cross-origin, `/api/*`, RSC-header/`_rsc` requests, and all `mode:'navigate'` responses are never cached; only `/_next/static/*`, `/icons/*`, and a few static brand assets are cache-first. Navigations are network-only with a `/offline` fallback on fetch failure.
- `app/offline/page.tsx` — static, outside the `(app)` route group, imports no session/DB module.
- `app/_components/service-worker-register.tsx` — registers only in production; actively unregisters + clears caches in dev so a local production build never breaks `npm run dev`/HMR.
- `proxy.ts` matcher widened to exclude `sw.js`, `manifest.webmanifest`, `offline`, `icons/`, `apple-icon` from the NextAuth gate (these carry no session data; `auth.config.ts` itself was left untouched).
- Next 16 auto-injects `<link rel="manifest">` from `app/manifest.ts` — confirmed by inspecting the built HTML, so no explicit `metadata.manifest` was needed.

## Verification performed

**Automated (all green on the merged branch):**
- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 5 warnings (matches the pre-existing baseline; no new warnings introduced).
- `npm test` — **587 passed + 1 todo**, 0 failures (up from the 561 baseline; +3 new suites: `manifest.test.ts`, `service-worker.test.ts`, `nav-breakpoints.test.ts`).
- `npm run build` — succeeds; `/manifest.webmanifest`, `/offline`, `/apple-icon.png`, `/icon.svg` all present as static routes.

**Live browser verification (orchestrator, via agent-browser against a real `npm start` production build on port 3011), after merging the executor's worktree branch into `fix/readiness-text-answer-gate`:**
- Nav breakpoint matrix at all 8 widths (375/767/768/800/834/1023/1024/1280), for both **Factory PM** (`qa.factory@trtarredo.demo`) and **Super Admin** (`admin@trtarredo.com`, the longest nav with expandable groups): hamburger visible + sidebar absent + zero content-gutter below 1024px; persistent sidebar + no hamburger at ≥1024px. No width where neither or both nav affordances appeared.
- Drawer interaction at 800px: opened via hamburger, top-level and nested (expanded group) links both navigate and close the drawer, for both roles.
- Manifest + Service Worker: `<link rel="manifest">` resolves to `/manifest.webmanifest` with correct `name`/`display`/3 icons; SW registration active (`state: activated`).
- Cache Storage content: `trt-pm-v1-static` contains **only** `/offline` and `/_next/static/*` assets after normal browsing — zero HTML pages, zero `/api/*`, zero `_rsc` entries.
- Offline fallback: with the real dev server process killed (genuine network failure, not CDP-level emulation — CDP offline/route-abort do not reach a Service Worker's own fetch calls, which run in a separate execution context), navigating to a protected route rendered `/offline` ("You're offline...") instead of a browser error page. Server was restarted afterward.
- Signed-out asset access: `/sw.js` (200, `Cache-Control: public, max-age=0, must-revalidate`, `application/javascript`), `/manifest.webmanifest` (200), `/offline` (200), `/icons/icon-192.png` (200) all reachable without a session; `/admin/dashboard` still correctly redirects (307) when signed out.

**Not verified (requires physical hardware, out of scope for this session):** actual fingertip-tap confirmation on a real Samsung tablet device, and Chrome's install-affordance UI click-through (the three facts Chrome's installability check depends on — valid manifest, active SW, valid icon set — were all independently confirmed above).

## Process note

The executor ran in an isolated git worktree (`isolation: worktree`) and reached its Task 4 human-verify checkpoint with all 3 automated tasks committed (`97b280e`, `291a06c`, `570c0e2`). The orchestrator merged that worktree branch into `fix/readiness-text-answer-gate` (`--no-ff`) and removed the worktree per the standard cleanup flow; the executor's own uncommitted `SUMMARY.md` draft inside the worktree was lost in that removal (by design — quick-task executors are instructed not to commit docs artifacts) and has been reconstructed here from the executor's returned report plus the orchestrator's own live verification pass on the merged code.
