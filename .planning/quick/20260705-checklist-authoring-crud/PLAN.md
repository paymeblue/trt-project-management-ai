---
type: quick
slug: checklist-authoring-crud
date: 2026-07-05
milestone: v1.1
---

# Quick Task: Full super-admin checklist authoring CRUD

## Description

The checklist authoring surface (`/admin/checklists`) only supports two of the
four CRUD operations today: adding a question (`addChecklistItem`) and editing a
question's wording (`updateChecklistItemText`). There is no way to delete a
question, create/rename/retarget/delete a whole checklist, reorder questions, or
edit a question's field-level settings (type, response options, photo-required).
This task completes the CRUD surface for the super admin.

## Scope (decided with user — all four)

1. **Delete/deactivate items** — soft-delete via `checklist_template_items.is_active = false`
   (the wizard and admin reads already filter `is_active = true`). No hard delete:
   `checklist_responses` references items, and the platform is a permanent record.
2. **Full definition CRUD** — create a new `checklist_definitions` row (name, slug,
   target_role), rename/retarget an existing one, and deactivate/reactivate a whole
   definition (soft-delete via `is_active`, since `checklists` reference definitions).
3. **Reorder items** — move a question up/down within its definition by swapping
   `(step, sort_order)` with its neighbour in the active, ordered list.
4. **Per-item field editing** — edit `item_type` (radio/text), `response_options`
   (yes_no / yes_no_na), and `is_photo_required` per question.

## Authorization

super_admin ONLY (v1.1 REQ-G01). Every mutating action derives the caller role
server-side via `verifySession()` and `canEditChecklist(role)` in `lib/workflow.ts`
— never trusts the client. Reuses the existing `authorizeChecklistEdit(definitionId)`
helper for item/definition mutations; definition-create authorizes on role directly.

## Files

- `actions/checklists.ts` — add server actions: `deleteChecklistItem`,
  `moveChecklistItem`, `updateChecklistItemFields`, `createChecklistDefinition`,
  `updateChecklistDefinition`, `setChecklistDefinitionActive`. Each authorizes,
  validates, writes, and `revalidatePath`s (`/admin/checklists` and, where a slug
  is known, `/checklists/<slug>`). Also fix `submitChecklistAction` to only
  build responses for `is_active = true` items (consistency with soft-delete).
- `app/_components/checklist-editor.tsx` — extend `EditableItem` with the new
  fields; add per-item Delete (with confirm), Move up/down, and field controls
  (type / response options / photo-required); add a definition settings block
  (rename, retarget, deactivate).
- `app/(app)/admin/checklists/page.tsx` — add a "Create checklist" form (name,
  slug, target role); split the list into Active + a collapsed Inactive
  (reactivate) section; select the extended item fields for the editor.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` on changed files — clean.
- No DB migration needed — all columns (`is_active`, `item_type`,
  `response_options`, `is_photo_required`, `step`, `sort_order`) already exist.
</content>
</invoke>
