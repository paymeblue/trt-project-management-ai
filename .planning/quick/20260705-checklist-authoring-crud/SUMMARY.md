---
type: quick
slug: checklist-authoring-crud
date: 2026-07-05
status: complete
milestone: v1.1
---

# Summary: Full super-admin checklist authoring CRUD

**Status:** complete ✓

## What changed

| File | Change |
|------|--------|
| `actions/checklists.ts` | Added six server actions — `deleteChecklistItem` (soft), `moveChecklistItem` (up/down reorder), `updateChecklistItemFields` (item_type / response_options / is_photo_required), `createChecklistDefinition`, `updateChecklistDefinition` (rename + retarget), `setChecklistDefinitionActive` (deactivate/restore). All authorize server-side via `verifySession` + `canEditChecklist` / the shared `authorizeChecklistEdit` helper (super_admin only). Added a small `authorizeItemEdit` helper and typed `asItemType` / `asResponseOptions` / `asTargetRole` guards. Also fixed `submitChecklistAction` to build responses only for `is_active = true` items. |
| `app/_components/checklist-editor.tsx` | Rewrote to take a `definition` object instead of a bare `definitionId`. Adds: a **Checklist settings** block (rename, retarget, deactivate/restore); per-item **Move up/down**, **Remove** (with inline confirm), and **field controls** (Type radio/text, Options yes_no / yes_no_na, Photo required). Text + field edits save together in one Save. |
| `app/_components/checklist-admin-controls.tsx` | **New** client component: `CreateChecklistForm` (name/slug/target-role, slug auto-normalized server-side, routes to the new checklist on success) and `RestoreChecklistButton`. |
| `app/(app)/admin/checklists/page.tsx` | Splits definitions into **Active** (grid) and a collapsed **Deactivated** `<details>` section with per-row Restore. Renders `CreateChecklistForm`. Selects the extra item fields and passes the full `definition` object to `ChecklistEditor`. Shows a "Deactivated" badge when the selected checklist is inactive. |
| `app/(app)/checklists/[slug]/page.tsx` | Updated the `ChecklistEditor` call to the new `definition` + extended-item props (only rendered when `canEdit`, i.e. super_admin). |

## Design decisions

- **Soft-delete only.** `checklist_responses` references template items and
  `checklists` references definitions, and the platform is a permanent record —
  so item and definition "delete" set `is_active = false`. The wizard and admin
  reads already filter `is_active = true`, so removed questions/checklists drop
  out of new submissions while history is preserved. Deactivation is reversible
  (Restore).
- **Reorder by neighbour swap.** `moveChecklistItem` swaps `(step, sort_order)`
  with the adjacent active item, so the change is reflected under the wizard's
  existing `order by step, sort_order` read without a schema change.
- **Authorization unchanged in spirit.** Everything routes through the existing
  `canEditChecklist(role)` (super_admin only, REQ-G01); no new permission surface.

## Verification

- `npx tsc --noEmit` — clean (0).
- `npx eslint` on all five changed/added files — clean (0).
- No DB migration: every column used (`is_active`, `item_type`,
  `response_options`, `is_photo_required`, `step`, `sort_order`) already exists.

## Not done (out of scope)

- Hard delete (intentionally — permanent record).
- Section-title editing and moving an item to an arbitrary step/section (only
  adjacent up/down reorder).
- Per-item `is_photo_required` is stored and editable but not newly enforced at
  submit time (submit-time photo gating still uses `REQUIRED_PHOTOS` by slug).
</content>
