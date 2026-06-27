---
type: quick
slug: analytics-delivery-speed
date: 2026-06-27
status: complete
milestone: v1.0
---

# Summary: Super Admin Delivery Analytics

**Status:** complete ✓

## What changed

| File | Change |
|------|--------|
| `package.json` / `package-lock.json` | Added `echarts@^5.5.1` (resolved 5.6.0) |
| `app/(app)/admin/analytics/page.tsx` | New admin-gated server page: delivery-speed computation + stat cards + chart |
| `app/_components/analytics-chart.tsx` | New ECharts client component with Bar/Ranked/Line/Pie switcher |
| `app/_components/sidebar-nav.tsx` | Added "Analytics" link to the `super_admin` nav |

## Decisions

- **ECharts via `echarts.init` directly** (no `echarts-for-react`) to avoid React 19 peer-dep issues; chart lifecycle managed with `useEffect` + `ResizeObserver`.
- **Delivery-speed metric:** completed projects = createdAt → latest `project_step_completions.completedAt` (fallback `updatedAt`); in-progress = elapsed time so far (amber). On-time derived from `projects.deliveryDate`.
- Reused existing admin-page styling (white cards, gray borders, `text-primary`) and Material Symbols icons for consistency with Timeline/Overview.

## Verification

- `tsc --noEmit` — clean on changed files (resolved ECharts strict option typing on axis discriminated union + formatter params).
- `eslint` — clean (fixed `Date.now()` purity error → `new Date().getTime()`, removed unused vars).
- Browser-tested: signed in as seeded Super Admin, loaded `/admin/analytics` — stat cards populate, ECharts canvas renders (838×400), Bar→Share tab switch re-renders correctly (screenshots captured).

## Notes

- The npm `gsd-sdk` query interface expected by this GSD version was not installed at task time; quick-task artifacts and STATE.md were updated following GSD conventions directly. (Installed `@gsd-build/sdk` exposes a different CLI — `run`/`init`, not `query`.)
