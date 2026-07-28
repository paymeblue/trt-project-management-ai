---
phase: quick-260728-vpm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/media-permission.ts
  - lib/media-permission.test.ts
  - app/_components/video-call-room.tsx
  - next.config.ts
autonomous: true
requirements: [VPM-01, VPM-02, VPM-03, VPM-04, VPM-05]

must_haves:
  truths:
    - "A user whose camera/mic enable fails sees the ACTUAL cause (blocked / no device / device busy / insecure origin), not a single generic 'blocked for this site' message"
    - "A user can click one button in the banner to re-request camera+mic without reloading the page and without leaving the call"
    - "When permission state is 'prompt', that button actually re-triggers the browser permission prompt (it fires on a real user gesture)"
    - "A user on a non-secure origin (http on a LAN IP) is told the real fix (https or localhost), not to check site permissions"
    - "A denied camera still allows audio participation; a denied mic still allows listen/view-only — the user is never dead-ended"
    - "Camera+mic are still enabled automatically on join when permission is already granted (no regression of the Zoom-like behavior)"
    - "The app serves Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)"
  artifacts:
    - path: "lib/media-permission.ts"
      provides: "Pure error-name + permission-state to user-facing failure classification"
      exports: ["classifyMediaFailure", "mergeMediaFailures", "queryMediaPermissionState"]
    - path: "lib/media-permission.test.ts"
      provides: "Unit coverage of every classification branch and the merge/degradation copy"
    - path: "app/_components/video-call-room.tsx"
      provides: "In-place retry banner + secure-context guard wired to the classifier"
      contains: "classifyMediaFailure"
    - path: "next.config.ts"
      provides: "async headers() emitting Permissions-Policy"
      contains: "Permissions-Policy"
  key_links:
    - from: "app/_components/video-call-room.tsx"
      to: "lib/media-permission.ts"
      via: "import { classifyMediaFailure, mergeMediaFailures, queryMediaPermissionState }"
      pattern: "from '@/lib/media-permission'"
    - from: "app/_components/video-call-room.tsx"
      to: "call.camera.enable() / call.microphone.enable()"
      via: "shared enableMedia(kind) used by BOTH the post-join auto-enable and the banner retry button"
      pattern: "enableMedia\\('(camera|microphone)'\\)"
---

<objective>
Make camera/microphone failure in the video call room correctly diagnosed, recoverable in place, and never a dead end.

Purpose: today `video-call-room.tsx` catches every `call.camera.enable()` / `call.microphone.enable()` rejection identically and renders one banner telling the user to fix site permissions and RELOAD THE PAGE — which drops them out of the call. That message is wrong for the three most common real causes (no device attached, device already held by Zoom/Teams/another tab, page served over plain http on a LAN IP) and unnecessary for the most common recoverable one (state is `prompt`, not `denied` — it just needs re-requesting on a user gesture).

HARD LIMIT — must be stated honestly in the SUMMARY and must NOT be worked around: a web page CANNOT force-grant, auto-enable, or otherwise override camera/microphone permission. Once a user, an enterprise policy, or the OS has blocked it, only the user can restore it via browser/OS settings. No JavaScript can bypass that, by design. What this task delivers is (a) maximising the grant rate by re-requesting on an explicit user gesture, (b) turning recovery from "reload and lose the call" into one in-call click, and (c) telling the truth about which of the four causes actually applies. Do not add any code that pretends otherwise.

Output: a pure, unit-tested classifier in `lib/media-permission.ts`; a rewritten banner + retry path in `video-call-room.tsx`; an explicit self-allow `Permissions-Policy` header.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md
@app/_components/video-call-room.tsx
@next.config.ts
@lib/position-slug.test.ts

Repo facts already verified — do NOT re-investigate:
- `video-call-room.tsx:98-99` calls `call.camera.enable()` / `call.microphone.enable()` after `join()` resolves, each `.catch()` only flipping a boolean into `mediaBlocked`. The two enables are already independent (a dead camera cannot block the mic) — PRESERVE that isolation exactly.
- The banner at `video-call-room.tsx:227-237` is the thing being replaced.
- There is currently NO `navigator.permissions.query` usage, NO `error.name` discrimination, and NO `window.isSecureContext` check anywhere in this component.
- `next.config.ts` and `netlify.toml` set NO `Permissions-Policy` today (grep-confirmed). The call UI uses no iframe, so the missing header is not the current cause — it is cheap insurance against a CDN/proxy default behind Netlify.
- `CallControls` from `@stream-io/video-react-sdk` renders a `ScreenShareButton` (confirmed in `node_modules/@stream-io/video-react-sdk/dist/index.cjs.js:1191`), so `display-capture=(self)` genuinely belongs in the header.
- Tests: vitest, `environment: 'node'`, `include` already covers `lib/**/*.test.ts`. Pure-helper test style to mirror: `lib/position-slug.test.ts`.
- Baseline suite is ~337+ and RISING (other quick tasks in flight). Assert "no regressions / all green", never an exact count.

