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
  - "users.position column converted to a DB-enforced Postgres enum, live in production"
  - "scripts/inspect-positions.ts (read-only live-data inspection)"
  - "scripts/migrate-position-enum.ts (additive-safe, idempotent, data-loss-guarded migration script)"
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
  - "POSITION_VALUES finalized as the union of the 3 baseline machine-gating values (head_of_operations, head_designer, chief_production_officer) plus 6 verbatim live values discovered by inspection (Customer Rep, Designer, Factory Manager, Head of design, Lead Site Manager, Operations manager admin) — 9 values total, no junk/placeholder flagged, nothing backfilled to null"
  - "positionEnum declared via `POSITION_VALUES as unknown as [string, ...string[]]` per the plan's literal instruction — this widens the Drizzle insert type back to plain string (not narrowed literals), which is why tsc --noEmit passes cleanly even though actions/admin-users.ts and app/profile/page.tsx still write/read position as free text; narrowing the UI to the enum is explicitly deferred to plan 19-03 per decision D-19-01-A"
  - "requiredPosition / receiverRequiredPosition on workflow_step_definitions stay text() (unchanged) — only users.position converts, per decision D-19-01-A"
  - "A pre-existing, unrelated uncommitted change (quick-260711-01's messageReactions unique-constraint idempotency fix, already applied to db/schema.ts before this plan started) was committed separately first (96fee72) so it would not get bundled into this plan's Task 2 commit"
  - "User approved proceeding with all 9 POSITION_VALUES verbatim, no backfill, including both 'head_designer' and 'Head of design' as distinct retained values"

requirements-completed: [ROLE-04]

# Metrics
duration: ~55min (including a concurrency-caused pause/investigation before Task 3 completed)
completed: 2026-07-11
---

# Phase 19 Plan 01: Position free-text -> DB-enforced Postgres enum Summary

**users.position converted from free text() to a DB-enforced Postgres enum (9 values, live-data-derived), via an idempotent migration script; all 8 real users' position values preserved verbatim; verify:live-workflow PARITY (23/23) + both dualRoles orders pass post-migration.**

## Performance

- **Duration:** ~55 min total (includes an unplanned pause to investigate an unexpected mid-execution finding — see Deviations)
- **Started:** 2026-07-11
- **Tasks:** 3 of 3 completed
- **Files modified:** 2 (lib/workflow.ts, db/schema.ts) + 2 created (scripts/inspect-positions.ts, scripts/migrate-position-enum.ts)

## Accomplishments

- Read-only inspection of the live database's `users.position`, `workflow_step_definitions.required_position`, and `workflow_step_definitions.receiver_required_position` columns — enumerated every distinct value with counts, zero writes performed.
- Derived and encoded the authoritative `POSITION_VALUES` tuple (9 values) in `lib/workflow.ts`, with `PositionValue` type and `POSITION_LABELS` display map for the 3 machine-gating values.
- Added `positionEnum` to `db/schema.ts`, sourced from `POSITION_VALUES`, and retyped `users.position` from `text('position')` to `positionEnum('position')` (still nullable).
- Wrote `scripts/migrate-position-enum.ts`: idempotent (checks `information_schema.columns.udt_name`), pre-flight-guarded (aborts with a thrown error if any live value is uncovered by `POSITION_VALUES` + an explicit, empty `APPROVED_BACKFILL_VALUES` array), and performs `CREATE TYPE` (duplicate-safe) → optional backfill → `ALTER COLUMN ... USING position::text::position`.
- **Migration applied to the live Neon database** — `users.position` is now `udt_name = 'position'` (enum-typed), enum type `position` exists with exactly the 9 approved values in the expected order, and all 8 real users' non-null position values are unchanged.
- Verified post-migration: `npm run db:push` reports "No changes detected" on two consecutive runs (idempotency confirmed); `npx tsx scripts/inspect-positions.ts` re-run confirms row-level integrity (all 8 values unchanged); `npm run verify:live-workflow` PASS (PARITY 23/23, both dualRoles confirmation orders PASS 6/6); `npx tsc --noEmit` clean; `npm run lint` clean (1 pre-existing unrelated warning); `npm test` 77 passed / 1 todo.

## Task Commits

Each task was committed atomically:

