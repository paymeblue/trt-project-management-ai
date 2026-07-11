---
phase: 19-new-roles-assignment
plan: "01"
subsystem: database
tags: [drizzle, postgres, enum, migration, neon]

# Dependency graph
requires:
  - phase: 17-confirmation-signoff-migration
    provides: workflow_step_definitions.requiredPosition free-text gating already live
provides:
  - "POSITION_VALUES/PositionValue/POSITION_LABELS single source of truth in lib/workflow.ts"
  - "positionEnum pgEnum declaration in db/schema.ts, sourced from POSITION_VALUES"
  - "users.position column retyped from text() to positionEnum() (NOT YET migrated live)"
  - "scripts/inspect-positions.ts (read-only live-data inspection)"
  - "scripts/migrate-position-enum.ts (additive-safe, idempotent, data-loss-guarded migration script — written but NOT run against live DB)"
affects: [19-02-roles-dashboards, 19-03-position-select-configurator, 19-04-reconcile-verify, 20-payment-timeline-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent live-DB migration scripts guarded by an early-exit check (mirrors migrate-insert-design-stages.ts / migrate-merge-readiness-dualroles.ts conventions)"
    - "App-level single-source-of-truth tuple (POSITION_VALUES) backing both a Drizzle pgEnum and downstream UI selects"

key-files:
  created:
    - scripts/inspect-positions.ts
    - scripts/migrate-position-enum.ts
  modified:
    - lib/workflow.ts
    - db/schema.ts

key-decisions:
  - "POSITION_VALUES finalized as the union of the 3 baseline machine-gating values (head_of_operations, head_designer, chief_production_officer) plus 6 verbatim live values discovered by inspection (Customer Rep, Designer, Factory Manager, Head of design, Lead Site Manager, Operations manager admin) — 9 values total, no junk/placeholder flagged"
  - "positionEnum declared via `POSITION_VALUES as unknown as [string, ...string[]]` per the plan's literal instruction — this widens the Drizzle insert type back to plain string (not narrowed literals), which is why tsc --noEmit passes cleanly even though actions/admin-users.ts and app/profile/page.tsx still write/read position as free text; narrowing the UI to the enum is explicitly deferred to plan 19-03 per decision D-19-01-A"
  - "requiredPosition / receiverRequiredPosition on workflow_step_definitions stay text() (unchanged) — only users.position converts, per decision D-19-01-A"
  - "A pre-existing, unrelated uncommitted change (quick-260711-01's messageReactions unique-constraint idempotency fix, already applied to db/schema.ts before this plan started) was committed separately first (96fee72) so it would not get bundled into this plan's Task 2 commit"

requirements-completed: []  # ROLE-04 is PARTIAL — schema/script written, NOT yet run against live DB (Task 3 is a pending blocking checkpoint)

# Metrics
duration: ~35min (Tasks 1-2 only; Task 3 pending human approval)
completed: 2026-07-11
---

# Phase 19 Plan 01: Position free-text -> DB-enforced Postgres enum (Tasks 1-2 of 3) Summary

**Live-data-derived POSITION_VALUES source of truth + positionEnum schema type + idempotent migration script written and verified (tsc/lint/test green) — NOT yet run against the live Neon DB, pending Task 3's blocking human checkpoint.**

## Performance

- **Duration:** ~35 min for Tasks 1-2
- **Started:** 2026-07-11
- **Tasks:** 2 of 3 completed (Task 3 is `checkpoint:human-verify gate="blocking-human"` — intentionally not run)
- **Files modified:** 3 (lib/workflow.ts, db/schema.ts) + 2 created (scripts/inspect-positions.ts, scripts/migrate-position-enum.ts)

## Accomplishments

- Read-only inspection of the live database's `users.position`, `workflow_step_definitions.required_position`, and `workflow_step_definitions.receiver_required_position` columns — enumerated every distinct value with counts, zero writes performed.
- Derived and encoded the authoritative `POSITION_VALUES` tuple (9 values) in `lib/workflow.ts`, with `PositionValue` type and `POSITION_LABELS` display map for the 3 machine-gating values.
- Added `positionEnum` to `db/schema.ts`, sourced from `POSITION_VALUES`, and retyped `users.position` from `text('position')` to `positionEnum('position')` (still nullable, not run live yet).
- Wrote `scripts/migrate-position-enum.ts`: idempotent (checks `information_schema.columns.udt_name`), pre-flight-guarded (aborts with a thrown error if any live value is uncovered by `POSITION_VALUES` + an explicit, currently-empty `APPROVED_BACKFILL_VALUES` array), and performs `CREATE TYPE` (duplicate-safe) → optional backfill → `ALTER COLUMN ... USING position::text::position`.
- Verified: `npx tsc --noEmit` clean, `npm run lint` clean (1 pre-existing unrelated warning only), `npm test` 77 passed / 1 todo.

## Task Commits

Each task was committed atomically:

1. **Housekeeping (pre-existing, out-of-scope change found in working tree)** - `96fee72` (fix) — committed a pre-existing uncommitted `quick-260711-01` schema fix (messageReactions unique-constraint idempotency) separately so it wouldn't bundle into this plan's Task 2 commit.
2. **Task 1: Inspect live position data and derive the authoritative value set** - `9a966d5` (feat)
3. **Task 2: Add POSITION_VALUES source of truth, positionEnum, and the additive-safe migration script** - `7049c81` (feat)

**Task 3 (Run migration against live Neon):** NOT STARTED — blocking human checkpoint, see below.

## Files Created/Modified

- `scripts/inspect-positions.ts` - Read-only live-data inspection script; SELECT-only, no writes; prints 3 distinct-value sections + proposed POSITION_VALUES + backfill candidates.
- `lib/workflow.ts` - Added `POSITION_VALUES` (9-value tuple), `PositionValue` type, `POSITION_LABELS` map. Existing `Positions` const untouched (additive).
- `db/schema.ts` - Added `positionEnum` pgEnum (imports `POSITION_VALUES` from `@/lib/workflow`); `users.position` column type changed from `text('position')` to `positionEnum('position')`.
- `scripts/migrate-position-enum.ts` - Idempotent, data-loss-guarded migration script (CREATE TYPE → backfill → ALTER COLUMN). NOT yet executed against the live database.

## Decisions Made

- See `key-decisions` in frontmatter above. Most notable: the `as unknown as [string, ...string[]]` cast (mandated by the plan) means Drizzle's positionEnum insert type is plain `string`, not a narrowed literal union — this is intentional per the plan and explains why `tsc --noEmit` passes even though app-layer position-writing code (`actions/admin-users.ts`, `app/profile/page.tsx`) hasn't been touched. That narrowing is explicitly plan 19-03's job.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, TypeScript compile errors] Fixed `db.execute()` result-shape mismatches in migrate-position-enum.ts**

- **Found during:** Task 2 (writing scripts/migrate-position-enum.ts)
- **Issue:** `drizzle-orm/neon-http`'s `db.execute()` returns a `NeonHttpQueryResult<T>` object (with `.rows` and `.rowCount` properties), not a directly-iterable array. Initial destructuring (`const [udtRow] = await db.execute(...)`) and `.map()`/`.length` calls on the raw result failed `tsc --noEmit`.
- **Fix:** Changed to `const result = await db.execute(...); const [udtRow] = result.rows;` and `result.rows.map(...)`, `result.rowCount` for the affected-row count.
- **Files modified:** scripts/migrate-position-enum.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors.
- **Committed in:** 7049c81 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking/TypeScript). Plus one out-of-scope housekeeping commit (96fee72) to separate a pre-existing unrelated uncommitted change from this plan's own commits — not a deviation from the plan itself, just git hygiene.
**Impact on plan:** No scope creep. Both actions were necessary to get Task 2's acceptance criteria (`tsc --noEmit` passes) to actually pass, and to keep this plan's commit history clean of unrelated prior work.