<interfaces>
Existing shape being replaced in video-call-room.tsx:

    const [mediaBlocked, setMediaBlocked] = useState<{ camera: boolean; microphone: boolean }>({
      camera: false,
      microphone: false,
    })

GetStream SDK surface available (verified against the installed type defs):

    call.camera.enable(): Promise<void>       // rejects with a DOMException-shaped error
    call.microphone.enable(): Promise<void>
    call.camera.state.browserPermissionState$ // rxjs Observable<PermissionState | 'prompting'> — EXISTS but is
                                              // undocumented internal surface; do NOT depend on it. Use the
                                              // feature-detected navigator.permissions.query probe instead.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure media-failure classifier + unit tests</name>
  <files>lib/media-permission.ts, lib/media-permission.test.ts</files>
  <behavior>
    `classifyMediaFailure(input, kind)` where
    `input = { errorName?: string; permissionState?: 'granted' | 'denied' | 'prompt' | 'prompting' | 'unsupported'; isSecureContext: boolean; hasMediaDevices: boolean }`
    and `kind: 'camera' | 'microphone'`, returning
    `{ kind, cause, title, detail, canRetryInPlace, needsUserSettingsChange }`.

    Precedence is strict and top-down (each test asserts the higher rule wins over a conflicting lower one):
    - Test 1: `isSecureContext: false` returns cause `insecure_context` EVEN WHEN `errorName: 'NotAllowedError'` and `permissionState: 'denied'` — an insecure origin makes every other signal untrustworthy. `canRetryInPlace: false`, `needsUserSettingsChange: false`. Detail names the real fix (https, or http://localhost — a LAN IP over plain http can never work).
    - Test 2: secure context but `hasMediaDevices: false` returns cause `unsupported`, `canRetryInPlace: false`.
    - Test 3: `errorName: 'SecurityError'` returns cause `insecure_context` (getUserMedia raises it precisely for non-secure/policy-blocked origins), even in a nominally secure context.
    - Test 4: `errorName: 'NotFoundError'` (and `'OverconstrainedError'`) returns cause `no_device` — "no camera detected" / "no microphone detected", `needsUserSettingsChange: false`, `canRetryInPlace: true` (plug one in, then retry).
    - Test 5: `errorName: 'NotReadableError'` and `errorName: 'AbortError'` both return cause `device_busy` — detail must name the actual culprit class (another app such as Zoom/Teams, or another browser tab, already holds the device). `canRetryInPlace: true`.
    - Test 6: `errorName: 'NotAllowedError'` with `permissionState: 'denied'` returns cause `permission_denied`, `needsUserSettingsChange: true`, `canRetryInPlace: true` (fix in browser settings, THEN retry in place — no reload).
    - Test 7: `errorName: 'NotAllowedError'` with `permissionState: 'prompt'` — and separately with `'prompting'`, `'unsupported'`, and `undefined` — returns cause `permission_prompt`, `needsUserSettingsChange: false`, `canRetryInPlace: true`. This is the case the retry button actually re-prompts for.
    - Test 8: an unrecognised `errorName` (e.g. `'TypeError'`) and a missing `errorName` both return cause `unknown` with `canRetryInPlace: true` — never dead-end on an error we did not anticipate.
    - Test 9: every returned `cause` maps to a non-empty `title` and non-empty `detail` (loop over all causes) — no branch can render an empty banner.
    - Test 10: `mergeMediaFailures(camera, microphone)` with the SAME cause on both returns ONE line naming "Camera and microphone"; with DIFFERENT causes returns TWO lines, one per device.
    - Test 11: `mergeMediaFailures` degradation copy — camera-only failure states audio participation still works; microphone-only failure states listening/viewing still works; both-failed states the user can still see and hear others. No branch may omit the degradation sentence.
    - Test 12: `mergeMediaFailures(null, null)` returns `null` (banner renders nothing).
    - Test 13: `mergeMediaFailures` sets `canRetryInPlace: true` if EITHER device is retryable, and `false` only when neither is.
  </behavior>
  <action>
    Create `lib/media-permission.ts` exporting:
    - `MediaKind` = 'camera' | 'microphone'
    - `MediaPermissionState` = 'granted' | 'denied' | 'prompt' | 'prompting' | 'unsupported'
    - `MediaFailureCause` = 'insecure_context' | 'unsupported' | 'no_device' | 'device_busy' | 'permission_denied' | 'permission_prompt' | 'unknown'
    - `MediaFailure` = { kind, cause, title, detail, canRetryInPlace, needsUserSettingsChange }
    - `classifyMediaFailure(input, kind): MediaFailure` — PURE, no `window`/`navigator` access whatsoever (every environment fact arrives as an argument; that is what makes it testable under vitest's `environment: 'node'`).
    - `mergeMediaFailures(camera: MediaFailure | null, microphone: MediaFailure | null): { lines: string[]; canRetryInPlace: boolean; retryLabel: string } | null` — PURE. `retryLabel` reads "Enable camera & microphone" / "Enable camera" / "Enable microphone" per which devices failed.
    - `queryMediaPermissionState(kind: MediaKind): Promise<MediaPermissionState>` — the ONLY impure export, deliberately excluded from unit tests (say so in a comment). Feature-detect `navigator.permissions?.query` and wrap in try/catch returning `'unsupported'`: Firefox has no `'camera'` permission name and Safari's support is partial, so a bare call THROWS there and would otherwise turn a recoverable prompt state into an unhandled rejection. Pass a `'prompting'` value through unchanged.

    Copy requirements for `detail`, per cause (write real sentences, not placeholders):
    - `insecure_context`: camera and mic are only available on a secure origin; open the app over https or via http://localhost — a plain-http LAN address (http://192.168.x.x) can never be granted, and no site-permission setting will change that.
    - `unsupported`: this browser does not expose media devices at all; use a current Chrome/Edge/Safari/Firefox.
    - `no_device`: no camera/microphone was detected; connect one and check it is not disabled in OS settings, then retry.
    - `device_busy`: the device is already in use by another app (Zoom, Teams, Meet) or another browser tab; close it and retry.
    - `permission_denied`: access is blocked for this site; open the permission control in the address bar, set camera/microphone to Allow, then use the retry button — no reload needed.
    - `permission_prompt`: access has not been granted yet; click retry and choose Allow in the browser prompt.
    - `unknown`: could not start the device; retry, and if it persists check the browser's site settings.

    Dense why-comments at each non-obvious branch, referencing quick task 260728-vpm — in particular WHY `insecure_context` outranks `NotAllowedError` (a LAN-IP http origin produces a permission-shaped rejection with an unfixable cause, which is exactly the misdiagnosis this task exists to kill) and WHY `permission_denied` still keeps `canRetryInPlace: true` (Chrome applies an address-bar permission change to the next getUserMedia call without a reload).

    Create `lib/media-permission.test.ts` mirroring `lib/position-slug.test.ts` style (`import { describe, it, expect } from 'vitest'`), covering every case in the behavior block. No jsdom pragma needed — the tested surface is pure.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run lib/media-permission.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>`lib/media-permission.ts` exists with the exports above; `npx vitest run lib/media-permission.test.ts` passes all 13 behaviors; `grep -n "window\.\|navigator\." lib/media-permission.ts` shows matches ONLY inside `queryMediaPermissionState` (proving the classifier is pure); tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Correct diagnosis, in-place retry, and secure-context guard in the call room</name>
  <files>app/_components/video-call-room.tsx</files>
  <action>
    Rewire `VideoCallRoom` (the outer component only — do NOT touch `CallRoomInner`, the join-timeout logic, fullscreen, copy-link, chat, or `endForEveryone`).

    1. Replace the `mediaBlocked` boolean state with
       `const [mediaFailures, setMediaFailures] = useState<{ camera: MediaFailure | null; microphone: MediaFailure | null }>({ camera: null, microphone: null })`,
       importing the types/functions from `@/lib/media-permission`.

    2. Add a `mountedRef` (`useRef(true)`, cleared in a mount-scoped `useEffect` cleanup). The enable path is async and can resolve after the user has already left the call; guard every `setMediaFailures` behind it. Comment why.

    3. Add a single shared `enableMedia = useCallback(async (kind: MediaKind) => { ... }, [call])` used by BOTH the post-join auto-enable and the banner retry button — one code path, so retry can never drift from the initial attempt:
       - Compute environment facts once at call time: `const isSecureContext = window.isSecureContext`, `const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia`.
       - If `!isSecureContext || !hasMediaDevices`, do NOT call `enable()` (it can only fail); classify immediately with `errorName: undefined` and record the failure. This is the guard that stops a plain-http LAN-IP test session from being told to "check site permissions".
       - Otherwise `await call.camera.enable()` / `await call.microphone.enable()` per `kind`. On success, clear that kind's failure (`setMediaFailures(s => ({ ...s, [kind]: null }))`) so a successful retry removes its own banner line.
       - On rejection: read `const errorName = err instanceof Error ? err.name : undefined` (DOMException is an Error subclass, so `.name` carries `NotAllowedError` / `NotFoundError` / `NotReadableError` / `AbortError`), `await queryMediaPermissionState(kind)`, then set `mediaFailures[kind]` to `classifyMediaFailure({ errorName, permissionState, isSecureContext, hasMediaDevices }, kind)`.
       - Prefer the SDK's `call.camera` / `call.microphone` APIs as the enable path (constraint: no raw `getUserMedia` re-implementation, no new dependencies). `navigator.permissions.query` is used only as a read-only diagnostic probe.

    4. In the existing join effect, replace lines 98-99 with `void enableMedia('camera')` and `void enableMedia('microphone')` — still two independent calls, never `Promise.all`, preserving both the existing "a denied camera must never block the mic" isolation AND the existing "video is on the moment you join, like Zoom" behavior for already-granted users (this is the zero-click path; do not gate it behind a permission query or a button). Add `enableMedia` to the effect's dep array and keep the effect's timeout/cleanup semantics otherwise byte-identical.

    5. Replace the banner at the current lines 227-237 entirely. Derive `const banner = mergeMediaFailures(mediaFailures.camera, mediaFailures.microphone)` and render only when non-null:
       - Render each `banner.lines` entry as its own paragraph — the whole point is that a busy camera and an unprompted mic no longer collapse into one wrong sentence.
       - When `banner.canRetryInPlace`, render a real `<button type="button">` labelled `banner.retryLabel` whose `onClick` re-invokes `enableMedia` for exactly the kinds currently failing. It must NOT reload, NOT navigate, and NOT leave the call. Track `const [retrying, setRetrying] = useState(false)`; disable the button and show "Requesting…" while in flight. A dense comment must record WHY this button matters: an explicit user gesture is both the only reliable way to re-trigger a `prompt`-state permission dialog and the highest-grant-rate moment to ask.
       - When `!banner.canRetryInPlace` (insecure context / unsupported browser), render no button — a retry there is guaranteed to fail and would be a lie.
       - Never instruct the user to reload the page anywhere in this banner. Removing that instruction is a required outcome of this task.
       - Keep the existing amber-warning styling (`rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800`), keep the banner in its current position in the tree, and use `&rsquo;` / `&amp;` entities consistently with the rest of the file. No emojis.

    6. Graceful degradation is a rendering requirement, not new logic: the degradation sentence comes from `mergeMediaFailures`, and no failure path may unmount `CallRoomInner`, block `<SpeakerLayout />` / `<CallControls />`, or early-return out of the call. A denied camera leaves audio-only participation working; a denied mic leaves listen/view-only working. Confirm by reading the final JSX that the banner is strictly additive.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && test "$(grep -v '^\s*//' app/_components/video-call-room.tsx | grep -c 'mediaBlocked')" -eq 0 && test "$(grep -v '^\s*//' app/_components/video-call-room.tsx | grep -ci 'reload th')" -eq 0 && grep -q "enableMedia('camera')" app/_components/video-call-room.tsx && grep -q "enableMedia('microphone')" app/_components/video-call-room.tsx && echo WIRED_OK</automated>
  </verify>
  <done>tsc + lint clean; no non-comment occurrence of `mediaBlocked` and no "reload this/the page" instruction remains; both `enableMedia('camera')` and `enableMedia('microphone')` are called (auto-enable path intact and independent); the retry button handler contains no `location.reload`, `router.push`, or `call.leave`.</done>
</task>

<task type="auto">
  <name>Task 3: Permissions-Policy self-allow header + full verification sweep</name>
  <files>next.config.ts</files>
  <action>
    Add an `async headers()` entry to `nextConfig` in `next.config.ts` (Next 16 requires the async function form; keep `experimental.authInterrupts` and `experimental.serverActions.bodySizeLimit` exactly as they are — do not reformat or reorder them):

    - `source: '/:path*'` with one header: key `Permissions-Policy`, value `camera=(self), microphone=(self), display-capture=(self)`.
    - `display-capture` is included because `CallControls` renders a screen-share button (verified in the installed SDK bundle).
    - Set ONLY these three directives. Do NOT add a restrictive catch-all for other features (geolocation, payment, etc.) — that is scope this task did not ask for and could silently break unrelated pages.
    - Dense why-comment referencing quick task 260728-vpm: this is defence-in-depth against a CDN/proxy (Netlify) emitting a default Permissions-Policy that strips camera/microphone from the document; the app uses no iframe, so it is not the current cause, but an explicit self-allow makes that failure mode impossible.

    Then run the full verification sweep, including live proof the header is actually served:
    - `npx tsc --noEmit`, `npm run lint`, `npm test` (assert all green / no regressions vs the ~337+ rising baseline — do NOT assert an exact count).
    - Start the dev server on a DEDICATED port in the background: `PORT=3011 npm run dev`. A concurrent live browser session may already own port 3000 — do NOT kill it, do NOT `pkill node`, do NOT use port 3000. Poll until it answers, then curl the response headers and confirm the directive string. Stop only the server you started, by its own PID.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm test && grep -q "Permissions-Policy" next.config.ts && grep -q "display-capture=(self)" next.config.ts && echo HEADER_CONFIGURED</automated>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && (PORT=3011 npm run dev > /tmp/vpm-dev.log 2>&1 & echo $! > /tmp/vpm-dev.pid); for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3011/ && break; done; curl -sI http://localhost:3011/ | grep -i 'permissions-policy' | grep -q 'camera=(self)' && echo HEADER_SERVED_OK; kill "$(cat /tmp/vpm-dev.pid)" 2>/dev/null</automated>
  </verify>
  <done>`next.config.ts` has an `async headers()` returning the three-directive Permissions-Policy for `/:path*`, existing `experimental` config untouched; tsc + lint + full suite green with no regressions; a live `curl -sI` against the dev server on port 3011 shows the header (HEADER_SERVED_OK); the port-3000 dev server, if any, was never touched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> OS media devices | Camera/mic access is gated by the browser + OS permission model; the page is untrusted relative to it |
| CDN/proxy (Netlify) -> browser | Response headers can be added or rewritten in transit, altering document capability policy |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vpm-01 | Elevation of Privilege | retry button / enableMedia | accept | No privilege is gained: the retry path only re-invokes the SDK's own `enable()`, which still goes through the browser permission prompt. A page cannot grant itself media access; this plan explicitly forbids any attempt to work around that (see objective). |
| T-vpm-02 | Tampering | Permissions-Policy header | mitigate | Emit an explicit `camera=(self), microphone=(self), display-capture=(self)` from `next.config.ts` so an upstream default cannot silently strip document capability; verified live via `curl -sI`. |
| T-vpm-03 | Information Disclosure | classifier detail copy | mitigate | `classifyMediaFailure` renders only fixed, hand-written sentences keyed by cause — the raw `error.message` is never interpolated into the DOM, so no device paths or driver strings leak into the UI. |
| T-vpm-04 | Denial of Service (self-inflicted) | banner retry loop | mitigate | Retry is user-gesture-only and disabled (`retrying`) while in flight; no automatic retry loop that could spam permission prompts. |
| T-vpm-SC | Tampering | package installs | mitigate | No new dependencies are added by this plan (hard constraint) — no supply-chain surface, no legitimacy gate needed. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean
- `npm run lint` clean
- `npm test` all green, no regressions vs the rising ~337+ baseline
- `npx vitest run lib/media-permission.test.ts` passes all 13 behaviors
- `curl -sI http://localhost:3011/ | grep -i permissions-policy` shows `camera=(self), microphone=(self), display-capture=(self)`
- Manual browser confirmation (deny camera in Chrome site settings, join a call, click the retry button, confirm no reload and the call survives) is NOT performed by this plan — the executor must say so explicitly in the SUMMARY and leave it to the orchestrator, per this repo's established "pending live browser verification" convention.
</verification>

<success_criteria>
- Every `enable()` rejection is classified by `error.name` + permission state into one of seven causes with distinct, correct copy — the single generic "blocked for this site" message is gone.
- A failing user can recover with ONE in-call click and no page reload; the word "reload" no longer appears in the media banner.
- A non-secure origin (http on a LAN IP) produces its own unmistakable message naming https/localhost as the fix, and shows no retry button.
- Camera and microphone failures remain fully independent; a failure of either never removes `SpeakerLayout`/`CallControls` or ends the call.
- Already-granted users still get camera+mic on automatically at join — zero extra clicks, no regression.
- `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)` is served and curl-proven.
- The SUMMARY states plainly that a web page cannot force-enable permission, and lists what was verified automatically vs what still needs a human browser check.
</success_criteria>

<output>
Create `.planning/quick/260728-vpm-video-permissions/260728-vpm-SUMMARY.md` when done
</output>
