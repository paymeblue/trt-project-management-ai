---
phase: quick-260728-vpm
plan: 01
subsystem: video-calls
tags: [webrtc, permissions, getUserMedia, stream-video-sdk, media-devices]
requires: []
provides:
  - lib/media-permission.ts (classifyMediaFailure, mergeMediaFailures, queryMediaPermissionState)
affects:
  - app/_components/video-call-room.tsx
  - next.config.ts
tech-stack:
  added: []
  patterns:
    - "Pure classifier + impure probe split (classifyMediaFailure/mergeMediaFailures take zero window/navigator access; queryMediaPermissionState is the sole impure export) for vitest environment:'node' testability"
    - "Shared enableMedia() callback used by both the post-join auto-enable and the retry-button click handler so retry logic can never drift from initial-attempt logic"
    - "Sequenced, independently try/caught teardown (camera disable -> mic disable -> leave -> disconnectUser) so one failing step can never skip the next"
key-files:
  created:
    - lib/media-permission.ts
    - lib/media-permission.test.ts
  modified:
    - app/_components/video-call-room.tsx
    - next.config.ts
decisions:
  - "detail/title copy generators key off a plain-text label string ('camera' | 'microphone' | 'camera and microphone') rather than the MediaKind enum, so the merged same-cause banner line never falls back to one device's specific wording (e.g. never says 'set camera to Allow' when both devices are denied)"
  - "VPM-04 teardown release order is camera.disable(true) -> microphone.disable(true) -> call.leave() -> client.disconnectUser(), each independently try/caught, deliberately NOT chained on success so an earlier failure can't skip a later step"
  - "Tab-close exit path handled via a separate 'pagehide' listener (not the join effect's unmount cleanup), because a hard tab/browser close does not trigger a React unmount at all"
metrics:
  duration: ~55min
  completed: 2026-07-28
---

# Phase quick-260728-vpm Plan 01: Video call camera/mic permission diagnosis, in-place retry, and hardware release Summary

Replaced the video call room's single "blocked for this site, reload the page" media-failure message with a real seven-cause classifier and an in-place retry button, added a self-allow `Permissions-Policy` header, and fixed a live bug where the camera light stayed on after every call exit.

## What Was Built

**Task 1 — `lib/media-permission.ts` + `lib/media-permission.test.ts` (pure classifier).**
`classifyMediaFailure(input, kind)` maps `{ errorName, permissionState, isSecureContext, hasMediaDevices }` to one of seven causes (`insecure_context`, `unsupported`, `no_device`, `device_busy`, `permission_denied`, `permission_prompt`, `unknown`) with strict top-down precedence — an insecure/`SecurityError` origin always wins even over a `NotAllowedError`+`denied` combination, because a LAN-IP http origin produces a permission-shaped rejection with an unfixable cause. `mergeMediaFailures(camera, microphone)` combines both devices' failures into banner lines plus a mandatory "you can still participate" degradation sentence, and computes `canRetryInPlace`/`retryLabel`. `queryMediaPermissionState(kind)` is the sole impure export (feature-detects `navigator.permissions?.query`, catches Firefox/Safari's throw-on-unsupported-name behavior, returns `'unsupported'`) and is deliberately excluded from unit tests. 14 vitest cases cover all 13 required behaviors plus one extra (different-cause-per-device banner rendering).

**Task 2 — `app/_components/video-call-room.tsx` rewire.**
The `mediaBlocked: { camera: boolean; microphone: boolean }` state was replaced by `mediaFailures: { camera: MediaFailure | null; microphone: MediaFailure | null }`. A single `enableMedia(kind)` callback is now used both by the post-join auto-enable (unchanged zero-click "video is on the moment you join" behavior for already-granted users) and by the banner's retry button — one code path, so retry can never drift from the initial classification logic. `enableMedia` short-circuits to immediate classification (skipping `enable()` entirely) when `!window.isSecureContext || !navigator.mediaDevices?.getUserMedia`, which is exactly the guard that stops a plain-http LAN-IP session from being misdiagnosed as "check site permissions." A `mountedRef` guards every `setMediaFailures` call against late-resolving promises after unmount. The banner renders each `mergeMediaFailures(...).lines` entry as its own paragraph and, when `canRetryInPlace`, a real `<button>` that re-invokes `enableMedia` for exactly the currently-failing kinds — it never reloads, navigates, or leaves the call. The word "reload" no longer appears anywhere in the banner.

