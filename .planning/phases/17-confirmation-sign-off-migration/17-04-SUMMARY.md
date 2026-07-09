---
phase: 17-confirmation-sign-off-migration
plan: 04
subsystem: workflow-engine
tags: [nextjs, react-context, server-components, drizzle, workflow-engine, migration-cutover]

# Dependency graph
requires:
  - phase: 17-confirmation-sign-off-migration (plan 01)
    provides: getLiveWorkflowSteps() adapter, corrected live graph edges, verify-live-workflow.ts
provides:
  - app/_components/workflow-steps-provider.tsx — client WorkflowStepsProvider + useWorkflowSteps() context, seeded once server-side
  - app/(app)/layout.tsx fetches getLiveWorkflowSteps() and wraps children in WorkflowStepsProvider (nested inside MyWorkProvider)
  - app/_components/trt-flow-diagram.tsx — async server component sourced from getLiveWorkflowSteps() instead of the WORKFLOW_STEPS literal
affects: [17-05, 17-06 (client consumers — board, header switcher, pending gate, new-project form — migrate to useWorkflowSteps() next; legacy WORKFLOW_STEPS array retirement)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static (non-polling) provider variant of the my-work-provider pattern: WorkflowStepsProvider seeds React state once from a server-fetched `initial` prop and never refetches — appropriate for data that is static per request, unlike MyWorkProvider's 4s poll for near-real-time work state"
    - "Server component async cutover: a pure server component (TrtFlowDiagram) can be converted from sync to `async function` + `await` a server-only data call with zero changes required at its render site — Next's RSC tree renders `<AsyncComponent />` JSX identically to a sync one, confirmed by a clean `next build`"

key-files:
  created:
    - app/_components/workflow-steps-provider.tsx
  modified:
    - "app/(app)/layout.tsx"
    - app/_components/trt-flow-diagram.tsx

key-decisions:
  - "WorkflowStepsProvider nested inside MyWorkProvider (not the reverse) in the layout — arbitrary since neither depends on the other's context value, chosen to keep the newer provider innermost/closest to children for readability"
  - "No changes needed to app/(app)/about/page.tsx — it already renders `<TrtFlowDiagram />` as a plain JSX child; Next's RSC rendering of an async server component requires no caller-side await or special handling, confirmed by a clean `npx next build`"

requirements-completed: [WF-06]

# Metrics
duration: ~8min
completed: 2026-07-09
---

# Phase 17 Plan 04: WorkflowStepsProvider + Layout Wire + Flow Diagram Cutover Summary

**A new client `WorkflowStepsProvider`/`useWorkflowSteps()` context, seeded once server-side from `getLiveWorkflowSteps()` in the `(app)` layout, plus the end-to-end `TrtFlowDiagram` converted to an async server component reading the same live DB graph instead of the hardcoded `WORKFLOW_STEPS` array — output verified structurally and behaviorally identical for the 11 live steps.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-09T15:10:00Z
- **Completed:** 2026-07-09T15:18:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (`app/(app)/layout.tsx`, `app/_components/trt-flow-diagram.tsx`); 1 created (`app/_components/workflow-steps-provider.tsx`)

## Accomplishments
- `app/_components/workflow-steps-provider.tsx` (new): a `'use client'` context mirroring `my-work-provider.tsx`'s `initial`-prop seeding pattern but simplified — no polling, since the step graph doesn't change within a request the way my-work does. Exports `WorkflowStepsProvider({ initial, children })` and `useWorkflowSteps(): WorkflowStep[]` (default `[]`).
- `app/(app)/layout.tsx`: added `const liveSteps = await getLiveWorkflowSteps()` alongside the existing `getMyWork` call, and nested `<WorkflowStepsProvider initial={liveSteps}>` inside the existing `<MyWorkProvider>` wrapper around the app shell. Every other layout behavior (auth redirect, avatar/position lookup, sidebar, header) untouched.
- `app/_components/trt-flow-diagram.tsx`: converted from a sync to an `async` server component, replacing `import { WORKFLOW_STEPS }` with `getLiveWorkflowSteps` from `@/lib/workflow-graph` and `await`ing it into a local `steps` variable. Every render detail preserved exactly: `steps.map` (was `WORKFLOW_STEPS.map`), `i === steps.length - 1` for the last-item rail (was `WORKFLOW_STEPS.length - 1`), `ROLE_COLOR`/`DETAIL`/`ROLES` legend and all markup unchanged.
- `app/(app)/about/page.tsx` required no edit — it already renders `<TrtFlowDiagram />` as a plain JSX child; Next's App Router RSC tree supports an async server component at that call site with zero caller-side changes, confirmed by a clean `npx next build`.
- The pre-existing "Operations/Design/Production" ROLES organogram entries in `about/page.tsx` (added in commit `0ecbbef`, unrelated to this plan) were read but left untouched — verified with `git diff` showing zero changes to that file.
- `npx tsc --noEmit` clean after each task; `npx next build` compiles all 46 routes including `/about`; `npm test` — 74 tests + 1 todo pass unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: WorkflowStepsProvider + useWorkflowSteps, wired in the (app) layout** - `ac31304` (feat)
2. **Task 2: Cut over TrtFlowDiagram to getLiveWorkflowSteps()** - `027a703` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/_components/workflow-steps-provider.tsx` (new) - Client context + `useWorkflowSteps()` hook, seeded once from an `initial` prop; no polling.
- `app/(app)/layout.tsx` - Fetches `getLiveWorkflowSteps()` server-side; wraps children in `WorkflowStepsProvider` (nested inside `MyWorkProvider`).
- `app/_components/trt-flow-diagram.tsx` - Converted to an async server component reading `getLiveWorkflowSteps()` instead of the `WORKFLOW_STEPS` literal; identical iteration/markup.

## Decisions Made
- Nested `WorkflowStepsProvider` inside `MyWorkProvider` in the layout (order is arbitrary — neither context depends on the other) to keep the newer provider innermost.
- Confirmed no change was needed to `about/page.tsx`'s render site for the now-async `TrtFlowDiagram` — plain JSX invocation of an async server component compiles and builds cleanly under Next's RSC model.

## Deviations from Plan

None - plan executed exactly as written. Task 2's plan text anticipated `about/page.tsx` might need an `await`/render-pattern change to handle the now-async component; verification (`npx tsc --noEmit` + `npx next build`) confirmed the existing `<TrtFlowDiagram />` JSX call site already compiles and builds correctly with zero edits, so no file was touched beyond what's listed above.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `useWorkflowSteps()` is available to any client component under the `(app)` shell, seeded from the live DB graph — the precondition plan 05 depends on to migrate the board, header switcher, pending gate, and new-project form off the `WORKFLOW_STEPS` literal.
- `TrtFlowDiagram` (the end-to-end flow diagram on `/about`) is fully DB-sourced; the last server-rendered consumer of the legacy array outside `lib/workflow.ts` itself is now gone.
- `about/page.tsx`'s ROLES organogram array (Operations/Design/Production entries from commit `0ecbbef`) is unmodified — confirmed via `git diff` showing zero changes to that file.
- `npx tsc --noEmit`, `npx next build` (46 routes), and `npm test` (74 passed + 1 todo) all clean post-cutover.
- No blockers. Ready for 17-05 (client consumer cutover: board, header switcher, pending gate, new-project form).

---
*Phase: 17-confirmation-sign-off-migration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: app/_components/workflow-steps-provider.tsx
- FOUND: app/(app)/layout.tsx
- FOUND: app/_components/trt-flow-diagram.tsx
- FOUND: .planning/phases/17-confirmation-sign-off-migration/17-04-SUMMARY.md
- FOUND: commit ac31304 (feat(17-04): add WorkflowStepsProvider seeded from live graph, wired in layout)
- FOUND: commit 027a703 (feat(17-04): cut over TrtFlowDiagram to getLiveWorkflowSteps())
