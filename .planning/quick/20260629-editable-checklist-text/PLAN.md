---
type: quick
slug: editable-checklist-text
date: 2026-06-29
milestone: v1.0
---

# Quick Task: Editable checklist text (Site PM / Factory PM)

## Description

Site PMs and Factory PMs need to update the wording of checklist questions and
add new questions without a developer/seed script. Today `checklistTemplateItems`
(the `label` / `helpText` of each question) are only writable via seed scripts.
Add an inline "Edit checklist" mode on `/checklists/[slug]` so authorized PMs can
edit existing question text and append new questions.

## Scope (decided with user)

- **Text only.** Edit `label` + `helpText` of existing `checklistTemplateItems`;
  add new items (itemType `radio`, responseOptions `yes_no`, appended to the last
  step/section). No reorder, no section-title editing, no item-type switching, no
  deleting checklists or items.
- **Permissions by `targetRole`.** factory_pm edits definitions whose targetRole
  is `factory_pm` or `both`; site_pm edits `site_pm` or `both`; super_admin /
  operations edit everything. Enforced server-side from the definition's
  `targetRole` (not trusting the client).
- **Inline UI** on `app/(app)/checklists/[slug]/page.tsx`: an "Edit checklist"
  toggle reveals editable rows (label + help text + Save) plus an "Add question"
  control. Reuses existing card/input styling.

## Files

- `lib/workflow.ts` — add `canEditChecklist(userRole, targetRole)` (client-safe).
- `actions/checklists.ts` — add `updateChecklistItemText` and `addChecklistItem`
  server actions, both authorized via `canEditChecklist` + the definition's
  `targetRole`; `revalidatePath('/checklists/<slug>')` after each.
- `app/_components/checklist-editor.tsx` — new client component (inline editor).
- `app/(app)/checklists/[slug]/page.tsx` — compute `canEdit`, render the editor.

## Acceptance Criteria

- A factory_pm sees + uses the editor on a `factory_pm`/`both` checklist; a
  site_pm on a `site_pm`/`both` checklist; admins on all.
- A factory_pm cannot edit a `site_pm`-only checklist (no UI; action rejects).
- Editing a label/help text persists and is reflected in the create-new wizard.
- Adding a question appends it and it appears in the wizard.
- Empty label is rejected.
- `tsc --noEmit` + `eslint` clean on changed files.
