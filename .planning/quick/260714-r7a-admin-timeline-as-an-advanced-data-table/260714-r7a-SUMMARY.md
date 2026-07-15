---
task: 260714-r7a
title: Admin Timeline as an Advanced Data Table
status: complete
---

# 260714-r7a: Admin Timeline as an Advanced Data Table Summary

Reworked the admin Projects Timeline into a client-filtered, groupable advanced data table (search, live-step/status/payment filters, created/deadline date ranges, Month/Year/Step grouping) with zero new dependencies, while preserving every existing behavior (super_admin audit link, history expander, operations act-link gating).

## What Changed

- **`app/(app)/admin/timeline/table-utils.ts`** — new pure module: `TimelineRow`, `TimelineFilters`, `GroupMode`, `TimelineGroup` types, plus `filterRows()` and `groupRows()`. No React/DB imports.
- **`app/(app)/admin/timeline/table-utils.test.ts`** — 9 Vitest cases covering search matching, step/status/payment filters, date-range inclusivity (including null-deliveryDate exclusion), unchanged-when-empty-filters, and month/year/step grouping (with the Delivered bucket).
- **`app/_components/admin-timeline-table.tsx`** — new `'use client'` `AdminTimelineTable({ rows, steps })`: filter bar (search, live step select, status, payment, created/deadline date-range inputs, reset) + grouping toggle (Month/Year/Step, default Month), renders one table per group with a header + count. Preserves the exact "View →" audit link markup and history `<details>` expander.
- **`app/(app)/admin/timeline/page.tsx`** — server component unchanged in data-fetching shape (single `db.select` pass, completions join, `getLiveWorkflowSteps()`, `requireAdmin()`, `force-dynamic`); all per-row derived logic (tone, statusLabel, stepLabel, `complete`, `actHref` gate, `waitingLabel`, `auditHref`, history mapping) moved into a precompute loop producing serializable `TimelineRow[]` (ISO date strings). Inline `<table>` JSX replaced with `<AdminTimelineTable rows={...} steps={...} />`. Page header (← Dashboard, title, green/red legend) untouched.
- **`vitest.config.ts`** (deviation, see below) — added `app/**/*.test.ts` to the `include` glob.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `vitest.config.ts` excluded `app/**` from test discovery**
- **Found during:** Task 1, running `npx vitest run "app/(app)/admin/timeline/table-utils.test.ts"` (the plan's own verify command) initially printed "No test files found" when I later ran it against the config's default include set — and more importantly the required final-gate `npm test` would have silently never run this colocated test, contradicting the plan's own stated convention ("Tests are Vitest (`npm test` → `vitest run`), colocated `*.test.ts`").
- **Issue:** `vitest.config.ts` had `include: ['tests/**/*.test.ts', 'lib/**/*.test.ts']` — no `app/**` pattern, so a colocated `app/(app)/admin/timeline/table-utils.test.ts` file would never be picked up by the persistent `npm test` suite.
- **Fix:** Added `'app/**/*.test.ts'` to the `include` array.
- **Files modified:** `vitest.config.ts`
- **Commit:** `03c5e4d`
- **Verification:** `npm test` now reports 16 test files / 127 passed (was 15 files before this fix — confirmed the new file is now discovered), including the new 9 table-utils tests.

### Notable implementation choices (not deviations, judgment calls within plan scope)

- `client` search field is populated from `p.customerName ?? ''` (empty string, not `null`) so it composes cleanly into the single search haystack string without extra null-guards — matches the plan's "client" search-field intent (customerName) without changing filter semantics.
- `waitingLabel` is computed as `!complete && step && !actHref ? ... : null` (rather than "no step" also implying waiting) — this exactly mirrors the original inline JSX's conditional (`{!complete && step && (...)}` wrapping the actHref/waitingLabel ternary), so a project with no matching step at all shows neither an action link nor a waiting label, same as before.
- Lint surfaced two warnings in the new client component (unused `EMPTY_FILTERS` constant left over from an earlier draft, and a `react-hooks/exhaustive-deps` warning on the grouping `useMemo`). Fixed both in-line by removing the dead constant and memoizing the `filters` object itself so it can be listed as a single stable dependency — standard lint-clean cleanup, not a plan deviation.

## Self-Check

- `app/(app)/admin/timeline/table-utils.ts` — FOUND
- `app/(app)/admin/timeline/table-utils.test.ts` — FOUND
- `app/_components/admin-timeline-table.tsx` — FOUND
- `app/(app)/admin/timeline/page.tsx` — FOUND (modified)
- Commit `03c5e4d` — FOUND (test file + vitest.config.ts fix)
- Commit `6ee19cc` — FOUND (table-utils.ts implementation)
- Commit `d3366d4` — FOUND (client table component)
- Commit `c82bd35` — FOUND (server page precompute + wiring)

## Self-Check: PASSED

## Final Gate

- `npx tsc --noEmit` — clean, no errors
- `npm run lint` — clean (only a pre-existing, unrelated `app/layout.tsx` custom-font warning remains; not touched by this task)
- `npm test` — 16 test files, 127 passed, 1 pre-existing todo
- `npm run build` — compiled successfully, `/admin/timeline` listed as a dynamic (ƒ) route as before

## Manual Smoke (not run — dev server owned by a concurrent browser-walkthrough agent per constraints)

Per the execution constraints, the dev server was left untouched (a separate agent was live-testing against it). The plan's manual smoke steps (toggle Month/Year/Step, search, step/date-range/status/payment filters, history expander, super_admin "View →", operations action-link gating) were not independently re-verified in a browser by this executor — the automated final gate (tsc/lint/test/build) is the full verification performed here.
