---
phase: quick-260713-s2l
plan: 01
subsystem: ui
tags: [react, next.js, vitest, tailwind, client-component]

requires:
  - phase: quick-260714-b4t
    provides: header-project-switcher.tsx's viewerPosition-gated mine/youract logic, which this plan builds the countdown on top of without disturbing
provides:
  - "lib/countdown.ts: pure, unit-tested formatCountdown(deadline, now) formatter"
  - "app/_components/deadline-countdown.tsx: reusable ticking, pulsing client countdown component"
  - Both pending-work surfaces (forcing modal + header pill) now show a live per-second countdown instead of a static date
affects: []

tech-stack:
  added: []
  patterns:
    - "Pure formatter (lib/countdown.ts) separated from the ticking client component (deadline-countdown.tsx) — the formatter takes `now` as an argument instead of reading the clock, keeping it trivially unit-testable"
    - "Ticking + hydration pattern (useState(() => Date.now()) + 1s setInterval in useEffect + suppressHydrationWarning) mirrored verbatim from project-steps-board.tsx's private Countdown component for consistency across the codebase"

key-files:
  created:
    - lib/countdown.ts
    - tests/lib/countdown.test.ts
    - app/_components/deadline-countdown.tsx
  modified:
    - app/_components/pending-step-gate.tsx
    - app/_components/header-project-switcher.tsx

key-decisions:
  - "formatCountdown takes `now: number` as an explicit parameter rather than reading Date.now() internally, so tests are deterministic and timezone-independent"
  - "DeadlineCountdown always applies animate-pulse regardless of tier (per the owner's 'ensure it's blinking' request), escalating only color/font-weight by tier"

requirements-completed: [QUICK-COUNTDOWN-01]

duration: 8min
completed: 2026-07-14
---

# Phase quick-260713-s2l: Live Blinking Countdown Timer Summary

**A pure, unit-tested formatCountdown formatter plus a ticking, pulsing DeadlineCountdown client component now replace the static "Deadline: Jul 20, 2026" text on both the forcing "Action required" modal and the header project pill.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-14T07:03:24Z (shared session start with 260714-b4t; countdown work began ~07:07:35Z after that plan's SUMMARY.md was written)
- **Completed:** 2026-07-14T07:11:29Z
- **Tasks:** 2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `lib/countdown.ts` exports a pure `formatCountdown(deadline, now)` returning `{ hasDeadline, overdue, text, tier }`, with 7 unit tests covering null deadlines, day/hour/minute/second formatting, zero-padding, all three tiers, and overdue text.
- `app/_components/deadline-countdown.tsx` mirrors `project-steps-board.tsx`'s existing private `Countdown` component's exact ticking + hydration pattern (`useState(() => Date.now())` + 1s `setInterval` in `useEffect`, cleaned up on unmount, `suppressHydrationWarning`), so there's now one consistent countdown idiom in the codebase instead of two.
- The forcing modal (`pending-step-gate.tsx`) and header pill (`header-project-switcher.tsx`) both render the ticking, always-pulsing countdown; the modal's static `toLocaleDateString()` text is gone.
- Escalation matches spec: normal (muted gray) at >24h, amber+semibold under 24h, red+bold under 6h or overdue (text prefixed "Overdue ").
- No changes to `lib/my-work.ts`, `actions/`, or `db/` — client-side only, as scoped. No new dependencies.

## Task Commits

Each task was committed atomically (TDD: RED then GREEN for Task 1):

1. **Task 1 (RED): failing test for formatCountdown** - `c31de6b` (test)
2. **Task 1 (GREEN): formatCountdown + DeadlineCountdown component** - `9ba1374` (feat)
3. **Task 2: mount DeadlineCountdown on both pending-work surfaces** - `e0c55e5` (feat)

**Plan metadata:** (this SUMMARY.md + STATE.md update, committed separately by the orchestrator)

## TDD Gate Compliance

Task 1 was `tdd="true"`. Gate sequence verified in git log:
1. RED gate: `c31de6b test(260713-s2l): add failing test for formatCountdown` — confirmed failing (module didn't exist) before any implementation existed.
2. GREEN gate: `9ba1374 feat(260713-s2l): implement pure formatCountdown + ticking DeadlineCountdown component` — all 7 tests passed after.
3. REFACTOR: not needed — no refactor commit.

Both gate commits present. Compliant.

## Files Created/Modified
- `lib/countdown.ts` - pure `formatCountdown(deadline, now)` formatter + `CountdownDisplay`/`CountdownTier` types; zero-padded d/h/m/s, tiered by remaining time
- `tests/lib/countdown.test.ts` - 7 deterministic unit tests pinning format, tier thresholds, zero-padding, and overdue behavior against a fixed base `now`
- `app/_components/deadline-countdown.tsx` - `'use client'` component: ticks every second, always `animate-pulse`, `font-mono tabular-nums` digits, color/weight escalation by tier, muted "No deadline" for null
- `app/_components/pending-step-gate.tsx` - static `deadlineText`/`toLocaleDateString()` line replaced with `<DeadlineCountdown deadline={item.deadline} />`
- `app/_components/header-project-switcher.tsx` - header pill sub-line gained `<DeadlineCountdown deadline={selected.deadline} compact />` next to the step/label text

## Decisions Made
- `formatCountdown` takes `now` as an explicit parameter (not read internally via `Date.now()`) so the unit tests are deterministic and timezone-independent, and so the client component controls the tick cadence entirely via its own `useEffect`.
- Followed the plan's explicit instruction to mirror `project-steps-board.tsx`'s `Countdown` hydration/ticking approach verbatim rather than inventing a new one, for codebase consistency.

## Deviations from Plan

None - plan executed exactly as written. Both target files (`pending-step-gate.tsx`, `header-project-switcher.tsx`) were re-read fresh from disk immediately before editing (per the plan's explicit re-read instruction and today's earlier 260714-b4t plan having modified `header-project-switcher.tsx` within this same session); no line numbers were trusted, targets were located by content.

## Issues Encountered
One self-caused issue during editing, corrected before running any verification: an `Edit` on `pending-step-gate.tsx` initially dropped the closing `</p>` tag around the deadline line. Caught immediately by re-reading the file, fixed with a follow-up edit before running `tsc`/`lint`/tests — not a deviation from the plan, just an in-flight correction.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both pending-work surfaces now show a live, attention-grabbing countdown for any project with a resolved deadline. Combined with 260714-b4t's auto-seeded early-step deadlines, new projects will show a ticking countdown immediately after creation instead of "No deadline" until step 4.
- `DeadlineCountdown` is a generic, reusable component (`deadline`, `compact`, `className` props) available for any future surface that needs the same treatment.
- No blockers.

---
*Phase: quick-260713-s2l*
*Completed: 2026-07-14*
