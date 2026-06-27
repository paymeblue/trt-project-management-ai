---
type: quick
slug: overview-stats-file-input
date: 2026-06-27
status: complete
milestone: v1.0
---

# Summary: Overview stats (Operations + project status) & bigger file input

**Status:** complete ✓

## What changed

| File | Change |
|------|--------|
| `app/(app)/admin/overview/page.tsx` | Added `operationsCount` query + Operations card (Users grid now 5 cols); added Completed (delivered) + In Progress (not delivered) cards to Activity |
| `app/_components/process-flow-form.tsx` | Replaced the tiny default file input with a large dashed upload zone (icon + helper text, "Change image" once a file is picked) |

## Why

- The Overview "Total Users" (6→7) never matched the role cards because the
  **Operations** role had no card. Added it so the counts reconcile.
- Admins had no quick read on project status — added **Completed** and
  **In Progress** cards (reusing the already-computed `delivered` /
  `notDelivered` counts).
- The file picker was unreadable default-browser styling; now a clear, large
  clickable drop area.

## Verification

- `tsc --noEmit` + `eslint` clean on changed files.
- Browser-verified as Super Admin: Operations card shows (1), Total Users (7)
  = Factory(1) + Site(3) + Super Admin(2) + Operations(1); Activity shows
  Completed/In Progress; Add Process Flow form renders the large upload zone.