**Task 3 — `next.config.ts` header.**
Added `async headers()` returning `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)` for `source: '/:path*'`. `display-capture` is included because `CallControls` (`@stream-io/video-react-sdk`) renders a screen-share button. Existing `experimental.authInterrupts`/`experimental.serverActions.bodySizeLimit` were left untouched. Verified live: started `PORT=3011 npm run dev` in the background, polled until it answered, ran `curl -sI http://localhost:3011/`, confirmed the header, then killed only that PID — port 3000's pre-existing dev server (a concurrent live browser session per repo memory) was never touched.

```
$ curl -sI http://localhost:3011/ | grep -i 'permissions-policy'
Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)
```

**Task 4 (VPM-04, approved plan extension) — release camera/mic hardware on every call exit path.**
Live-reported bug: after ending a video call, the camera hardware light stayed ON. Root cause confirmed by reading the installed `@stream-io/video-client` source (`Call.leave()` in `node_modules/@stream-io/video-client/dist/index.es.js`): `call.leave()` *does* stop devices internally via `CameraManager`/`MicrophoneManager`'s default `stopOnLeave: true` — but only as the very last step of its own long sequential teardown (subscriber/publisher/sfuClient/dynascale disposal all run first). If any earlier step in that chain throws, `leave()` rejects before ever reaching its own camera/mic disable call. The previous cleanup here only ran `call.leave().catch(() => {})`, silently swallowing that rejection with the hardware still held — exactly the reported symptom.

Fix: a new `releaseCallResources(call, client)` helper that explicitly and independently runs, in order:
1. `await call.camera.disable(true)` (forceStop, stops the actual `MediaStreamTrack`)
2. `await call.microphone.disable(true)`
3. `await call.leave()`
4. `await client.disconnectUser()`

Each step has its own `try/catch` so a failure in one can never skip the next — this is the critical difference from the old single `call.leave().catch()`. A call that never actually joined (the pre-existing `JOIN_TIMEOUT_MS` case) still runs every step safely, since `disable()` on a never-enabled device and `leave()`/`disconnectUser()` on a never-connected call/client are safe no-ops/rejections that get swallowed.

This is wired into two places:
- The existing join effect's unmount cleanup (covers: CallControls' own leave button, which navigates away via `onLeft` → `router.push(dashboard)`; "End for everyone", which calls `endVideoCallAction` then `router.push(dashboard)`; and any other client-side navigation away — all of these unmount `VideoCallRoom`).
- A new `pagehide` window event listener (covers: tab/browser close, which does **not** trigger a React unmount at all, since no client-side navigation occurs — `pagehide` is the standard, bfcache-safe "document is going away" signal).

No join semantics, fullscreen behavior, or "End for everyone" logic were changed — only teardown was added.

## Hard Limit (stated per plan requirement)

A web page **cannot** force-grant, auto-enable, or otherwise override camera/microphone permission. Once a user, an enterprise policy, or the OS has blocked it, only the user can restore it via browser/OS settings — no JavaScript can bypass that, by design. This plan does not attempt to work around that; it only (a) maximises the grant rate by re-requesting on an explicit user gesture, (b) turns recovery from "reload and lose the call" into one in-call click, and (c) tells the truth about which of seven recognised causes actually applies.

## Verification Performed