## Issues Encountered

None beyond the TypeScript fix documented above.

## CHECKPOINT PENDING — Task 3 (blocking-human)

**Task 3 has NOT been executed.** It requires running `scripts/migrate-position-enum.ts` against the LIVE production Neon database, which holds real user rows with real `position` values. This is a data-integrity decision requiring explicit human sign-off, not a visual/UI checkpoint.

### Inspection output (captured verbatim, `npx tsx scripts/inspect-positions.ts`, run 2026-07-11)

```
=== (a) users.position — distinct non-null values ===
  "chief_production_officer" — 1 row(s)
  "Customer Rep" — 1 row(s)
  "Designer" — 1 row(s)
  "Factory Manager" — 1 row(s)
  "Head of design" — 1 row(s)
  "head_designer" — 1 row(s)
  "Lead Site Manager" — 1 row(s)
  "Operations manager admin" — 1 row(s)

=== (b) workflow_step_definitions.required_position — distinct non-null values ===
  "chief_production_officer" — 1 row(s)
  "head_designer" — 2 row(s)
  "head_of_operations" — 4 row(s)

=== (c) workflow_step_definitions.receiver_required_position — distinct non-null values ===
  "chief_production_officer" — 1 row(s)

=== Proposed POSITION_VALUES (baseline machine values + retained live values) ===
  ['head_of_operations', 'head_designer', 'chief_production_officer', 'Customer Rep', 'Designer', 'Factory Manager', 'Head of design', 'Lead Site Manager', 'Operations manager admin']

=== BACKFILL-TO-NULL candidates ===
  (none flagged)

Done. This script performed NO writes.
```

