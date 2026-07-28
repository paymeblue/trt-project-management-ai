---
phase: quick-260728-lbx
plan: 01
subsystem: ui
tags: [react, nextjs, audit, lightbox, security]
status: complete

# Dependency graph
requires:
  - phase: quick-260714-bpp
    provides: Super-admin audit page (app/(app)/admin/projects/[id]/audit/page.tsx) with T-bpp-03 data:image/ prefix gate
  - phase: quick-260716-hys
    provides: Readiness submissions surfaced on the audit page (ReadinessSubmissionDetails)
provides:
  - Pure isImageAsset/imageAssetsOnly helpers (lib/audit-assets.ts) as the single image gate for the audit page
  - AuditAssetGallery 'use client' thumbnail strip + full-size lightbox overlay component
  - All five audit-page image sites (step upload, checklist photos, readiness signature, readiness legacy scan, readiness photos) now open in-page instead of downloading
affects: [audit, super-admin, evidence-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure DB-free helper module shared between a server component and a 'use client' component, unit-tested directly (mirrors assembleAuditRows in lib/project-audit.ts)"
    - "In-page lightbox overlay following existing modal conventions (fixed inset-0 backdrop + stopPropagation panel + Escape keydown effect), no new dependency"

key-files:
  created:
    - lib/audit-assets.ts
    - tests/lib/audit-assets.test.ts
    - app/_components/audit-asset-gallery.tsx
  modified:
    - "app/(app)/admin/projects/[id]/audit/page.tsx"

key-decisions:
  - "isImageAsset is a strict, case-sensitive, untrimmed data:image/ literal-prefix check — the sole gate deciding whether an asset becomes interactive (T-bpp-03 preserved, not relaxed)"
  - "AuditAssetGallery indexes the lightbox against imageAssetsOnly(assets), not the raw assets list, so non-image entries are never even rendered by this component — they stay in the caller's existing filename-text/PDF-download branches"
  - "stepContext (`Step N — Label`) threaded from AuditTableRow into UploadCell and both submission-detail components purely for lightbox captions; lib/project-audit.ts was not touched to carry this — the page already had row.n/row.label in hand"

patterns-established:
  - "object-contain over object-cover for any future asset thumbnail on this page, to avoid centre-cropping non-square evidence"

requirements-completed: [LBX-01-lightbox, LBX-02-uncropped-thumbnails, LBX-03-preserve-T-bpp-03]

# Metrics
duration: 6min
completed: 2026-07-28
---

# Phase quick-260728-lbx: Audit Image Lightbox Summary

**Replaced click-to-download image thumbnails on the super-admin project audit page with an in-page lightbox (object-contain thumbnails, full-size overlay, Escape/backdrop/close-button dismiss, prev/next nav, download-inside-overlay) across all five image sites, gated by a new strict `data:image/` prefix helper that is the single source of truth for T-bpp-03.**

## Performance

- **Duration:** 6 min (task commits 09:03:44–09:06:18 UTC+1)
- **Started:** 2026-07-28T08:00:00Z (approx)
- **Completed:** 2026-07-28T08:06:29Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- New pure `lib/audit-assets.ts` (`isImageAsset`, `imageAssetsOnly`, `AuditAsset` type) with a 14-case unit test suite covering hostile lookalikes (`data:text/html`, uppercase prefix, leading whitespace)
- New `app/_components/audit-asset-gallery.tsx` `'use client'` component: thumbnail strip (`object-contain`, never `object-cover`) + full-size overlay with keyboard (Escape/ArrowLeft/ArrowRight)/backdrop/close-button dismiss, "Download original" link, and an "n of N" counter for multi-image groups — zero new dependencies
- Audit page rewired at all five image sites (step upload, checklist photos, readiness signature, readiness legacy scan, readiness photos) to render through `AuditAssetGallery`, with a `stepContext` string threaded through for lightbox captions
- `ReadinessSubmissionDetails`' legacy-upload gate now calls the shared `isImageAsset` instead of a locally duplicated `startsWith` check — one gate governs the whole page

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure asset helpers + unit tests** - `635686a` (feat)
2. **Task 2: AuditAssetGallery client component (thumbnails + lightbox)** - `1ff08a5` (feat)
3. **Task 3: Wire the gallery into all five audit-page image sites** - `e656182` (feat)

**Plan metadata:** (this commit, immediately following)

## Files Created/Modified
- `lib/audit-assets.ts` - Pure `AuditAsset` type, `isImageAsset` strict prefix gate, `imageAssetsOnly` filter
- `tests/lib/audit-assets.test.ts` - 14 unit tests covering every case in the plan's `<behavior>` block
- `app/_components/audit-asset-gallery.tsx` - Thumbnail strip + lightbox overlay client component
- `app/(app)/admin/projects/[id]/audit/page.tsx` - All five image sites wired to `AuditAssetGallery`; `stepContext` threaded through `AuditTableRow` → `UploadCell`/`ChecklistSubmissionDetails`/`ReadinessSubmissionDetails`; PDF branch, non-image fallbacks, and T-bpp-03 comments preserved byte-for-byte

## Decisions Made
- None beyond what's captured in `key-decisions` above — plan executed as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

All green:
- `npx vitest run tests/lib/audit-assets.test.ts` — 14/14 passed
- `npx tsc --noEmit` — clean (run after each task)
- `npm run lint` — 0 errors (3 pre-existing warnings in unrelated files: `app/layout.tsx`, `netlify/functions/send-call-reminders.mts`, `tests/actions/workflow.test.ts`)
- `npm test` — 39 files, 360 passed + 1 todo (346-passing baseline + 14 new `audit-assets.test.ts` cases = 360, exact match)
- `grep -c 'object-cover'` on the audit page → `0`
- `grep -c 'data:application/pdf'` on the audit page → `1`
- `grep -q 'T-bpp-03'` on the audit page → present
- `git diff -- lib/project-audit.ts` → empty (confirmed via `git diff --stat` and line count)

Manual browser verification (thumbnails render whole, lightbox opens/closes via all three methods, arrows navigate, PDF row still downloads) was intentionally skipped per instructions — deferred to the orchestrator.

## Next Phase Readiness

Feature is complete and fully verified by the automated gate. No blockers. Manual/visual confirmation in a real browser is the only remaining step, owned by the orchestrator.

---
*Phase: quick-260728-lbx*
*Completed: 2026-07-28*

## Self-Check: PASSED

All created files exist on disk; all three task commits (635686a, 1ff08a5, e656182) verified present in git log.
