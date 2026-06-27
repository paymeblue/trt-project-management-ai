---
type: quick
slug: analytics-delivery-speed
date: 2026-06-27
milestone: v1.0
---

# Quick Task: Super Admin Delivery Analytics

## Description

Add an Analytics page for the Super Admin / Operations role that charts
delivery speed per project so they can compare how fast projects move from
creation to delivery. Use ECharts with a switchable visualization (Bar,
Ranked horizontal bar, Line, Pie/Share). Add an "Analytics" link to the admin
sidebar navigation.

## Scope

- **New dependency:** `echarts@^5.5.1` (resolved to 5.6.0). Used directly via
  `echarts.init` (no React wrapper) to avoid React 19 peer-dependency friction.
- **New route:** `app/(app)/admin/analytics/page.tsx` — server component,
  `requireAdmin()`-gated. Computes per-project delivery duration: days from
  `projects.createdAt` to the latest `project_step_completions.completedAt`
  (fallback `updatedAt`) for completed projects, or elapsed-time-so-far for
  in-progress ones. Renders 4 summary stat cards (avg / fastest / slowest /
  on-time rate) plus the chart.
- **New client component:** `app/_components/analytics-chart.tsx` — ECharts
  chart with a segmented Bar / Ranked / Line / Share switcher, average-delivery
  reference line, color-coded marks (green = on time, red = late, amber = in
  progress), tooltips, legend, and a `ResizeObserver` for responsiveness.
- **Nav:** add `{ href: '/admin/analytics', icon: 'analytics', label: 'Analytics' }`
  to the `super_admin` nav in `app/_components/sidebar-nav.tsx` (operations
  inherits this nav).

## Acceptance Criteria

- Analytics link visible in the admin sidebar; route loads for admin role,
  redirects others.
- Chart renders (ECharts canvas) and the four visualization types switch
  without errors.
- Stat cards reflect real project data.
- `tsc --noEmit` and `eslint` pass on changed files.

## Verification

- Type check + lint clean on changed files.
- Browser-verified end-to-end: signed in as seeded admin, loaded
  `/admin/analytics`, confirmed canvas render + Bar→Share tab switch
  (screenshots captured).