1. **Housekeeping (pre-existing, out-of-scope change found in working tree)** - `96fee72` (fix) — committed a pre-existing uncommitted `quick-260711-01` schema fix (messageReactions unique-constraint idempotency) separately so it wouldn't bundle into this plan's Task 2 commit.
2. **Task 1: Inspect live position data and derive the authoritative value set** - `9a966d5` (feat)
3. **Task 2: Add POSITION_VALUES source of truth, positionEnum, and the additive-safe migration script** - `7049c81` (feat)
4. **Task 3: Run the position-enum migration against live Neon and verify integrity + idempotency** - approved by the user; the schema-level ALTER was already live by the time this task's execution began (see Deviations — concurrency side effect), and this task's own work was the verification pipeline (db:push x2, row-integrity re-check, verify:live-workflow, tsc). No new code changes were required — Task 3 produces no additional commit beyond this SUMMARY.

**Plan metadata:** (this commit) — docs: finalize 19-01 summary with actual Task 3 results

## Files Created/Modified

- `scripts/inspect-positions.ts` - Read-only live-data inspection script; SELECT-only, no writes; prints 3 distinct-value sections + proposed POSITION_VALUES + backfill candidates.
- `lib/workflow.ts` - Added `POSITION_VALUES` (9-value tuple), `PositionValue` type, `POSITION_LABELS` map. Existing `Positions` const untouched (additive).
- `db/schema.ts` - Added `positionEnum` pgEnum (imports `POSITION_VALUES` from `@/lib/workflow`); `users.position` column type changed from `text('position')` to `positionEnum('position')`.
- `scripts/migrate-position-enum.ts` - Idempotent, data-loss-guarded migration script (CREATE TYPE → backfill → ALTER COLUMN). Executed against the live database (see below).

## Decisions Made

- See `key-decisions` in frontmatter above. Most notable: the `as unknown as [string, ...string[]]` cast (mandated by the plan) means Drizzle's positionEnum insert type is plain `string`, not a narrowed literal union — this is intentional per the plan and explains why `tsc --noEmit` passes even though app-layer position-writing code (`actions/admin-users.ts`, `app/profile/page.tsx`) hasn't been touched. That narrowing is explicitly plan 19-03's job.
- User approved proceeding with all 9 `POSITION_VALUES` verbatim, no backfill-to-null, explicitly confirming both `head_designer` (machine value) and `Head of design` (a human-typed title) should be retained as distinct values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, TypeScript compile errors] Fixed `db.execute()` result-shape mismatches in migrate-position-enum.ts**

- **Found during:** Task 2 (writing scripts/migrate-position-enum.ts)
- **Issue:** `drizzle-orm/neon-http`'s `db.execute()` returns a `NeonHttpQueryResult<T>` object (with `.rows` and `.rowCount` properties), not a directly-iterable array. Initial destructuring (`const [udtRow] = await db.execute(...)`) and `.map()`/`.length` calls on the raw result failed `tsc --noEmit`.
- **Fix:** Changed to `const result = await db.execute(...); const [udtRow] = result.rows;` and `result.rows.map(...)`, `result.rowCount` for the affected-row count.
- **Files modified:** scripts/migrate-position-enum.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors.
- **Committed in:** 7049c81 (part of Task 2 commit)

### Concurrency Side-Effect Finding (transparently documented, per orchestrator instruction)

**2. [Not a code bug — orchestration/process issue] `positionEnum` ALTER COLUMN was applied to the live DB as an unintended side effect of a concurrent, unrelated executor's verification step, not by this plan's own Task 3 execution**

- **Found during:** Task 3, step 2 (first invocation of `npx tsx scripts/migrate-position-enum.ts`)
- **What was observed:** The script printed `users.position udt_name is already 'position' — migration already ran, nothing to do.` and exited without performing any work, despite this being its first invocation in this session. Direct inspection of the live DB (`information_schema.columns`, `pg_enum`/`pg_type`) confirmed `users.position` was already enum-typed, the `position` enum type already existed with exactly the 9 approved values in the expected order, and all 8 real users' non-null position values were intact — i.e. the database was already in the exact target end-state, with zero data loss.
- **Root cause (per orchestrator investigation):** The orchestrator ran two executors concurrently on the same non-isolated working tree — this plan (19-01) and a parallel "cleanup-deferred-items" quick task, both touching `db/schema.ts`. This plan's Task 2 commit (`7049c81`, landed 21:07:30) put the `positionEnum` change on disk in the shared working tree. The other executor's own (unrelated) plan required running `npx drizzle-kit push --verbose` twice to verify a `message_reactions` constraint fix; `drizzle-kit push` pushes whatever `db/schema.ts` currently holds on disk, not just the invoking task's intended diff. Since the `positionEnum` change was already sitting in the shared tree by then, that unrelated verification push applied the `ALTER COLUMN` conversion as an unintended side effect — not an external actor, not a mystery process, an orchestration/concurrency mistake.
- **Why this was surfaced rather than papered over:** The executor paused Task 3 immediately upon the unexpected "already ran" result, independently verified the live DB state matched the intended target exactly (correct enum values/order, zero data loss), and reported the anomaly for confirmation before proceeding to steps 3-7, rather than assuming success silently.
- **Resolution:** Orchestrator confirmed root cause and the DB state was safe. Task 3 then proceeded through its remaining verification steps (db:push x2 idempotency check, row-integrity re-check, verify:live-workflow, tsc --noEmit) — all passed against the already-migrated state, confirming no corrective action was needed.
- **Files modified:** None (no code change — this is a database-state / process finding, not a code fix)
- **Verification:** Full Task 3 verification pipeline (below) passed against the live, already-migrated state.

