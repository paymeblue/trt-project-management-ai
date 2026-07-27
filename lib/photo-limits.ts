// Quick task 260727-ibr: shared photo-evidence caps for `checklists.photoData`.
//
// MAX_PHOTO_DATA previously lived as a module-private const inside
// actions/checklists.ts and could not be exported from there — a `'use
// server'` file may only export async functions, not plain constants. Two
// independent write paths (submitChecklistAction and
// amendEscalatedChecklistAction) now persist into `checklists.photoData`, so
// the cap is hoisted into this plain module to make drift between the two
// impossible.
export const MAX_PHOTO_DATA = 1_500_000 // ~1.5MB per downscaled data URL

// Mirrors the wizard's per-submission cap in checklist-wizard.tsx (photos
// capped at 6 there via `photos.length >= 6`).
export const MAX_AMEND_PHOTOS = 6
