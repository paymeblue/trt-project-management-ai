---
phase: quick-260711-gs6
plan: 01
subsystem: workflow-engine
tags: [drizzle, neon-postgres, next.js, dual-role-confirmation, workflow-configurator]

# Dependency graph
requires:
  - phase: 18-workflow-configurator
    provides: DB-driven step graph (workflow_step_definitions/edges/states), Configurator UI conventions (targetRoles/requiredPosition patterns)
provides:
  - Live Neon DB columns receiver_role, dual_roles (workflow_step_definitions) + confirmed_roles (workflow_step_states)
  - Merged Materials/Delivery Readiness step (dualRoles=[factory_pm, site_pm]) replacing the graph's only parallel branch/join
  - confirmDualRoleStepAs — auth-free core of confirmDualRoleStep, testable from CLI harnesses
  - Configurator UI fields for receiverRole (approval kind) + dualRoles (readiness/checklist kinds)
affects: [phase-19-new-roles-assignment, phase-22-formal-execution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auth-free core extraction: confirmDualRoleStepAs(userId, role) parameterized explicitly so CLI verification harnesses can exercise action-layer mechanics without a request/session context, while the public confirmDualRoleStep still enforces verifySession()"
    - "Live-graph merge migration: same-ids in-place update of survivor step, edge rewire to linear, orderIndex shift-down remap of projects/deadlines/completions (mirrors existing insert-migration remap pattern, applied in reverse for a removal)"

key-files:
  created:
    - scripts/migrate-merge-readiness-dualroles.ts
  modified:
    - db/schema.ts
    - db/workflow-live-steps.ts
    - scripts/verify-live-workflow.ts
    - actions/workflow.ts
    - actions/workflow-config.ts
    - app/_components/workflow-configurator-shared.tsx
    - app/_components/trt-flow-diagram.tsx
    - lib/workflow.ts
    - lib/workflow-graph.ts
    - actions/readiness.ts
    - actions/checklists.ts
    - actions/workflow-graph.ts
    - tests/actions/readiness.test.ts
    - tests/actions/workflow.test.ts
    - tests/lib/workflow.test.ts
    - tests/lib/workflow-live.test.ts
    - .planning/STATE.md

key-decisions:
  - "receiverRole ships Configurator-UI-only for this quick task — no live migration target exists (only approval step is send_for_production, operations->chief_production_officer)"
  - "Fixed a pre-existing, unrelated FK-naming non-idempotency bug (checklist_template_items/checklist_responses) discovered while verifying db:push idempotency, matching the Phase 16 pattern for 3 other FKs"

patterns-established:
  - "Live-graph merge migrations re-verify the live shape immediately before writing mutation logic, rather than trusting the planning snapshot verbatim"

requirements-completed: [Phase-22e-adhoc-dualRoles-receiverRole]

# Metrics
duration: 28min
completed: 2026-07-11
---

# Quick Task 260711-gs6: Finish Phase 22e (dualRoles + receiverRole) Summary

**Merged the live graph's only parallel branch/join into one factory_pm+site_pm dual-confirmation step, pushed 3 additive schema columns to the live Neon DB, and made receiverRole/dualRoles self-serviceable via the Workflow Configurator.**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-07-11T11:22:00Z (approx.)
- **Completed:** 2026-07-11T11:42:28Z
- **Tasks:** 4/4 completed
- **Files modified:** 17 (1 created, 16 modified) across 4 commits

## Accomplishments

- Pushed 3 additive nullable columns to the LIVE production Neon DB (`workflow_step_definitions.receiver_role`, `.dual_roles`, `workflow_step_states.confirmed_roles`) and committed the previously-uncommitted Phase 22e engine diff (lib/workflow.ts, lib/workflow-graph.ts, actions/*.ts, consumer components).
- Wrote and ran `scripts/migrate-merge-readiness-dualroles.ts` — an additive, same-ids, idempotent migration that collapsed the live graph's only parallel branch/join (`factory_manager_readiness` → {`materials_readiness`, `delivery_readiness`} → `delivery_project_check`) into a linear dual-confirmation step. Live graph shrank 24 → 23 steps.
- Updated `db/workflow-live-steps.ts` (parity reference) and `scripts/verify-live-workflow.ts` (replaced stale JOIN tests with dualRoles-confirmation tests in both orders) to match the post-merge graph.
- Exposed `receiverRole` + `dualRoles` as editable Configurator fields (`app/_components/workflow-configurator-shared.tsx`, `actions/workflow-config.ts`), mirroring the existing `targetRoles`/`requiredPosition` UI conventions.
- Recorded the ad hoc work in STATE.md's Decisions log.
- All verification gates green: `tsc --noEmit`, `lint`, `npm test` (77 passed, 1 todo), `npm run verify:live-workflow` (RESULT: PASS — PARITY 23/23 + both dualRoles confirmation orders).

## Task Commits

Each task was committed atomically:

1. **Task 1: Push additive schema columns to live Neon DB and commit the feature diff** - `8c0b7a1` (feat)
2. **Task 2: Write + run the dualRoles merge migration, update parity reference + verify harness** - `beb5be9` (feat)
3. **Task 3: Expose receiverRole + dualRoles as editable Configurator fields** - `3b86e4c` (feat)
4. **Task 4: Full end-to-end verification, STATE.md Decisions bullet** - `54918aa` (docs)

## Files Created/Modified

- `scripts/migrate-merge-readiness-dualroles.ts` - Additive, same-ids, idempotent merge migration (new file)
- `db/schema.ts` - Added 3 nullable columns (receiver_role, dual_roles, confirmed_roles) + fixed 2 pre-existing FK-naming truncation bugs (unrelated to this task's core goal, blocking idempotency verification)
- `db/workflow-live-steps.ts` - Parity reference updated to post-merge 23-step graph
- `scripts/verify-live-workflow.ts` - JOIN tests replaced with dualRoles-confirmation tests (both orders); requires next/cache shim added
- `actions/workflow.ts` - Extracted `confirmDualRoleStepAs` (auth-free core) from `confirmDualRoleStep`
- `actions/workflow-config.ts` - `receiverRole`/`dualRoles` added to Add/UpdateStepInput, passed through to the engine
- `app/_components/workflow-configurator-shared.tsx` - dualRoles checkbox group + receiverRole select in StepFieldsPanel
- `app/_components/trt-flow-diagram.tsx` - Updated `materials_readiness` blurb to describe dual-confirmation; removed orphaned `delivery_readiness` blurb (About page consumer)
- `tests/actions/workflow.test.ts`, `tests/lib/workflow.test.ts`, `tests/lib/workflow-live.test.ts` - Updated hardcoded step counts/numbers (24→23) after the merge
- `.planning/STATE.md` - Ad hoc Decisions bullet documenting this work

## Decisions Made

- **receiverRole has no live migration target.** Live re-inspection (performed fresh at Task 2 execution time, not trusted from planning) confirmed the only approval-kind step in the live graph is still `send_for_production` (operations sends, requiredPosition=head_of_operations, receiverRequiredPosition=chief_production_officer) — there is no factory_pm-sends/site_pm-receives step to attach a receiverRole to. It ships Configurator-UI-only, ready for the next step that needs cross-role send/receive.
- **`confirmDualRoleStepAs` extraction.** `confirmDualRoleStep`'s real mechanics were pulled into an auth-free function taking explicit `userId`/`role`, because `verifySession()` (NextAuth `auth()` + redirect) cannot run in a bare CLI script outside a request context. This mirrors the existing precedent in `verify-live-workflow.ts` of calling `lib/workflow-graph.ts`'s `completeGraphStep` directly (explicit `actorId`) instead of an auth-gated action wrapper. `confirmDualRoleStep`'s public behavior (verify session, then delegate) is unchanged.
- **FK-naming fix scoped to db:push idempotency.** Fixed `checklist_template_items`/`checklist_responses` FK constraint names (>63 chars, silently truncated by Postgres, causing drizzle-kit push to churn every run) as part of Task 1, since it directly blocked the "second push reports no changes" done criterion — same bug class as the 3 FKs already named explicitly in Phase 16.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FK-naming non-idempotency on 2 pre-existing constraints**
- **Found during:** Task 1 (verifying `db:push` idempotency for the additive dualRoles/receiverRole columns)
- **Issue:** `checklist_template_items_definition_id_checklist_definitions_id_fk` (66 chars) and `checklist_responses_template_item_id_checklist_template_items_id_fk` (67 chars) both exceed Postgres' 63-char identifier limit, causing drizzle-kit push to drop+recreate them under a different truncated name on every run — a real, live-observed churn (not merely theoretical), same bug class already fixed for 3 other FKs in Phase 16.
- **Fix:** Named both explicitly as `cti_definition_id_fk` and `cr_template_item_id_fk` in `db/schema.ts`, matching the existing short-name pattern.
- **Files modified:** `db/schema.ts`
- **Verification:** Ran `drizzle-kit push --verbose` twice after the fix — no more DROP/ADD CONSTRAINT statements for these two FKs (a separate, unrelated `message_reactions` unique-constraint churn remains — logged as deferred, out of scope).
- **Committed in:** `8c0b7a1` (Task 1 commit)

**2. [Rule 3 - Blocking] Extracted confirmDualRoleStepAs to unblock CLI verification**
- **Found during:** Task 2 (updating `scripts/verify-live-workflow.ts` to test dual-role confirmation via `confirmDualRoleStep`, per the plan's literal instruction)
- **Issue:** `confirmDualRoleStep` calls `verifySession()` (NextAuth `auth()` + `redirect()`), which cannot run in a bare `tsx` CLI script — there is no request/cookie context. Calling it directly from the harness would throw.
- **Fix:** Extracted the exact same logic into `confirmDualRoleStepAs(opts: {..., userId, role})`, an auth-free core exported alongside the original. `confirmDualRoleStep` now just calls `verifySession()` then delegates. Public behavior for real callers is unchanged.
- **Files modified:** `actions/workflow.ts`, `scripts/verify-live-workflow.ts`
- **Verification:** `npm run verify:live-workflow` exercises `confirmDualRoleStepAs` directly; `npm test` (existing mocked-verifySession unit tests for `confirmDualRoleStep`) still passes unchanged.
- **Committed in:** `beb5be9` (Task 2 commit)

**3. [Rule 1 - Bug] Updated hardcoded step counts in 3 test files after the 24→23 step merge**
- **Found during:** Task 2 (running `npm test` after the migration)
- **Issue:** `tests/lib/workflow.test.ts`, `tests/lib/workflow-live.test.ts`, and `tests/actions/workflow.test.ts` hardcoded step numbers/counts (24, close_out=23, sign_off=24) that referenced the pre-merge graph shape — a direct, blocking consequence of Task 2's change, not a pre-existing/out-of-scope issue.
- **Fix:** Updated counts/numbers to match the post-merge 23-step graph (close_out=22, sign_off=23); added one new assertion confirming `materials_readiness` carries the `delivery_site_readiness` checklist slug.
- **Files modified:** `tests/lib/workflow.test.ts`, `tests/lib/workflow-live.test.ts`, `tests/actions/workflow.test.ts`
- **Verification:** `npm test` — 77 passed, 1 todo.
- **Committed in:** `beb5be9` (Task 2 commit)

**4. [Rule 1 - Bug] Updated the About page's flow-diagram blurb for the merged step**
- **Found during:** Task 2 (post-migration consumer sweep)
- **Issue:** `app/_components/trt-flow-diagram.tsx`'s `DETAIL` map had a `materials_readiness` blurb describing only the factory_pm action, and an orphaned `delivery_readiness` entry that could never match after the merge — informationally incorrect/incomplete for a user-facing page describing live behavior.
- **Fix:** Rewrote the `materials_readiness` blurb to describe the dual-confirmation behavior (both factory_pm and site_pm must confirm); removed the orphaned `delivery_readiness` entry. Staged only this hunk via `git add -p` — the file also carried an unrelated pre-existing uncommitted diff (a label rename) which was deliberately left untouched/uncommitted, out of scope for this task.
- **Files modified:** `app/_components/trt-flow-diagram.tsx` (one hunk only)
- **Verification:** Manual review; `tsc --noEmit` / lint clean.
- **Committed in:** `beb5be9` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 bug/idempotency, 1 blocking/testability, 2 bug/test-and-docs-drift)
**Impact on plan:** All auto-fixes were necessary to complete the plan's own verification gates (idempotent `db:push`, a working CLI dual-role test, and a green `npm test`) or to keep user-facing documentation accurate after the migration. No scope creep beyond what the merge directly required.

## Issues Encountered

- `drizzle-kit push` is a long-running interactive-capable CLI with a spinner; needed to run it in the background and poll the log file rather than block synchronously, since Bash tool sleep chains are restricted. No functional issue, just an execution-mechanics adjustment.
- A separate, pre-existing `message_reactions` unique-constraint churn (drop+recreate same name on every `db:push`, no data loss) was discovered during idempotency verification. Logged as a deferred item (out of scope — unrelated table, predates this session) rather than fixed, per the scope boundary rule.
- `db/seed-workflow-graph.ts` was found to already reference retired step keys (`delivery_project`, `project_check_report`) from a prior session's Phase 22d work — pre-existing and unrelated to this task's file list; logged as deferred rather than fixed.

Both deferred items are documented in `.planning/quick/260711-gs6-finish-phase-22e-dualroles-receiverrole/deferred-items.md`.

## User Setup Required

None - no external service configuration required. The live Neon DB was mutated directly by this task (Tasks 1-2), with explicit user pre-approval per the task constraints, and verified immediately after each mutation.

## Next Phase Readiness

- Phase 22e (dualRoles + receiverRole) is fully shipped: live DB has the 3 new columns, the merged dual-confirmation step is live and verified, and the Configurator lets a super admin set/view both fields without a script.
- `receiverRole` has no live consumer yet — ready for whenever a formal phase introduces a factory_pm/site_pm (or other cross-role) approval step.
- The 2 deferred items (message_reactions constraint churn, stale seed-workflow-graph.ts) are documented and should be picked up in a future formal phase or quick task before `db:seed-workflow-graph` is ever re-run.

---
*Phase: quick-260711-gs6*
*Completed: 2026-07-11*

## Self-Check: PASSED

All 7 files verified present on disk; all 4 task commit hashes (8c0b7a1, beb5be9, 3b86e4c,
54918aa) verified present in git log.
