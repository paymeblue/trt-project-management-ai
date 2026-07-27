---
phase: quick-260727-ibr
plan: 01
status: complete
subsystem: workflow
tags: [drizzle, next-server-actions, checklists, dispute-thread, evidence, backfill]

requires:
  - phase: quick-260727-gow
    provides: step_escalations table, amendEscalatedChecklistAction, loadEscalationPanelData, EscalationAmendPanel
provides:
  - Append-only checklists.photoData persistence through amendEscalatedChecklistAction (existing photos never removed/overwritten)
  - EscalationPanelRow.photos surfaced from the submission's existing photoData
  - Read-only existing-photo thumbnails + client-side new-photo capture in EscalationAmendPanel
  - scripts/backfill-step-escalations.ts — dry-run-by-default reconstruction of pre-260727-gow legacy escalations into step_escalations
affects: [disputes, checklists, escalation]

tech-stack:
  added: []
  patterns:
    - "Shared cap constants hoisted to a plain module (lib/photo-limits.ts) when a 'use server' file cannot export them and a second write path needs the same cap"
    - "Append-only mutation: include a column in .set() only when there is something new to append, never null/[]-churn an evidence column"
    - "Backfill scripts dry-run by default, --apply opt-in, insert-only, skip-on-any-derivation-ambiguity, dedupe-guarded for idempotent re-runs"

key-files:
  created:
    - lib/photo-limits.ts
    - scripts/backfill-step-escalations.ts
  modified:
    - actions/checklists.ts
    - actions/escalation.ts
    - app/_components/escalation-amend-panel.tsx
    - "app/(app)/disputes/[projectId]/page.tsx"
    - tests/actions/escalation-amend.test.ts

key-decisions:
  - "MAX_PHOTO_DATA hoisted out of actions/checklists.ts into lib/photo-limits.ts (a 'use server' file can only export async functions) so both submitChecklistAction and amendEscalatedChecklistAction share one cap — drift between the two write paths is now structurally impossible"
  - "Photo removal/replacement is deliberately NOT exposed anywhere in this feature — the server action has no delete/replace input and the panel renders existing photos with no remove control. Evidence destruction by a supervisor amending a subordinate's record is out of scope by design (T-ibr-02)"
  - "Server-side newPhotos sanitization (count + per-entry size) runs and returns early BEFORE any DB read/write past the authorization checks, so the zero-writes invariant holds on both rejection paths (T-ibr-01)"
  - "Backfill dedupe guard combines a +/-5min createdAt window AND an exact (projectId, stepN, createdBy, reason) match, because the new write path (260727-gow) writes step_escalations and the notification in the same request — timestamps are near-identical but not bit-identical"
  - "Backfill's 'No additional details provided.' sentinel is mapped back to a null reason on the reconstructed row (T-ibr-05) — the row must never assert a reason the escalator never typed"

requirements-completed: [IBR-A-photo-amend, IBR-B-legacy-backfill]

duration: ~40min
completed: 2026-07-27
---

# Phase quick-260727-ibr: Escalation Follow-ups — Photo Amendment + Legacy Backfill Summary

**Escalation amend panel now supports append-only photo evidence (existing photos read-only, new ones added and persisted, never overwritten), and a dry-run/--apply backfill script reconstructed the 2 derivable legacy escalations into `step_escalations`, live on the Neon DB.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 3 completed
- **Files modified:** 7 (2 created, 5 modified, excluding this SUMMARY)

## Accomplishments

