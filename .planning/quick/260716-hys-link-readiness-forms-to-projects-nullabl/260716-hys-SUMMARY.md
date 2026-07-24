---
phase: quick-260716-hys
plan: 01
subsystem: database
tags: [drizzle, postgres, neon, audit, readiness-forms]

# Dependency graph
requires:
  - phase: quick-260714-bpp
    provides: Super-admin per-project audit page (getProjectAudit/assembleAuditRows, ChecklistSubmissionDetails/UploadCell rendering conventions, T-bpp-03 data:image/ safety treatment)
provides:
  - readiness_forms.project_id nullable FK column (live, pushed, idempotent)
  - submitReadinessAction persists projectId on new submissions
  - Audit loader joins project-linked readiness_forms and attaches them to readiness-kind steps
  - ReadinessSubmissionDetails rendering on /admin/projects/[id]/audit for materials_readiness
affects: [future audit-page work, future readiness_forms schema changes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nullable project-linking FK on a historically unlinked table, going-forward only (no backfill), mirroring checklists.projectId"

key-files:
  created: []
  modified:
    - db/schema.ts
    - actions/readiness.ts
    - lib/project-audit.ts
    - "app/(app)/admin/projects/[id]/audit/page.tsx"
    - tests/lib/project-audit.test.ts

key-decisions:
  - "No backfill of historical readiness_forms rows — the pre-existing free-text project column is not a reliable join key; those rows remain project_id = null permanently, an accepted gap"
  - "readinessSubmissions attached to a step only when step.kind === 'readiness' (currently the sole live user is materials_readiness); no per-step slug disambiguation built since only one step needs it today"

patterns-established:
  - "Readiness form audit rendering mirrors ChecklistSubmissionDetails' <details>/<summary> pattern and reuses the T-bpp-03 image-only inline-render safety rule for data: uploads"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-07-16
---

# Phase quick-260716-hys: Link Readiness Forms to Projects (Nullable) Summary

**Added a nullable `readiness_forms.project_id` FK, wired it into new Factory PM readiness submissions, and surfaced those submissions (photos/signature/legacy scan) on the super-admin project audit page under the materials_readiness step.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-16T14:30:00+01:00 (approx, worktree branch check)
- **Completed:** 2026-07-16T14:41:20+01:00
- **Tasks:** 3 (2 code tasks + 1 verification sweep)
- **Files modified:** 5

## Accomplishments

- `readiness_forms` gained a nullable `project_id uuid` FK to `projects.id`, pushed live to Neon as a single additive `ALTER TABLE ADD COLUMN` + FK constraint, confirmed idempotent on a second `db:push`, and confirmed via direct DB inspection that all 4 existing rows kept `project_id = null` (zero data loss).
- `submitReadinessAction` (`actions/readiness.ts`) now persists the caller's `projectId` on every new readiness form insert.
- `lib/project-audit.ts`'s `getProjectAudit` loader now joins project-linked `readiness_forms` rows and `assembleAuditRows` attaches them (as `readinessSubmissions`) only to `kind: 'readiness'` steps — currently just `materials_readiness`.
- `/admin/projects/[id]/audit` renders a new `ReadinessSubmissionDetails` collapsible per submission (mode, confirmed-by, signed date, signature image, legacy scan, required photos), reusing the existing T-bpp-03 safety rule (non-image `data:` uploads render as filename text only, never a clickable link).
- Extended `tests/lib/project-audit.test.ts` with a test proving `readinessSubmissions` attaches only to readiness-kind steps and stays empty on other step kinds.
- Replaced the stale "KNOWN LIMITATION: readiness_forms has no project_id" comment in `lib/project-audit.ts` with an accurate going-forward note.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add nullable project_id to readiness_forms, push, and persist it on new submissions** - `2ad24c4` (feat)
2. **Task 2: Join readiness submissions into the audit loader and render them on the audit page** - `b1ee555` (feat)
3. **Task 3: Full verification sweep** - no code changes, verification only (tsc/lint/vitest all green, no commit needed)

**Plan metadata:** (docs commit handled by orchestrator, not this executor)

## Files Created/Modified

- `db/schema.ts` - `readinessForms.projectId` nullable uuid FK to `projects.id`, added after `createdBy`
- `actions/readiness.ts` - `submitReadinessAction` persists `input.projectId` on insert
- `lib/project-audit.ts` - `AuditReadinessSubmission` type, `readinessSubmissions`/`readinessSubmissionsForProject` wiring, joined `readinessForms` query in `getProjectAudit`, replaced stale limitation comment
- `app/(app)/admin/projects/[id]/audit/page.tsx` - new `ReadinessSubmissionDetails` component + render call in `AuditTableRow`
- `tests/lib/project-audit.test.ts` - extended `emptyInput` fixture + new readiness-kind attachment test

## Decisions Made

- No backfill of historical rows — confirmed by direct DB inspection (4 rows, all now `project_id = null`, unchanged by the migration).
- Defensive pre-push read-only check performed first (per the concurrent-live-DB-editor risk noted in the dispatch instructions): confirmed `readiness_forms` did not already have a `project_id` column and matched the expected pre-change schema before running `db:push`.
- Worktree had no local `.env.local` (gitignored, not copied by `git worktree`) — a symlink to the main checkout's `.env.local` was created temporarily to run `drizzle-kit push` and the throwaway inspection scripts, then removed after Task 1/3 verification completed. Never committed (already covered by `.gitignore`'s `.env*` pattern).

## Deviations from Plan

None - plan executed exactly as written. The plan's own Task 1 instructions anticipated the non-TTY `db:push` behavior; it applied the single expected `ALTER TABLE ... ADD COLUMN "project_id"` + FK constraint statement directly (no interactive prompt encountered), which was verified to be the ONLY diff before and after via `--verbose` output and a second idempotent push.

## Issues Encountered

- The git worktree does not include `.env.local` (correctly gitignored), so `DATABASE_URL` was unavailable for `drizzle-kit push` and the read-only inspection scripts by default. Resolved by temporarily symlinking the worktree's `.env.local` to the main checkout's `.env.local`, then removing the symlink once verification finished (not committed, not part of the deliverable file set).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `readiness_forms.project_id` is live and populated going forward; the audit page now shows Factory PM readiness uploads for `materials_readiness`.
- No blockers. Historical readiness rows remain unlinked by design (documented, accepted gap).

---
*Phase: quick-260716-hys*
*Completed: 2026-07-16*

## Self-Check: PASSED

All created/modified files confirmed present on disk; both task commit hashes (`2ad24c4`, `b1ee555`) confirmed present in git log.