- `npx vitest run lib/media-permission.test.ts` — 14/14 passed.
- `npx tsc --noEmit` — clean, no errors.
- `npm run lint` — 0 errors, 3 pre-existing warnings (unchanged from baseline: `app/layout.tsx` custom-font warning, `netlify/functions/send-call-reminders.mts` anonymous-default-export warning, `tests/actions/workflow.test.ts` unused-var warning).
- `npm test` — 44 files, **446 passed + 1 todo** (baseline was 432 passed + 1 todo; +14 new, all in `lib/media-permission.test.ts`). No regressions.
- `grep -n "window\.\|navigator\." lib/media-permission.ts` — matches only inside `queryMediaPermissionState`, confirming the classifier stays pure.
- `grep -c 'mediaBlocked'` (non-comment) in `video-call-room.tsx` — 0. `grep -ci 'reload th'` (non-comment) — 0.
- Live header proof: `PORT=3011 npm run dev` started in background, polled until responsive, `curl -sI http://localhost:3011/` showed `Permissions-Policy: camera=(self), microphone=(self), display-capture=(self)`, server stopped by its own PID only. Port 3000's pre-existing process (concurrent session) confirmed untouched before and after.

## What Was NOT Verified (pending human browser check)

Per this plan's own `<verification>` section, manual browser confirmation is explicitly **not** performed by the executor:
- Denying camera in Chrome site settings, joining a call, clicking the retry button, and confirming no reload occurs and the call survives.
- Confirming, in a real browser, that after ending a call (via the CallControls leave button, "End for everyone", navigating away, and closing the tab) no `MediaStreamTrack` remains live and the OS camera-light indicator turns off in every case — the `pagehide` path in particular is best-effort by nature (the browser does not guarantee in-flight async work completes before the page is torn down), though `track.stop()`-equivalent work inside `disable()` begins synchronously enough in practice for this to be effective for the vast majority of real closes.

These are left to the orchestrator per this repo's established "pending live browser verification" convention.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Copy/design refinement, not in original plan spec] `DETAIL`/`TITLE` generators keyed off a label string, not `MediaKind` directly.**
- **Found during:** Task 1, while writing the merge-same-cause test.
- **Issue:** If the merged same-cause banner line reused one device's `MediaFailure.detail` verbatim (e.g. camera's), a `permission_denied` merge would read "...set camera to Allow" even when the microphone was also denied — wrong instruction for half the audience.
- **Fix:** `DETAIL`/`TITLE` take a plain string label (`'camera' | 'microphone' | 'camera and microphone'`) instead of `MediaKind`, so `mergeMediaFailures` can call `DETAIL[cause]('camera and microphone')` directly for the merged case.
- **Files modified:** `lib/media-permission.ts`.
- **Commit:** `0c50f8d` (Task 1 commit — this was part of the same task's initial implementation, not a later fix).

### Process note — concurrent commit activity on this branch

Per this repo's own memory ("Concurrent computer-use session: another live session drives a real browser on trt-pm"), an external process on this same checkout committed and pushed the Task 4 (VPM-04) file changes directly to `origin/main` under a generic message `"update"` (commit `5638123`) between this executor's `git add` and `git commit` calls for that task — the working tree was already clean with `origin/main` at that commit by the time this executor's own `git commit` ran, which reported "nothing to commit." The diff in `5638123` was verified via `git show` to be byte-for-byte the intended Task 4 change (only `app/_components/video-call-room.tsx`, exactly the `releaseCallResources` + `pagehide` listener changes written by this execution) — no unexpected content. Per the git safety protocol (never amend/rewrite another actor's already-pushed commit without explicit user request), this was left as-is rather than force-amended to a conventional commit message. All four tasks' work is confirmed present and correct in `origin/main` at `5638123`.

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None beyond the plan's own threat register (T-vpm-01 through T-vpm-04, T-vpm-SC) — no new network endpoints, auth paths, or schema changes were introduced. The VPM-04 teardown addition touches only client-side SDK lifecycle calls (`camera.disable`, `microphone.disable`, `call.leave`, `client.disconnectUser`) already covered by the plan's threat model class (T-vpm-01, "no privilege gained").

## Self-Check: PASSED

- `lib/media-permission.ts` exists — FOUND.
- `lib/media-permission.test.ts` exists — FOUND.
- Commit `0c50f8d` exists in `git log --oneline --all` — FOUND.
- Commit `f1a16e6` exists in `git log --oneline --all` — FOUND.
- Commit `fa9b4d0` exists in `git log --oneline --all` — FOUND.
- Commit `5638123` exists in `git log --oneline --all` (Task 4 / VPM-04 content, verified via diff) — FOUND.