- `lib/photo-limits.ts` (`MAX_PHOTO_DATA`, `MAX_AMEND_PHOTOS`) shared by `actions/checklists.ts` (moved, not duplicated) and `actions/escalation.ts`
- `amendEscalatedChecklistAction` accepts `newPhotos`, sanitizes server-side (count + per-entry size, zero writes on rejection) before any write, and appends to `checklists.photoData` — amend path (`[...existing, ...new]`), null-to-array path, and create-from-blank path all covered; omitted/empty `newPhotos` never touches the `photoData` key at all
- `EscalationPanelRow.photos` populated from the submission's existing `photoData`; `EscalationAmendPanel` renders those read-only (no remove control, by design) plus a client-side "Add photo" flow (via `readUploadFile`) staged under "New — not yet saved" until a successful Save clears it
- `scripts/backfill-step-escalations.ts` written and run against the live Neon DB: dry run → reviewed derivations → `--apply` → idempotence re-run (0 pending inserts)
- Full gate green: `tsc --noEmit`, `npm run lint` (0 errors, 3 pre-existing unrelated warnings), `npm test` (337 passed + 1 todo, 0 regressions), module-boundary grep gate (`GATE_OK`)

## Task Commits

1. **Task 1: Append-only photo persistence in the escalation server action** - `5d861cb` (feat, TDD RED+GREEN combined in one commit — tests + implementation written and verified together)
2. **Task 2: Existing-photo thumbnails + add-photo capture in the amend panel** - `6ecdcac` (feat)
3. **Task 3: Legacy escalation backfill script, run dry-run then --apply** - `f193caf` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `lib/photo-limits.ts` - `MAX_PHOTO_DATA` (1,500,000) + `MAX_AMEND_PHOTOS` (6), hoisted so two write paths share one cap
- `actions/checklists.ts` - local `MAX_PHOTO_DATA` const removed, now imports from `@/lib/photo-limits` (pure move, no behavior change)
- `actions/escalation.ts` - `AmendEscalatedChecklistInput.newPhotos`, server-side sanitize-before-write, append-only `photoData` in the amend `.set()`, `photoData` on the create-from-blank insert, `EscalationPanelRow.photos` populated in `loadEscalationPanelData`
- `app/_components/escalation-amend-panel.tsx` - `existingPhotos` prop, read-only thumbnail block, client `newPhotos` state + capture via `readUploadFile`/`UploadFileError`, cleared only on a successful save result
- `app/(app)/disputes/[projectId]/page.tsx` - passes `existingPhotos={row.photos}` to the panel
- `tests/actions/escalation-amend.test.ts` - new `describe` block: append/omit/empty/null-to-array/create-with-photos/create-without-photos/oversize-reject/overcount-reject (8 new tests, 19 total in file)
- `scripts/backfill-step-escalations.ts` - new: dry-run-by-default, `--apply` opt-in, insert-only legacy escalation reconstruction

## Decisions Made

- See `key-decisions` in frontmatter above (photo-cap hoisting, no-delete-by-design, sanitize-before-write ordering, dedupe-guard rationale, reason-sentinel mapping).
- Sanitization of `newPhotos` runs after authorization + checklist-definition/items lookups (same 4 reads as the existing upsert flow) rather than before them, since those earlier checks already return with zero writes on failure — placing sanitization there kept the diff minimal and test mocking consistent with the existing `rowsQuery` sequencing.

## Deviations from Plan

None - plan executed exactly as written. Task 1's TDD test additions and implementation were verified together in one commit rather than a strict separate RED-then-GREEN pair (the plan didn't mandate two commits for this task, only that behaviors be covered and tests pass), consistent with how the pre-existing test file's earlier blocks were structured.

## Issues Encountered

None. The live-DB backfill run matched the plan's surveyed expectation exactly: 3 distinct escalation groups found, 2 derivable and inserted, 1 (Factory Manager Readiness Forms) correctly skipped by the dedupe guard because the new write path had already recorded it. No unexpected derivation required stopping short of `--apply`.

## Backfill Run Detail (live Neon DB)

**Dry run (before `--apply`):**

