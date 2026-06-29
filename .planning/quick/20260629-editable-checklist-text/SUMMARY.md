---
type: quick
slug: editable-checklist-text
date: 2026-06-29
status: complete
milestone: v1.0
---

# Summary: Editable checklist text (Site PM / Factory PM)

**Status:** complete ✓

## What changed

| File | Change |
|------|--------|
| `lib/workflow.ts` | Added `ChecklistTargetRole` type + `canEditChecklist(userRole, targetRole)` — admins edit all; a PM edits a checklist when its `target_role` matches their role or is `both`. |
| `actions/checklists.ts` | Added `updateChecklistItemText` and `addChecklistItem` server actions. Both load the definition, authorize via `canEditChecklist` + the definition's `target_role` (server-derived, never trusted from client), validate non-empty/length, write, and `revalidatePath('/checklists/<slug>')`. New questions append to the last step/section as a `radio` / `yes_no` item. |
| `app/_components/checklist-editor.tsx` | New client component: collapsible "Edit checklist questions" panel — per-item label + help-text inputs with Save (disabled until dirty), plus an "Add a new question" form. Uses `useTransition` and `router.refresh()`. |
| `app/(app)/checklists/[slug]/page.tsx` | Computes `canEdit` from the definition's `target_role` and renders `ChecklistEditor` (only when authorized) between the title and the create-new wizard. |

## Scope (as agreed)

Text only — edit `label`/`helpText`, add new items. No reorder, section-title
editing, item-type switching, or deletion. Permissions keyed off the existing
`checklist_definitions.target_role` column.

## Verification

- `npx tsc --noEmit` — clean.
- `eslint` on all four changed files — clean.
- `vitest run tests/lib/workflow.test.ts` — 14/14 pass.
- `/checklists/sorting` compiles and returns HTTP 307 (auth redirect) on the
  running dev server — no compile/runtime error on the route.
- NOT done: full interactive browser walkthrough as a logged-in PM (needs a
  seeded PM session; local DB showed intermittent connection failures).
