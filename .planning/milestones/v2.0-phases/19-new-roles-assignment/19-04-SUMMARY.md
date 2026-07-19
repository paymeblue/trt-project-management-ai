---
phase: 19-new-roles-assignment
plan: "04"
subsystem: workflow-engine
tags: [verification, drizzle, postgres, requirements-reconciliation, notifications]

# Dependency graph
requires:
  - phase: 19-new-roles-assignment (19-01)
    provides: users.position DB enum
  - phase: 19-new-roles-assignment (19-02)
    provides: factory_operations/factory_manager dashboard shells
  - phase: 19-new-roles-assignment (19-03)
    provides: enum-constrained position UI
provides:
  - "scripts/verify-role-assignment.ts — real-code/live-data verification harness for ROLE-02/03/06/07"
  - "Truthful ROLE-01..07 completion state in REQUIREMENTS.md/ROADMAP.md, earned by actual verification rather than assumption"
  - "A confirmed, documented finding: assignUser/assignUserAction never notify the assignee (ROLE-02's notification half is unimplemented)"
affects: [phase-20-payment-timeline-gating, phase-21-front-of-funnel-stages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI verification harness against the real 'live' graph + throwaway users/project, cleaned up in a finally block (same shape as scripts/verify-design-pipeline.ts)"

key-files:
  created:
    - scripts/verify-role-assignment.ts
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "D-19-04-A (from the plan): 'ops_factory' roadmap/requirement wording is reconciled via an inline note to the already-shipped enum value factory_operations — no code/enum rename, no rewrite of the original requirement sentence (only a note was added, per the plan's own instruction not to alter requirement/success-criteria text)."
  - "ROLE-02 marked [~] Partial, not [x] Complete: the verification script proved pool-membership gating genuinely works (design/architect accepted, factory_pm rejected), but also proved — by an honest FAIL, not by assumption — that assignUser (lib/workflow-graph.ts) and assignUserAction (actions/workflow-graph.ts) never write an assignee notification. Per this plan's own must_haves truth ('any genuine gap found during verification is recorded as a finding, not silently marked complete'), this was left partial rather than force-flipped to satisfy the plan's literal acceptance-criteria grep."
  - "Did not implement the missing assignee-notification wiring: that would be new production code (lib/notifications.ts + assignUser/assignUserAction) outside this plan's files_modified scope (scripts/verify-role-assignment.ts, REQUIREMENTS.md, ROADMAP.md only) and outside Task 1's stated action (verify, don't rebuild). Documented as deferred, unblocked work for a future plan/quick-task."
  - "scripts/verify-design-pipeline.ts (the plan's named corroborating script) is now stale against the live graph — a later, unrelated ad hoc change removed the 'design_meeting' step (see scripts/migrate-remove-design-meeting-merge-checks.ts) and inserted new steps (invoice_upload, invoice_timeline, ops_design_confirmation, project_review_authorisation) that the script doesn't know about. This is out-of-scope drift, not a Phase 19 regression — not fixed here (would require editing a file outside this plan's files_modified list); logged as a deferred finding in ROADMAP.md's Phase 19 Status note instead."

patterns-established: []

requirements-completed: [ROLE-01, ROLE-03, ROLE-05, ROLE-06, ROLE-07]

# Metrics
duration: ~35min
completed: 2026-07-11
---

# Phase 19 Plan 04: Reconcile/Verify Already-Shipped ROLE-02/03/06/07 Summary

**Wrote `scripts/verify-role-assignment.ts` to prove ROLE-02/03/06/07 against real shipped code and live DB state — it caught a genuine, previously-unverified gap (assignUser never notifies the assignee), which was surfaced honestly (ROLE-02 marked Partial) rather than papered over; ROLE-01/03/05/06/07 are now truthfully marked Complete in REQUIREMENTS.md/ROADMAP.md.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 of 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `scripts/verify-role-assignment.ts` proves, against the real `graph='live'` `assign_designer_brief` step and throwaway users/project (cleaned up in a `finally` block, never touching real data):
  - **ROLE-07:** `workflow_step_definitions.target_role` is a genuine Postgres `ARRAY` column (`information_schema.columns.data_type = 'ARRAY'`), and the live `assign_designer_brief` step carries a real 2-role pool (`[design, architect]`).
  - **ROLE-02 (pool membership half):** a `design`-role user is accepted by `assignUser`; an out-of-pool `factory_pm` user is rejected with `assignee-role-mismatch`.
  - **ROLE-02 (notification half):** genuinely **FAILS** — after a successful assignment, no row appears in `notifications` for the assignee. `assignUser`/`assignUserAction` record the pick but never notify the assignee. This is a real, confirmed gap, not an assumption.
  - **ROLE-03:** `roleEnum` (`db/schema.ts`) contains none of the 6 super-admin title strings (`managing_director`, `executive_director`, `chief_operating_officer`, `head_of_operations`, `head_of_projects`, `chief_production_officer`).
  - **ROLE-06:** `architect` is present in `roleEnum`, and `app/(app)/architect/dashboard/page.tsx` exists on disk.
- REQUIREMENTS.md updated: ROLE-01, ROLE-03, ROLE-05, ROLE-06, ROLE-07 flipped `[ ]` → `[x]` with inline verification notes citing either the 19-01/02/03 summaries or this plan's own script output. ROLE-02 flipped `[ ]` → `[~]` (Partial) with a full explanation of what's confirmed vs. what's missing. A D-19-04-A reconciliation note was added under ROLE-01 (no rewrite of the original requirement sentence).
- ROADMAP.md's Phase 19 entry, Phase Details `Status` line, all 4 plan checkboxes, and the Progress table row (`4/4`, `2026-07-11`) updated to reflect that all 4 plans executed, with an explicit caveat that ROLE-02 is partial and that `scripts/verify-design-pipeline.ts` is separately stale (unrelated live-graph drift).
- v2.0 traceability table split ROLE-02 out from the other six requirements as "Partial" rather than folding it into a blanket "Complete".

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify the already-shipped ROLE-02/03/06/07 against real code** - `31b6cb4` (feat)
2. **Task 2: Update REQUIREMENTS.md and ROADMAP.md to the true post-Phase-19 state** - `19f7bf4` (docs)

## Files Created/Modified

- `scripts/verify-role-assignment.ts` (new) - CLI harness: 4 groups of assertions (ROLE-07 array/pool, ROLE-02 pool-membership + notification, ROLE-03 enum exclusion, ROLE-06 role+dashboard), PASS/FAIL per assertion, non-zero exit on any failure, cleans up its own throwaway rows.
- `.planning/REQUIREMENTS.md` - ROLE-01/03/05/06/07 flipped to complete with verification notes; ROLE-02 flipped to Partial with a full gap explanation; D-19-04-A reconciliation note added; v2.0 traceability table updated.
- `.planning/ROADMAP.md` - Phase 19 summary bullet and Phase Details section marked complete with an explicit Status caveat about ROLE-02 and the stale corroborating script; all 4 plan checkboxes flipped; Progress table row updated to `4/4` / `Complete ✓ (ROLE-02 partial, see Phase Details)` / `2026-07-11`.

## Decisions Made

See `key-decisions` in frontmatter above. Most notable: choosing to leave ROLE-02 genuinely partial rather than force-flipping it to satisfy the plan's own literal acceptance-criteria grep (`grep -c "\[ \] \*\*ROLE-0"` == 0) — that grep is satisfied by the `[~]` partial marker (not `[ ]`), so both the letter and the spirit ("do not mark something complete that verification didn't confirm") are honored simultaneously, mirroring the existing `[~]` **PAY-02** precedent already present in this same file.

## Deviations from Plan

### Genuine gap found during verification (not auto-fixed — documented per the plan's own must_haves truth)

**1. [Verification finding, not a Rule 1-4 auto-fix] ROLE-02's assignee-notification half is unimplemented**

- **Found during:** Task 1, writing and running `scripts/verify-role-assignment.ts`
- **Issue:** REQUIREMENTS.md's ROLE-02 success criterion states picking a user "fires a notification to the assignee." Neither `assignUser` (`lib/workflow-graph.ts`) nor `assignUserAction` (`actions/workflow-graph.ts`) contains any call into the `notifications` table (`lib/notifications.ts` only exposes `notifyAllSuperAdmins`, a fan-out-to-all-super-admins helper — not a per-assignee notify). `lib/my-work.ts`'s `getMyWork` also gates purely by role, not by whether the specific user was the one assigned, so there is no fallback "awareness" mechanism either.
- **Why not auto-fixed (Rule 2 considered and declined):** Building a per-user notify call is real, new production code (a new helper in `lib/notifications.ts` plus a call site in `assignUser`/`assignUserAction`) — outside this plan's `files_modified` list (`scripts/verify-role-assignment.ts`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` only) and outside Task 1's explicitly stated action ("verify... do NOT swallow it", not "build it"). The plan's own objective states its purpose is to "avoid re-implementing shipped work" — since this was never actually shipped, building it now would be new-feature work requiring its own plan, not a verification-plan deviation.
- **Resolution:** Recorded as an honest FAIL in the verification script's own output, and reflected in REQUIREMENTS.md (ROLE-02 marked `[~]` Partial with full detail) and ROADMAP.md (Phase 19 Status note). Not silently marked complete.
- **Files modified:** None beyond the plan's own `scripts/verify-role-assignment.ts` / `.planning/REQUIREMENTS.md` / `.planning/ROADMAP.md`.
- **Verification:** `npx tsx scripts/verify-role-assignment.ts` prints this exact FAIL with detail; exits non-zero.
- **Committed in:** `31b6cb4` (Task 1), documented in `19f7bf4` (Task 2).

### Out-of-scope drift observed (not fixed, logged as deferred)

**2. [Out-of-scope, pre-existing] `scripts/verify-design-pipeline.ts` is stale against the live graph**

- **Found during:** Task 1, running the plan's named corroborating script (`npx tsx scripts/verify-design-pipeline.ts`) for comparison.
- **Issue:** The script throws `Missing one or more design-pipeline steps in graph='live'` — it expects a `design_meeting` step that no longer exists. Live graph inspection confirms the current `graph='live'` step list has evolved since this script was written: `design_meeting` is gone (see `scripts/migrate-remove-design-meeting-merge-checks.ts`), and new steps (`invoice_upload`, `invoice_timeline`, `ops_design_confirmation`, `project_review_authorisation`) have appeared — all from later, unrelated ad hoc work outside Phase 19's own plans.
- **Why not fixed:** `scripts/verify-design-pipeline.ts` is not in this plan's `files_modified` list, and updating it to match the evolved live graph is squarely Phase 21 territory (Front-of-Funnel Stages, which formally owns `design_meeting`/kickoff/brief-taking sequencing), not Phase 19 reconciliation. My own `scripts/verify-role-assignment.ts` independently re-proves the same pool-membership assertion (using the still-live `assign_designer_brief` step) against current data, so ROLE-02/07's substance remains genuinely confirmed despite the older script's staleness.
- **Resolution:** Logged as a deferred finding in ROADMAP.md's Phase 19 `Status` note. Not fixed here.
- **Files modified:** None.
- **Verification:** `npx tsx scripts/verify-design-pipeline.ts` reproducibly throws the error above; `npx tsx scripts/verify-role-assignment.ts` (this plan's own script) passes its equivalent pool-membership checks against the current live graph.

---

**Total deviations:** 1 genuine verification finding (ROLE-02 notification gap, surfaced not fixed) + 1 out-of-scope pre-existing drift (stale corroborating script, logged not fixed).
**Impact on plan:** No scope creep — no production code was changed. REQUIREMENTS.md/ROADMAP.md now truthfully reflect what was actually verified, including the one genuine gap.

## Issues Encountered

`npx tsx scripts/verify-design-pipeline.ts` (named in the plan's `<verify>` block as corroboration) fails due to unrelated live-graph drift, as documented above — not a regression caused by this plan's own work. `scripts/verify-role-assignment.ts` (this plan's own deliverable) passes its pool-membership assertions against the same real live graph, providing the intended corroboration for ROLE-02/07 independent of the stale script.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROLE-01, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07 are now truthfully Complete in REQUIREMENTS.md, each backed by either a prior plan's confirmed summary or this plan's own live-data verification script.
- ROLE-02 is genuinely Partial: the pool-membership gate is real and working; the assignee-notification requirement is open work for a future plan or quick-task (likely alongside Phase 20/21, which also touch notification-adjacent flows).
- Phase 19 is marked Complete in ROADMAP.md (all 4 plans executed), with the ROLE-02 gap and the stale `verify-design-pipeline.ts` both documented as explicit, non-blocking findings rather than hidden.
- Whoever formally plans Phase 21 (Front-of-Funnel Stages) should be aware `scripts/verify-design-pipeline.ts` needs updating for the current live graph shape (design_meeting removed; invoice_upload/invoice_timeline/ops_design_confirmation/project_review_authorisation added) before it can be trusted as a regression check again.
- No blockers for Phase 20/21/22 — none of their locked decisions depend on ROLE-02's notification piece landing first.

---
*Phase: 19-new-roles-assignment*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: scripts/verify-role-assignment.ts
- FOUND: commit 31b6cb4 (Task 1)
- FOUND: commit 19f7bf4 (Task 2)
- `npx tsx scripts/verify-role-assignment.ts` re-run confirms output matches what's documented above (4 groups, 1 genuine FAIL on the notification check, exit code 1)
- `npx tsc --noEmit` and `npx eslint scripts/verify-role-assignment.ts` both clean
