---
phase: quick-260729-cr1
title: Enterprise-grade call room + provably correct call ending
status: complete
completed: 2026-07-29
---

# Enterprise call room (quick task 260729-cr1)

## Commits

- `3b027af` test: pure call-status helpers + exhaustive unit tests
- `e71069f` feat: full-height video stage, demoted invite editor, live status bar
- `7b4cc33` feat: exit-path audit, confirmed end, remote-end notice, un-strand reconnect failure

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — 0 errors (4 pre-existing warnings)
- `npm test` — 47 files, **514 passed + 1 todo** (baseline 471 + 1; +43 new)

## What changed

**Stage.** Root cause of the letterboxed strip: `SpeakerLayout`'s wrapper uses
`flex-grow: 1`, which was inert because its parent was neither a flex container
nor height-bounded, so the stage collapsed to one 16:9 tile. Fixed structurally
(bounded flex column + `min-h-0`). The invite editor moved off the top of the
stage into a side panel; a live status bar adds call duration, joined-vs-invited
counts, a waiting-for-others state, and a transient reconnecting indicator.

**Ending.** "End for everyone" now requires confirmation; leaving stays
one-click. A remotely-ended call explains who ended it before routing away.

## Exit-path audit (7 paths)

| # | Path | Local devices | Stream call/client | `video_calls` row | Navigation |
|---|------|---------------|--------------------|-------------------|------------|
| 1 | Leave (hangup) | `leave()` stops; `releaseCallResources` disables again on unmount (idempotent) | left + disconnected | `leftAt` stamped; auto-ends if last present | `LEFT` → dashboard |
| 2 | End for everyone (local) | released on unmount | `call.end()` best-effort | `status=ended`, `endedAt` set | push dashboard |
| 3 | End for everyone (remote) | stopped by SDK leave, re-released on unmount | SDK sets `endedAt`/`endedBy` **then** leaves | already ended by actor; beacon is a safe no-op | notice shown, then dashboard |
| 4 | Client-side navigation away | released on unmount | left + disconnected | `leftAt` via beacon | n/a |
| 5 | Tab/browser close | released on `pagehide` | left + disconnected | `leftAt` via `keepalive` beacon | n/a |
| 6 | Join timeout | released on unmount (never-joined disables are safe no-ops) | n/a | swept later if never joined | Back link |
| 7 | Reconnect failed | **was stranded — never unmounted, camera stayed on**; now has a Back link that unmounts and releases | left on unmount | swept later | Back link (NEW) |

Double-end is structurally impossible: the beacon re-reads `status` and no-ops
unless still `active`.

## Verified live

Creating a call and letting the page unmount auto-ended it **15 seconds later**
with nobody clicking "End for everyone" (`a24cb554…`, created 11:34:02, ended
11:34:17) — the 260728-vce auto-end path confirmed working end to end.

## NOT verified — needs two real browsers

- The stage layout itself. A headless browser has no camera; the SDK ejects it,
  so the room could not be rendered for visual confirmation.
- Path 3 (remote end) from the receiving side.
- Two participants leaving simultaneously (last-leaver race).
- That the OS camera indicator physically turns off — a hardware observation.