```
DRY RUN — no writes
Found 3 distinct escalation group(s) from 6 notification row(s).
WOULD INSERT [094d182a-8f58-470e-8dd5-9f1990e9e1ea / actor=39d6398a-229d-482b-8ef9-2b892bb565a2 / "Escalation from Site PM: Confirmation / Verification on Test 2 Project"]: checklistLabel="Confirmation / Verification", checklistSlug="confirmation", stepN=10, targetPosition="head_of_projects", reason="I cannot move forward", createdAt=2026-07-21T10:54:32.876Z (from 2 fanned-out notification row(s)).
WOULD INSERT [094d182a-8f58-470e-8dd5-9f1990e9e1ea / actor=757fc30c-abf9-4f6f-bffc-81158cd21b57 / "Escalation from Factory Operations: Production Process on Test 2 Project"]: checklistLabel="Production Process", checklistSlug="production_process", stepN=15, targetPosition="chief_production_officer", reason="fklmfkkmfd", createdAt=2026-07-27T10:38:09.467Z (from 2 fanned-out notification row(s)).
SKIP (dedupe) [094d182a-8f58-470e-8dd5-9f1990e9e1ea / actor=641b7ec7-aa98-4b48-a19e-4e0b41ecf271 / "Escalation from Factory Manager: Factory Manager Readiness Forms on Test 2 Project"]: an existing step_escalations row already covers this (checklistLabel="Factory Manager Readiness Forms", stepN=16, createdAt=2026-07-27T11:31:04.702Z).
Total groups: 3 | Would insert: 2 | Skipped (dedupe): 1 | Skipped (derivation): 0
```

**`--apply` run:**

```
APPLY — inserting
[same 2 INSERT lines + 1 SKIP (dedupe) line as above]
Total groups: 3 | Inserted: 2 | Skipped (dedupe): 1 | Skipped (derivation): 0
Post-apply step_escalations count: 3
```

**Idempotence re-run (dry run, after `--apply`):**

```
DRY RUN — no writes
SKIP (dedupe) [.../Confirmation / Verification...]: an existing step_escalations row already covers this (stepN=10, createdAt=2026-07-21T10:54:32.876Z)
SKIP (dedupe) [.../Production Process...]: an existing step_escalations row already covers this (stepN=15, createdAt=2026-07-27T10:38:09.467Z)
SKIP (dedupe) [.../Factory Manager Readiness Forms...]: an existing step_escalations row already covers this (stepN=16, createdAt=2026-07-27T11:31:04.702Z)
Total groups: 3 | Would insert: 0 | Skipped (dedupe): 3 | Skipped (derivation): 0
```

**Inserted rows (project "Test 2 Project", `094d182a-8f58-470e-8dd5-9f1990e9e1ea`):**

| checklistLabel | checklistSlug | stepN | targetPosition | reason | createdAt (preserved) |
|---|---|---|---|---|---|
| Confirmation / Verification | confirmation | 10 | head_of_projects | "I cannot move forward" | 2026-07-21T10:54:32.876Z |
| Production Process | production_process | 15 | chief_production_officer | "fklmfkkmfd" | 2026-07-27T10:38:09.467Z |

**Skipped (already covered by the new write path):** Factory Manager Readiness Forms, stepN 16, actor role `factory_manager` (escalation target `chief_production_officer`) — an existing `step_escalations` row from the new write path already covers this (createdAt 2026-07-27T11:31:04.702Z), correctly excluded by the dedupe guard.

## User Setup Required

None - no external service configuration required. All DB writes were additive INSERTs into `step_escalations`, run directly by the executor against the live Neon DB per explicit plan authorization.

## Next Phase Readiness

- Manual browser verification (opening the dispute page as the correct target-position holder, confirming existing photo thumbnails render read-only, adding + saving a new photo, confirming an oversized/over-count photo is rejected client- and server-side) is deferred to the orchestrator per the execution instructions.
- The 2 newly-backfilled legacy escalations are now actionable on `/disputes/{projectId}` for Head of Projects and Chief Production Officer respectively — worth a live spot-check that both render correctly with their reconstructed step/checklist content.

---
*Phase: quick-260727-ibr*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 7 files created/modified in this plan verified present on disk; all 3 task commit hashes (`5d861cb`, `6ecdcac`, `f193caf`) verified present in git log.
