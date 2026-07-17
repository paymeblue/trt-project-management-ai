---
created: 2026-07-17T00:00:00.000Z
title: Restrict checklist-edit control to Super Admin, Checklist Configuration only
area: auth
files:
  - "app/(app)/checklists/[slug]/page.tsx:111,149"
  - lib/workflow.ts:77-90 (isAdminRole, canEditChecklist)
---

## Problem

The "edit checklist" control (`ChecklistEditor`, rendered via `app/(app)/checklists/[slug]/page.tsx:149`) shows up at the bottom of the act-on-checklist page whenever `canEditChecklist(role)` is true. `canEditChecklist` (`lib/workflow.ts:88-90`) currently delegates to `isAdminRole` (`lib/workflow.ts:77-78`), which returns true for BOTH `super_admin` AND `operations` roles.

Two distinct problems:
1. **Wrong roles:** Any `operations`-role user (e.g. Head of Operations) sees the edit control on the act-on-step page, not just Super Admin.
2. **Wrong placement:** Even for Super Admin, the edit control should never appear on the act-on-checklist page (`[slug]/page.tsx`) at all — it should only be reachable from the dedicated Checklist Configuration area (`app/(app)/admin/checklists/page.tsx`, which already has its own admin controls component `app/_components/checklist-admin-controls.tsx`). Surfacing edit controls inline while someone is trying to fill out/act on a checklist is confusing and risks accidental edits to live checklist structure.

Same class of bug as the notification position-scoping issue fixed 2026-07-17 (a permission/visibility gate too broad relative to the actual intended audience).

## Solution

TBD — likely: remove the inline `canEdit`/`ChecklistEditor` render from `app/(app)/checklists/[slug]/page.tsx` entirely (or gate it out completely regardless of role), and confirm all checklist-structure editing only happens via `app/(app)/admin/checklists/page.tsx` + `checklist-admin-controls.tsx`, restricted to `role === Roles.SuperAdmin` (not `isAdminRole`, since that also matches `operations`). Verify `actions/checklists.ts` server-side authorization matches (don't rely on UI hiding alone).
