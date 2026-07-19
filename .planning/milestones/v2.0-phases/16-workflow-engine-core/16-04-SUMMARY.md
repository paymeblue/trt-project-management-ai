---
phase: 16-workflow-engine-core
plan: 04
subsystem: testing
tags: [drizzle, postgres, neon, tsx, cli-harness, workflow-engine, verification]

# Dependency graph
requires:
  - phase: 16-03
    provides: lib/workflow-graph.ts write engine (completeGraphStep + submitYesNoUpload/sendApproval/receiveApproval/assignUser) + actions/workflow-graph.ts
provides:
  - db/seed-workflow-test-graph.ts — isolated graph='test' seed (8 steps, fan-out/join edges) exercising all 4 fulfillment kinds + an optional step + a parallel/join pair
  - scripts/verify-workflow-engine.ts — CLI harness asserting WF-03/WF-04/WF-05 end-to-end against the test graph, exits nonzero on any regression
affects: [16-05, phase-17-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI harnesses that need to import a `server-only`-marked module (lib/workflow-graph.ts) outside Next's webpack build must patch node:module's `Module._load` to short-circuit the `server-only` package's unconditional throw — and must do so via a plain `require()` call (not a static `import`), since tsx's ESM->CJS transform hoists static imports above other top-level statements, which would run the throwing require before any patch could apply"
    - "Test-graph seeds and their harness never touch the 'live' graph — everything is scoped by graph='test' plus uniquely-named throwaway projects, cleaned up (cascade delete) at the end of every run"

key-files:
  created:
    - db/seed-workflow-test-graph.ts
    - scripts/verify-workflow-engine.ts
  modified:
    - package.json

key-decisions:
  - "Actor resolution queries existing users by role first (operations/site_pm/factory_pm/super_admin all existed in this DB) and only creates a throwaway user as a fallback, deleting any it created during cleanup — keeps the harness self-contained without assuming seed data shape"
  - "Two separate throwaway projects prove WF-05's order-independence claim (branch_a-then-b on one project, branch_b-then-a on a second) rather than resetting state mid-run, since project_step_completions has no 'uncomplete' operation and both projects are cheap to create/cascade-delete"
  - "Engine functions are called directly (bypassing actions/workflow-graph.ts's session+role gating) per the plan's own design — this harness proves the engine's business rules (fulfillment gating, skip enforcement, join readiness), not the authorization layer, which was already covered by 16-03"

requirements-completed: [WF-03, WF-04, WF-05]

# Metrics
duration: ~35min
completed: 2026-07-09
---

# Phase 16 Plan 04: Test Graph + Verification Harness Summary

**Isolated `graph='test'` seed (8 steps: all 4 fulfillment kinds + an optional ack + a fan-out/join pair) plus a 25-assertion CLI harness (`npm run verify:workflow-engine`) that drives the real engine end-to-end and exits nonzero on any regression — manually proven not to be a rubber stamp by deliberately breaking a join edge and watching it fail.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-09T12:05:00+01:00
- **Completed:** 2026-07-09T12:41:20+01:00
- **Tasks:** 2 completed
- **Files modified:** 3 (`db/seed-workflow-test-graph.ts`, `scripts/verify-workflow-engine.ts`, `package.json`)

## Accomplishments
- `db/seed-workflow-test-graph.ts` seeds an idempotent 8-step `graph='test'` definition set covering creation, yes_no_upload, an optional ack, approval, assignment, checklist, readiness, and a join ack — with a fan-out (`test_assign` → `test_branch_a` AND `test_branch_b`) converging on `test_join` (2 incoming edges), giving WF-05 a real parallel/join structure to test against
- `scripts/verify-workflow-engine.ts` drives `lib/workflow-graph.ts`'s real read+write engine (no mocks) through 25 assertions across 7 groups, covering every positive and negative path named in the plan: unfulfilled-state rejection, two-party approval (including self-approval rejection), assignee role-mismatch rejection, required-vs-optional skip enforcement, and join actionability in both completion orders on two separate throwaway projects
- Solved a real blocking issue (Rule 3): `lib/workflow-graph.ts` (correctly) starts with `import 'server-only'`, which throws unconditionally when required directly by a Node/tsx CLI (Next's webpack build normally aliases it to an empty module server-side, but a bare `tsx` invocation has no such aliasing) — patched `node:module`'s `Module._load` via a plain `require()` (not a static `import`, which tsx hoists above other statements) to intercept only the `server-only` request, letting the harness import the real engine safely
- Manually proved the harness is not a rubber stamp: deleted the `test_branch_b -> test_join` edge directly in the DB, re-ran the harness (exit 1, the WF-05 "join NOT actionable" assertion failed exactly as expected — got `[test_branch_b, test_join]` instead of `[test_branch_b]`), then re-ran `db:seed-workflow-test-graph` to restore the graph and confirmed a clean exit 0 again
- Verified the 'live' graph (11 definitions, 10 edges, unchanged since plan 02) was never touched by any of this plan's operations, and that harness cleanup leaves zero orphan `ENGINE-TEST-*` project rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Seed the 'test' graph covering every phase capability** - `3a719da` (feat)
2. **Task 2: Verification harness asserting WF-03 / WF-04 / WF-05** - `53ba17a` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `db/seed-workflow-test-graph.ts` - Idempotent seed of `graph='test'`: 8 step definitions (creation → yes_no_upload → optional ack → approval → assignment → fan-out to checklist + readiness → join ack) and 8 edges (linear chain + fan-out + converge). Never touches `graph='live'`.
- `scripts/verify-workflow-engine.ts` - CLI harness: resolves actors by role (creates throwaway users only if missing), creates uniquely-named throwaway projects, asserts 25 positive/negative outcomes across WF-03/WF-04/WF-05, prints a PASS/FAIL line per assertion and a per-group summary, cleans up all its own rows in a `finally` block, exits 1 if any assertion failed.
- `package.json` - Added `db:seed-workflow-test-graph` and `verify:workflow-engine` scripts.

## Decisions Made
- Queried existing users by role rather than assuming seed-script output; this DB already had operations/site_pm/factory_pm/super_admin users, so no throwaway users were created in the final clean run (confirmed via the harness's own cleanup log: "0 throwaway user(s)")
- Used two separate throwaway projects (not one project with mid-run state resets) to prove WF-05's completion-order-independence, since `project_step_completions` has no "uncomplete" operation and creating/cascade-deleting a second project is cheap and simple
- Called the engine functions directly (not through `actions/workflow-graph.ts`'s server actions), matching the plan's explicit interface list — this harness's job is proving the engine's business rules, not re-testing the session/role gating already covered in plan 16-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `server-only` package throws when the engine module is required outside Next's build**
- **Found during:** Task 2, first attempt to `import`/`require` `lib/workflow-graph.ts` from the harness
- **Issue:** `lib/workflow-graph.ts` starts with `import 'server-only'`, which is correct for app code but throws unconditionally (`"This module cannot be imported from a Client Component module..."`) when required directly by plain Node/tsx — Next's webpack build normally aliases `server-only` to an empty module server-side, but a bare CLI invocation has no such aliasing. This blocked the entire harness from importing the engine it needed to test.
- **Fix:** Patched `node:module`'s `Module._load` to intercept only the exact string `"server-only"` and return `{}` instead of loading the real (throwing) module, before requiring `lib/workflow-graph.ts`. Verified empirically that this patch must be applied via a plain `require()` call, not a static `import` statement — tsx's ESM→CJS transform hoists all static `import`s above other top-level code (confirmed via an isolated repro: a `console.log` before a static `import` still printed *after* the imported module's top-level code ran), so a static-import-based patch would apply too late. `require()` calls execute in exact source order, so the patch reliably runs first.
- **Files modified:** `scripts/verify-workflow-engine.ts` (the shim lives entirely in this file; no other file was changed)
- **Verification:** `npm run verify:workflow-engine` imports and calls every `lib/workflow-graph.ts` export successfully; `npx tsc --noEmit` and `npx eslint` both pass clean on the new files
- **Committed in:** `53ba17a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue)
**Impact on plan:** Necessary to make the plan's own explicit instruction ("A tsx script can import them since tsx runs server-side") actually true in practice — the plan's premise was correct in intent (this IS server-side code) but the naive path (a normal `import`) is blocked by `server-only`'s all-or-nothing throw outside of Next's build tooling. No scope creep — the fix is entirely contained inside the one file that needed it.

## Issues Encountered

None beyond the `server-only` blocker documented above, which was resolved within the task.

## User Setup Required

None - no external service configuration required. Ran directly against the existing `.env.local` `DATABASE_URL`.

## Next Phase Readiness
- The engine (`lib/workflow-graph.ts`) is now proven end-to-end against every capability WF-03/WF-04/WF-05 require, on a graph structurally equivalent to what Phase 17's real migration will produce (fan-out/join, optional steps, all 4 new-plus-legacy kinds).
- `db/seed-workflow-test-graph.ts` and `scripts/verify-workflow-engine.ts` are repeatable — re-run `npm run db:seed-workflow-test-graph && npm run verify:workflow-engine` any time to regression-test the engine after future changes (e.g., Phase 17's migration work touching the same tables).
- No blockers. The 'live' graph (11 defs, 10 edges) is unchanged and unaffected by this plan.

---
*Phase: 16-workflow-engine-core*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: db/seed-workflow-test-graph.ts
- FOUND: scripts/verify-workflow-engine.ts
- FOUND: .planning/phases/16-workflow-engine-core/16-04-SUMMARY.md
- FOUND: commit 3a719da (feat(16-04): seed isolated test graph covering all 4 fulfillment kinds)
- FOUND: commit 53ba17a (feat(16-04): add CLI verification harness proving WF-03/WF-04/WF-05)
