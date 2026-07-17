---
phase: quick-260717-cl0
plan: 01
subsystem: checklists
tags: [drizzle, next.js-server-actions, react-useMemo, form-validation]

# Dependency graph
requires: []
provides:
  - Shared pure helpers (missingConditionalPhotos, missingRequiredAnswers, isOptionalFmReadinessItem, FM_READINESS_SLUG) in lib/workflow.ts — single source of truth for the answer-gated photo rule and mandatory-answer rule
  - Per-item photo uploader + Next/Submit gating in checklist-wizard.tsx, scoped to factory_manager_readiness
  - Authoritative server-side enforcement of both rules in actions/checklists.ts
affects: [checklists, factory_manager_readiness, factory-manager workflow step]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure validation helpers in lib/workflow.ts consumed identically by the client wizard (gating Next/Submit) and the server action (authoritative re-check before insert) — client gating is UX only, server never trusts it"
    - "Per-item conditional UI (photo uploader shown only when answers[item.id]?.value === 'yes') scoped by an exported slug constant (FM_READINESS_SLUG) rather than a prop, so the rest of the wizard's render path for every other checklist stays byte-for-byte unchanged"

key-files:
  created: []
  modified:
    - lib/workflow.ts
    - tests/lib/checklist-photo-gate.test.ts
    - app/_components/checklist-wizard.tsx
    - actions/checklists.ts

key-decisions:
  - "Photo requirement gated purely on the answer being 'yes' (not 'no' or unanswered) — confirmed scoping decision carried from the plan"
  - "Material and Accessories are mandatory to answer; Upholstery (matched by label.toLowerCase().includes('upholstery')) stays fully optional both to answer and to photograph"
  - "missingPhotoIds/missingAnswerIds computed via useMemo placed above the wizard's early returns (total===0, state.status==='success') to satisfy react-hooks/rules-of-hooks — hooks must run in the same order every render"
  - "Per-item photos flatten into the existing checklists.photoData array alongside any bulk photos at insert time, preserving the current base64 storage shape rather than introducing a new column"

requirements-completed: [CL0]

# Metrics
duration: ~35min (Task 2 only; Task 1 completed in a prior session)
completed: 2026-07-17
---

# Quick Task 260717-cl0: Fix the Material Readiness Checklist Summary

**Per-item, answer-gated photo capture (1 photo per "yes") plus mandatory-answer gating for Material/Accessories replaces the incorrect flat "attach 3 photos on the last step" rule on the Materials/Accessories Readiness checklist — Upholstery stays fully optional.**

## Performance

- **Duration:** ~35 min (this session, Task 2 only)
- **Tasks:** 2 total (Task 1 completed and merged in a prior session — commit 97a146b, merged as part of d8f2751; Task 2 completed this session)
- **Files modified (Task 2):** 2

## Accomplishments

