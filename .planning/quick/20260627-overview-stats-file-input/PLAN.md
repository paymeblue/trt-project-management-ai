---
type: quick
slug: overview-stats-file-input
date: 2026-06-27
milestone: v1.0
---

# Quick Task: Overview stats (Operations + project status) & bigger file input

## Description

Two UI fixes reported from the admin Overview page and the Add Process Flow form:

1. **Overview users don't add up / Operations missing** — Total Users (6) ≠
   Factory(1) + Site(2) + Super Admin(2) = 5. The 6th is the Operations user,
   which has no card. Add an Operations count card.
2. **No completed / in-progress project breakdown** — Activity only shows
   "Total Projects". Add Completed (delivered) and In Progress (not delivered)
   cards so admins can see project status at a glance.
3. **File input too small** — the bare `<input type="file">` in the Add Process
   Flow form is tiny default-browser styling. Make it a large, styled upload
   area.

## Scope

- `app/(app)/admin/overview/page.tsx` — add `operationsCount` query; add
  Operations card to the Users grid (now 5 cols); add Completed + In Progress
  project cards to the Activity section.
- `app/_components/process-flow-form.tsx` — replace the small file input with a
  large dashed upload zone (label-wrapped hidden input, icon + helper text,
  shows "Change image" once a file is picked).

## Acceptance Criteria

- Users section shows all role counts including Operations; they sum to Total.
- Activity shows Completed and In Progress project counts.
- File picker is a large, clearly clickable area.
- `tsc --noEmit` + `eslint` clean on changed files; browser-verified.