---

**Total deviations:** 1 auto-fixed (blocking/TypeScript) + 1 orchestration/concurrency finding (surfaced, root-caused, confirmed safe, no corrective code action required).
**Impact on plan:** No scope creep, no data loss, no incorrect final state. The concurrency finding is a process learning for the orchestrator (avoid running concurrent executors against a shared non-isolated working tree when both touch `db/schema.ts` and either task calls `drizzle-kit push`), not a defect in this plan's own code or migration logic.

## Issues Encountered

The concurrency side effect documented above required a pause mid-Task-3 to investigate before continuing, per explicit instruction not to paper over an unexpected result. Root cause was identified by the orchestrator and confirmed safe by direct DB inspection before resuming.

## Task 3 Verification Results (live Neon database)

All steps run in order, per the plan's `<how-to-verify>`:

1. **Re-run `npx tsx scripts/inspect-positions.ts`** — output identical to the pre-checkpoint inspection (no live data drift). See exact output below.
2. **Run `npx tsx scripts/migrate-position-enum.ts`** — reported already-migrated (idempotency guard fired); confirmed via direct DB inspection that the resulting state exactly matches the intended target (see Deviations #2 above for full explanation).
3. **Run `npm run db:push`** — `[i] No changes detected`. No DROP/RENAME/TRUNCATE or any non-additive proposal on any column.
4. **Run `npm run db:push` a second time** — `[i] No changes detected` again. Idempotency confirmed.
5. **Re-run `npx tsx scripts/inspect-positions.ts`** — all 8 previously non-null users' position values unchanged (`chief_production_officer`, `Customer Rep`, `Designer`, `Factory Manager`, `Head of design`, `head_designer`, `Lead Site Manager`, `Operations manager admin` — one row each).
6. **Run `npm run verify:live-workflow`** — `RESULT: PASS`. PARITY 23/23 (getLiveWorkflowSteps() == LIVE_WORKFLOW_STEPS across all 23 steps). DUAL-ROLE order A (factory_pm → site_pm) PASS 6/6. DUAL-ROLE order B (site_pm → factory_pm, order-independent) PASS 6/6.
7. **`npx tsc --noEmit`** — clean, zero errors.

Additionally verified (not strictly required by the plan's 7-step list, but part of the plan's overall `<verification>` section): `npm run lint` clean (1 pre-existing unrelated warning: `no-page-custom-font` in `app/layout.tsx`).

### Final inspection output (verbatim, post-migration confirmation)

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

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 3 tasks complete. ROLE-04 requirement satisfied: `users.position` is a DB-enforced Postgres enum in production; an out-of-enum insert is now rejected by Postgres itself.
- No real user's position value was lost — all 8 non-null values preserved verbatim; nothing was backfilled to null (none was flagged as junk).
- `POSITION_VALUES` is the single source of truth ready for plan 19-03 to consume in the profile self-service select and the Configurator's position picker.
- The 23 live workflow steps resolve with unchanged parity post-migration; both dualRoles confirmation orders (factory_pm/site_pm) still pass.
- Process note for the orchestrator: avoid concurrent executors on a shared, non-isolated working tree when more than one touches `db/schema.ts` and any of them calls `drizzle-kit push` — that push applies whatever is currently on disk, not just the invoking task's own diff.

---
*Phase: 19-new-roles-assignment*
*Completed: 2026-07-11*

## Self-Check: PASSED

All created files verified present on disk; all recorded commit hashes (96fee72, 9a966d5, 7049c81) verified present in git log; live-DB verification steps (db:push x2, inspect-positions re-run, verify:live-workflow, tsc --noEmit) all executed with output captured above, all passing.
