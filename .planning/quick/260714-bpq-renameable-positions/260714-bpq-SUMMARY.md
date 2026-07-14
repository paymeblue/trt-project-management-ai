---
phase: quick-260714-bpq
plan: 01
subsystem: positions / admin / workflow-configurator / profile
tags: [db-migration, drizzle, neon-http, positions, super-admin, workflow-graph]
dependency-graph:
  requires: [Phase 19-01 (position enum), Phase 22e (dualRoles/receiverRole)]
  provides: [renameable positions table, positionExists/getPositions/getPositionLabelMap]
  affects: [profile page, admin/users page, workflow configurator, project audit view, workflow/step approval receiver blurb]
tech-stack:
  added: []
  patterns: [db.batch atomic cascade (neon-http), auth-free core + role-gated action wrapper, reserved-keyword-safe raw SQL identifiers]
key-files:
  created:
    - lib/position-slug.ts
    - lib/position-slug.test.ts
    - lib/positions.ts
    - scripts/migrate-positions-table.ts
    - actions/positions.ts
    - scripts/verify-position-rename.ts
    - app/_components/positions-manager.tsx
  modified:
    - db/schema.ts
    - package.json
    - vitest.config.ts
    - app/(app)/admin/users/page.tsx
    - app/(app)/profile/page.tsx
    - actions/profile.ts
    - app/(app)/admin/workflow-configurator/page.tsx
    - app/_components/workflow-configurator-editor.tsx
    - app/_components/workflow-configurator-graph.tsx
    - app/_components/workflow-configurator-shared.tsx
    - app/(app)/workflow/step/page.tsx
    - lib/project-audit.ts
    - tests/lib/project-audit.test.ts
    - lib/workflow.ts
    - scripts/inspect-positions.ts
  deleted:
    - scripts/migrate-position-enum.ts
metrics:
  duration: ~2.5h (retry after a prior stalled attempt made zero changes)
  completed: 2026-07-14
---

# Quick Task 260714-bpq: Renameable Positions Summary