This exact 9-value set was encoded into `POSITION_VALUES` in `lib/workflow.ts` (commit `7049c81`). No values were flagged as junk/placeholder, so `APPROVED_BACKFILL_VALUES` in `scripts/migrate-position-enum.ts` is currently an empty array — no backfill-to-null is proposed or needed.

### What Task 3 would do next (NOT yet run)

In order, per the plan's `<how-to-verify>`:

1. Re-run `npx tsx scripts/inspect-positions.ts` — confirm the output still matches the above (no live data drift since inspection).
2. Run `npx tsx scripts/migrate-position-enum.ts` — creates the Postgres `position` enum type, skips the (empty) backfill step, then `ALTER TABLE users ALTER COLUMN position TYPE position USING position::text::position`.
3. Run `npm run db:push` — expected to report no changes / additive no-ops only, since the ALTER already ran. ABORT immediately if it proposes any DROP/RENAME/TRUNCATE or non-additive change to any OTHER column.
4. Run `npm run db:push` a second time — must report no changes (idempotency proof).
5. Re-run `npx tsx scripts/inspect-positions.ts` — every previously non-null user must still show its exact position value (row-integrity check).
6. Run `npm run verify:live-workflow` — PARITY must still pass, both dualRoles confirmation orders must still pass.
7. `npx tsc --noEmit` still clean.

### What specifically needs human approval

1. **The backfill-to-null list:** currently EMPTY — no live value was flagged as junk/placeholder. If you disagree and want any of the 9 live values (e.g. "Customer Rep", "Head of design") treated as junk instead of a legitimate title, say so now — that requires editing `APPROVED_BACKFILL_VALUES` in `scripts/migrate-position-enum.ts` before Task 3 runs.
2. **The general go-ahead to ALTER a live column with real user data.** 8 users currently have a non-null `position` value. The migration is additive-safe and idempotent by design (verified via code review — CREATE TYPE is duplicate-safe, the ALTER uses a lossless `USING` cast, and there is a pre-flight abort-on-uncovered-value guard), but it has not yet been executed against the live database in this session.

**Resume signal (per plan):** Reply "approved" to proceed with Task 3's live-DB steps as listed above, or describe any discrepancy/disagreement with the POSITION_VALUES set or backfill list to reconcile first.

## User Setup Required

None - no external service configuration required. Task 3 requires explicit human approval (see above), not external service setup.

## Next Phase Readiness

- Tasks 1-2 complete and committed. Task 3 (live migration) is blocked awaiting explicit human approval of the POSITION_VALUES set and the (currently empty) backfill list.
- Plans 19-02 and 19-03 depend on `positionEnum`/`POSITION_VALUES` existing as code (already true) but plan 19-03's enum-backed UI work should wait until Task 3 actually runs live, so the DB and the app-level type stay in sync.
- ROLE-04 requirement is PARTIAL: the code/schema/script side is done; the DB-enforced clause ("inserting an out-of-enum value is rejected by Postgres") is not yet true in production until Task 3 runs.

---
*Phase: 19-new-roles-assignment*
*Completed: Tasks 1-2 only — 2026-07-11 (Task 3 pending)*

## Self-Check: PASSED

All created files verified present on disk; all recorded commit hashes (96fee72, 9a966d5, 7049c81) verified present in git log.