**Task 1 (prior session, verified present, not redone):** `lib/workflow.ts` exports `FM_READINESS_SLUG`, `isOptionalFmReadinessItem`, `missingConditionalPhotos`, `missingRequiredAnswers`; `REQUIRED_PHOTOS['factory_manager_readiness']` removed. Confirmed via grep before starting Task 2 and via the 13 passing tests in `tests/lib/checklist-photo-gate.test.ts` (11 spec'd cases plus 2 extra, all green).

**Task 2 (this session):**
- `app/_components/checklist-wizard.tsx`: added `photosByItem` state (per-item, capped at 1 photo) and a compact photo uploader (reusing the existing `downscaleImage` + thumbnail/remove pattern), rendered under any item on `factory_manager_readiness` whose current answer is `'yes'`.
- Next button now blocks per-step when any item on the current step is in `missingAnswerIds` or `missingPhotoIds` (via `missingRequiredAnswers`/`missingConditionalPhotos`), with a `title` distinguishing "Answer this item before continuing" vs. "Attach a photo before continuing", plus an inline error under an unanswered item.
- Submit button blocks overall on the same two arrays being non-empty, with a summary paragraph on the last step naming exactly which item labels still need an answer vs. a photo.
- Submit dispatch now also sends `photosByItem` alongside the existing `photos` bulk array.
- Because `REQUIRED_PHOTOS` no longer has an entry for this slug, `requirePhotos` is `0` and the legacy bulk 3-photo block on the last step no longer renders for this checklist — not reintroduced.
- `app/(app)/checklists/[slug]/page.tsx`: verified no change needed — `REQUIRED_PHOTOS[def.slug] ?? 0` already yields `0` for this slug now that Task 1 removed the entry.
- `actions/checklists.ts`: `SubmitChecklistInput` extended with `photosByItem?: Record<string, string[]> | null`. Server-side sanitization filters to `data:image/`-prefixed strings, caps at 1 per item, and reuses the existing `MAX_PHOTO_DATA` size check. Both authoritative gates (`missingRequiredAnswers`, `missingConditionalPhotos`) run before the DB insert and reject with a clear message if either finds outstanding items — the client's gating is never trusted. Per-item photos flatten into the existing `checklists.photoData` array alongside any bulk photos at insert time.

## Task Commits

1. **Task 1: Add shared answer-gated photo helper + mandatory-answer helper, and unit tests** — `97a146b` (feat) — completed and merged in a prior session (merge commit `d8f2751`), not redone this session.
2. **Task 2: Wire per-item photo capture, photo gating, and mandatory-answer gating into wizard and server action** — `46953ce` (feat)

## Files Created/Modified
- `lib/workflow.ts` — (Task 1, prior session) `FM_READINESS_SLUG`, `isOptionalFmReadinessItem`, `missingConditionalPhotos`, `missingRequiredAnswers` exported; `REQUIRED_PHOTOS['factory_manager_readiness']` removed.
- `tests/lib/checklist-photo-gate.test.ts` — (Task 1, prior session) unit tests for both helpers.
- `app/_components/checklist-wizard.tsx` — (Task 2) per-item photo uploader, Next/Submit gating, `photosByItem` in submit dispatch.
- `actions/checklists.ts` — (Task 2) `photosByItem` in `SubmitChecklistInput`, server-side sanitization, both authoritative gates, flattened photo persistence.

## Decisions Made
- `missingPhotoIds`/`missingAnswerIds` `useMemo` calls were placed above the wizard's early returns (`total === 0`, `state.status === 'success'`) rather than after them — the plan's action text implied computing them inline with the render logic, but React's rules-of-hooks require every hook call in the same order on every render; computing them after a conditional `return` would call `useMemo` conditionally. Verified with `npm run lint` (react-hooks/rules-of-hooks caught this before the fix; clean after).
- Per-item photo uploader UI only renders for `radio`-type items answered `'yes'` under `factory_manager_readiness` (all three seeded items — Material, Accessories, Upholstery — are `radio` type in the current schema), matching the plan's interface note that item types beyond radio aren't in scope for this checklist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useMemo` called conditionally, violating react-hooks/rules-of-hooks**
- **Found during:** Task 2, `npm run lint` verification step
- **Issue:** The initial implementation placed `missingConditionalPhotos`/`missingRequiredAnswers` `useMemo` calls after the wizard's two early `return` statements (`total === 0` and `state.status === 'success'`), which ESLint's `react-hooks/rules-of-hooks` correctly flagged as an error — hooks must run in the same order every render, and an early return before a hook call violates that.
- **Fix:** Moved both `useMemo` calls above both early returns (immediately after the existing `progress` `useMemo`), removed the now-duplicate later declarations, and left everything else (dependent plain variables like `currentStepMissingAnswer`, `labelById`) below, since those aren't hooks and don't need to run unconditionally.
- **Files modified:** `app/_components/checklist-wizard.tsx`
- **Verification:** `npm run lint` clean (0 errors; 4 pre-existing unrelated warnings), `npx tsc --noEmit` clean, `npx vitest run tests/lib/checklist-photo-gate.test.ts` still 13/13 passing.
- **Committed in:** `46953ce` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — blocking bug caught by lint before commit). No scope creep; the fix was required for the task's own verify command to pass.

## Issues Encountered
None beyond the auto-fixed hooks-ordering issue documented above.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- All 5 `must_haves.truths` from the plan are satisfied: the flat 3-photo rule is gone; each "yes"-answered item requires exactly 1 photo (client-gated + server-enforced); Material and Accessories are mandatory to answer (client-gated + server-enforced); Upholstery is fully optional (unanswered submits fine, "yes" requires 1 photo like every other item); no other checklist slug's behavior changed (every new gate/uploader is guarded by `slug === FM_READINESS_SLUG`, and `production_process`'s bulk-photo path and every other slug's Next/Submit logic are untouched).
- Automated verification green: `npx vitest run tests/lib/checklist-photo-gate.test.ts` (13/13), `npm run lint` (0 errors, 4 pre-existing unrelated warnings), `npx tsc --noEmit` (clean).
- Manual/live-browser verification (open `/checklists/factory_manager_readiness`, confirm Next/Submit gating and the "attach 3 photos" text is gone, regression-check `production_process`/`delivery_project`) was NOT performed this session — flagged here as the one item from the plan's `<verification>` section not automated, for a follow-up smoke test before this ships to users.
- No blockers for other in-flight work.

---
*Phase: quick-260717-cl0*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: lib/workflow.ts
- FOUND: tests/lib/checklist-photo-gate.test.ts
- FOUND: app/_components/checklist-wizard.tsx
- FOUND: actions/checklists.ts
- FOUND: .planning/quick/260717-cl0-fix-the-material-readiness-checklist-for/260717-cl0-SUMMARY.md
- FOUND commit: 97a146b
- FOUND commit: 46953ce