Positions became data. The `position` Postgres enum was retired in favor of a `positions` lookup table (slug PK, label), and a super-admin-only rename action now cascades atomically across `users.position` and both `workflow_step_definitions` position columns via a single `db.batch` (the neon-http driver's `db.transaction()` throws, so `db.batch` is the only genuine atomic cascade available).

## What Shipped

- `lib/position-slug.ts` — pure `slugifyPosition()` (lowercase, non-alphanumeric runs → single underscore, trim). 6 vitest cases, idempotency-tested.
- `lib/positions.ts` — server-only reader: `getPositions()`, `getPositionLabelMap()`, `positionExists()`, `getPositionsWithCounts()`.
- `db/schema.ts` — `positions` table (slug PK, label, createdAt); `users.position` converted from `positionEnum` to plain `text()`; `positionEnum` removed entirely.
- `scripts/migrate-positions-table.ts` — idempotent live migration: seeds `positions` from the live enum values, converts the column, normalizes verbatim legacy values to their slugs, drops the enum type. Guard distinguishes "fully migrated" from "db:push ran first and created an empty shell" (continues seeding in the latter case) and — after a live bug found and fixed at the checkpoint — always attempts the final `DROP TYPE IF EXISTS "position"` even on the already-migrated fast path, so a prior partial run can never leave the enum orphaned.
- `actions/positions.ts` — `renamePositionCore` (auth-free, exercised by the verifier) + `renamePositionAction` (super-admin gated). Validates, slugifies, rejects slug collisions with a different position, then does the atomic `db.batch` cascade (positions + users + required_position + receiver_required_position), returning `{ userCount, stepCount }`.
- `scripts/verify-position-rename.ts` — throwaway-data live verifier: cascade correctness + collision reject.
- `app/_components/positions-manager.tsx` + `admin/users/page.tsx` — Positions card below the users table; super admins get inline rename (live slug preview, "N users and N steps updated" feedback); Operations sees it read-only.
- Profile picker, Configurator "Restrict to a specific title" dropdown (list + graph views), and the project-audit officer-title resolver all now read positions from the DB instead of the static `POSITION_VALUES`/`POSITION_LABELS` tuple/map, which were removed from `lib/workflow.ts`.

## Verification (live, at the Task 3 checkpoint)

1. `npm run db:migrate-positions` — seeded 9 positions from the live enum, converted the column, normalized 6 verbatim values to slugs, dropped the enum.
2. `npm run db:migrate-positions` again — idempotent (no-op, enum-drop re-attempted harmlessly via `IF EXISTS`).
3. `npx drizzle-kit push` twice — both runs report "No changes detected" (positions table + text column match the schema byte-for-byte; no enum left to reconcile).
4. `npm run verify:position-rename` — PASS (9/9 assertions): cascade correctness + collision reject, on throwaway rows.
5. `npm run verify:live-workflow` — PASS (PARITY 23/23 + both dualRoles confirmation orders).
6. SQL spot-check — all 27 real users' positions survived (verbatim legacy titles now slugs: `lead_site_manager`, `designer`, `customer_rep`, `factory_manager`, `head_of_design`, `operations_manager_admin`; the 3 machine slugs unchanged). Live gates intact: `assign_designer_brief`/`design_initiation` (steps 2/5) `required_position=head_designer`; `send_for_production` (step 11) `receiver=chief_production_officer`; `project_review_authorisation` (step 12) `required=chief_production_officer`.

Final gate (post Task 4): grep gate (zero remaining importers of the retired constants) PASS, `npx tsc --noEmit` clean, `npm run lint` clean (1 pre-existing unrelated warning), `npm test` 118 passed / 1 todo across 15 files, `npm run verify:live-workflow` PASS, `npm run build` succeeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `DROP TYPE IF EXISTS position` failed live with a Postgres syntax error**
- **Found during:** Task 3 checkpoint, first live migration run.
- **Issue:** `position` is a reserved SQL keyword (used in the `POSITION(x IN y)` expression grammar); an unquoted bare `DROP TYPE IF EXISTS position` fails to parse (`syntax error at or near "position"`), even though the earlier `CREATE TYPE position AS ENUM(...)` (Phase 19-01's now-retired script) parsed fine unquoted — different grammar path.
- **Fix:** Quoted the identifier (`DROP TYPE IF EXISTS "position"`); also restructured the idempotency guard so the drop is always attempted (not skipped) even on the "already migrated" fast path, so a partial prior run can't leave the enum orphaned forever.
- **Files modified:** `scripts/migrate-positions-table.ts`
- **Commit:** `5caedef`

**2. [Rule 1 - Bug] Collision-reject verifier sub-test never actually exercised a collision**
- **Found during:** Task 3 checkpoint, `verify:position-rename` first run.
- **Issue:** The seeded "colliding" position's slug was hand-constructed with a timestamp suffix while the rename's target label had no timestamp, so `slugifyPosition(newLabel)` never matched the seeded slug — the rename silently succeeded (mutating a real throwaway position for real) instead of being rejected.
- **Fix:** Derive both the seeded collision slug and the rename's target label from the same `slugifyPosition()` call so they always match.
- **Files modified:** `scripts/verify-position-rename.ts`
- **Commit:** `5caedef`
- **Side effect:** The buggy first run left an orphaned `zzz_verify_collision` row in the live `positions` table (no users ever pointed at it). Deleted directly via a throwaway inline script after confirming zero user rows referenced it; the fixed verifier now cleans up correctly on every run (re-run twice post-fix with zero residue).

**3. [Rule 3 - Blocking fix] `app/(app)/workflow/step/page.tsx` — undiscovered 4th consumer of `POSITION_LABELS`**
- **Found during:** Task 4, post-edit grep gate.
- **Issue:** Not in the plan's `files_modified` list. Imports `POSITION_LABELS` to label the approval-step receiver title (e.g. "Chief Production Officer") in the 1/2 sender pane's copy — added by the 260714-iuj phase-aware approval UI plan, committed after 260714-bpq's plan was drafted.
- **Fix:** Replaced with `getPositionLabelMap()` (lib/positions.ts), called once per render alongside the other server-side lookups already in this route.
- **Files modified:** `app/(app)/workflow/step/page.tsx`
- **Commit:** `cc3a245`

**4. [Rule 3 - Blocking fix] Literal grep gate tripped on identifier substrings and historical comment text**
- **Found during:** Task 4, running the plan's literal `! grep -rEn "POSITION_VALUES|POSITION_LABELS|PositionValue" ...` gate.
- **Issue:** The gate does substring matching with no import/comment distinction. It matched: (a) a pre-existing local variable `receiverPositionValue` in `workflow/step/page.tsx` (contains the substring `PositionValue`, unrelated to the retired type), (b) my own retirement-note comments in `lib/workflow.ts`/`lib/project-audit.ts`/`scripts/migrate-positions-table.ts` that named the removed exports, and (c) `scripts/inspect-positions.ts` (untouched historical read-only tooling) whose log/comment strings mention `POSITION_VALUES`.
- **Fix:** Renamed the variable to `receiverRequiredSlug`; reworded the comment/log text in all 4 files to describe the retirement without using the literal matched strings. No behavior change.
- **Files modified:** `app/(app)/workflow/step/page.tsx`, `lib/workflow.ts`, `lib/project-audit.ts`, `scripts/migrate-positions-table.ts`, `scripts/inspect-positions.ts`
- **Commit:** `cc3a245`

**5. [Rule 3 - Blocking fix] `lib/position-slug.test.ts` was co-located but vitest only globbed `tests/**`**
- **Found during:** Task 1, before first commit.
- **Issue:** The plan's `files_modified` places the test at `lib/position-slug.test.ts` (co-located, matching no existing convention — every other test in this repo lives under `tests/`), but `vitest.config.ts`'s `include` was `['tests/**/*.test.ts']` only, so `npm test` would silently never run it.
- **Fix:** Added `'lib/**/*.test.ts'` to the include array.
- **Files modified:** `vitest.config.ts`
- **Commit:** `ee47dcc`

### Not Auto-fixed — Flagged for Human Decision

**[Rule 4 - Architectural] The requested "verification-by-use" rename (`head_designer` → "Head of Design", slug `head_of_design`) is blocked by a genuine live-data collision, not a bug.**

The live `positions` table already holds a DISTINCT position with slug `head_of_design` (label "Head of design", a verbatim legacy title seeded at Phase 19-01 from an inspection of live data) held by a different real user, `j.adedire@trtarredo.com`. The `head_designer` slug (label "Head Designer") is held by a different real user, `head.designer@trtarredo.demo`, and is the one actually gating the live steps `assign_designer_brief`/`design_initiation` (steps 2/5).

I ran the real production rename path (`renamePositionCore`, the exact function the UI calls) directly against the live `head_designer` row with `newLabel: 'Head of Design'`. It correctly returned:
```json
{ "ok": false, "message": "A different position already uses that name — pick another." }
```
No data was mutated — the collision check runs before the atomic batch, exactly as designed (T-bpq-02). This is the collision-reject mitigation working correctly on real production data, not a defect.

Completing the literal instruction as written would require either:
1. **Merging** the two distinct positions (moving `j.adedire@trtarredo.com` onto `head_designer`'s slug, or vice versa) — this changes which real user's account is authorized on live workflow gates, a data/identity decision affecting a real production user, not something to do silently.
2. **Picking a different label** that doesn't collide — but that contradicts the explicit instruction to land on slug `head_of_design`.

Per Rule 4 (architectural changes require a human decision) and the constraint "STOP on any unexpected failure... project state must not change," I did not force either option. **No rename was performed; both positions and all real user assignments are unchanged from the migration's baseline.**

Also completed the paired grep instruction: `db/workflow-live-steps.ts` has **zero** `head_designer` pins to update — that file's `WorkflowStep` type has no `requiredPosition` field at all (it's a Phase-17-era bootstrap-seed array; `requiredPosition`/`receiverRequiredPosition` only exist on the DB-driven `GraphStep` type in `lib/workflow-graph.ts`), and no comment in the file names `head_designer` literally (only `chief_production_officer`, in prose). Nothing to change for parity.

**Recommendation for the user:** decide whether `head_designer` and the legacy `head_of_design` verbatim position should be merged (and if so, which user keeps which title/slug), or whether the rename target label should be something that doesn't collide (e.g. "Head Designer" stays, or picks a slug like `head_of_design_role`). This is a one-line follow-up once decided — call `renamePositionAction({ slug: 'head_designer', newLabel: <chosen> })` from the admin Positions card.

## Known Stubs

None.

## Threat Flags

None — the threat model in the plan already covered every trust boundary touched (renamePositionAction elevation/tampering/DoS, live migration data-loss, and the accepted repudiation gap). No new surface was introduced beyond what's in `<threat_model>`.

## Self-Check: PASSED

- `lib/position-slug.ts`, `lib/position-slug.test.ts`, `lib/positions.ts`, `scripts/migrate-positions-table.ts`, `actions/positions.ts`, `scripts/verify-position-rename.ts`, `app/_components/positions-manager.tsx` — all present on disk.
- `scripts/migrate-position-enum.ts` — confirmed absent (deleted).
- Commits `ee47dcc`, `f34a290`, `5caedef`, `cc3a245` — all present in `git log --oneline`.
- Working tree clean (`git status --short` empty) after this summary is written (summary itself intentionally not committed per instructions).
