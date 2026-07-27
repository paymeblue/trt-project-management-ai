---
phase: quick-260727-dps
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - db/workflow-live-steps.ts
  - db/seed-workflow-graph.ts
  - scripts/verify-workflow-engine.ts
  - scripts/verify-design-pipeline.ts
autonomous: true
requirements: [AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04]

must_haves:
  truths:
    - "npm run verify:live-workflow exits 0 (canonical array matches live DB)"
    - "npm run verify:workflow-engine exits 0 (harness records fulfillment before completing state-gated steps)"
    - "npx tsx scripts/verify-design-pipeline.ts exits 0 (no design_meeting dependency)"
    - "Running db/seed-workflow-graph.ts without --force aborts before deleting anything when graph='live' already has definitions"
    - "Zero runtime app behavior changes — lib/, app/, actions/, components/ untouched"
  artifacts:
    - path: "db/workflow-live-steps.ts"
      provides: "Canonical 21-step live bootstrap array with confirmation_correction slug"
      contains: "confirmation_drawing"
    - path: "db/seed-workflow-graph.ts"
      provides: "Seeder matching the current 21-step / 20-edge live chain + --force guard"
      contains: "--force"
    - path: "scripts/verify-workflow-engine.ts"
      provides: "Engine harness that fulfills checklist/readiness/ack kinds before completion, plus a regression lock"
      contains: "recordAdditionalRequirement"
    - path: "scripts/verify-design-pipeline.ts"
      provides: "Design pipeline harness aligned with the post-merge live graph"
  key_links:
    - from: "scripts/verify-workflow-engine.ts"
      to: "lib/workflow-graph.ts recordAdditionalRequirement"
      via: "wg.recordAdditionalRequirement call before completeGraphStep"
      pattern: "wg\\.recordAdditionalRequirement"
    - from: "db/seed-workflow-graph.ts"
      to: "db/workflow-live-steps.ts LIVE_WORKFLOW_STEPS"
      via: "import + 1:1 structural insert"
      pattern: "LIVE_WORKFLOW_STEPS"
---

<objective>
Sync the workflow canonical array, the structural seeder, and the two CLI verification harnesses with the live graph as it actually exists on 2026-07-27. All four are stale relative to migrations already applied; three of them fail today, and the seeder would destroy the live graph if run.

Purpose: restore green verification harnesses so future workflow changes have a working parity/regression net, and defuse a destructive stale seeder.
Output: four edited files (one seed-data entry, one seeder, two scripts). Zero runtime app behavior change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@db/workflow-live-steps.ts
@db/seed-workflow-graph.ts
@scripts/verify-workflow-engine.ts
@scripts/verify-design-pipeline.ts
@.planning/quick/260727-dps-sync-workflow-canonical-array-seeder-and/live-edges-actual.txt

<interfaces>
<!-- Contracts the executor needs. Extracted from the codebase — no exploration required. -->

From lib/workflow.ts:
  export const STATE_GATED_KINDS: StepKind[] =
    ['yes_no_upload', 'approval', 'assignment', 'ack', 'readiness', 'checklist']
  // The 2026-07-22 fix added 'ack' | 'readiness' | 'checklist'. This is
  // INTENTIONAL and MUST NOT be changed by this task.

From lib/workflow-graph.ts:
  export async function recordAdditionalRequirement(opts: {
    projectId: string
    stepDefId: string
    actorId: string
    kind: 'ack' | 'readiness' | 'checklist'
  }): Promise<void>

  export async function completeGraphStep(opts: {
    projectId: string; stepDefId: string; actorId: string; skip?: boolean
  }): Promise<{ ok: true; actionable: { key: string }[] }>
  // Throws 'step-not-fulfilled' when any STATE_GATED_KIND in
  // stepRequiredKinds(step) is absent from workflow_step_states.fulfilledKinds.

  export async function getStepByKey(graph: string, key: string):
    Promise<{ id: string; requiredPosition: string | null; targetRoles: string[] | null } | null>

From db/seed-workflow-test-graph.ts (graph='test' fixture — DO NOT EDIT):
  test_branch_a — role site_pm,     kind 'checklist', checklistSlug 'sorting'
  test_branch_b — role factory_pm,  kind 'readiness'
  test_join     — role super_admin, kind 'ack'
  edges: test_assign -> {test_branch_a, test_branch_b}; both -> test_join
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync canonical array entry + rebuild the seeder with a destructive-run guard</name>
  <files>db/workflow-live-steps.ts, db/seed-workflow-graph.ts</files>
  <action>
Two edits, both seed/bootstrap data only — neither file is imported by app runtime code.

**A. db/workflow-live-steps.ts (AUDIT-01)** — the step 11 entry `confirmation_correction` (currently lines ~206-211) is missing its `slug`. Live DB has `checklist_slug='confirmation_drawing'`, and `scripts/verify-live-workflow.ts` compares n/key/label/role/kind/slug, so parity fails today. Add `slug: 'confirmation_drawing',` to that entry. Add a dense why-comment on the entry, tagged `quick task 260727-dps`, recording that the live row ALSO carries `additionalKinds=['checklist']`, which is not representable on the base `WorkflowStep` type (same existing convention already used for the invoice_upload, ops_design_confirmation, and materials_readiness entries) — migrations patch that column; the parity check does not cover it. Change nothing else in this file's entries.

**B. db/seed-workflow-graph.ts (AUDIT-02)** — the file is stale and destructive. Its header claims 22 steps (live has 21); its EDGES list references three step keys that no longer exist in `LIVE_WORKFLOW_STEPS` (`installation_readiness`, `sorting`, `close_out`), omits `set_delivery_timeline` and `installation_process`, and mis-positions `confirmation`. Because `main()` deletes ALL `graph='live'` edges and definitions up front (cascading to `workflow_step_states` via FK), running it today wipes the live graph and then crashes on the first missing key. Fix:

1. Replace the `EDGES` array with the exact 20-edge chain from `live-edges-actual.txt` (authoritative dump taken 2026-07-27), preserving the existing `[fromKey, toKey]` tuple format and ordering.
2. Correct every "22 steps" / "22 keys" mention in the file header and in the two inline comments (lines ~2, ~12, ~67, ~91) to 21 steps / 20 edges, and append a `quick task 260727-dps` note to the header stating the array was re-synced from a live dump on 2026-07-27 after quick task 260714-qe4's restructure left it stale.
3. Add a fail-loud safety guard as the FIRST statement inside `main()`, BEFORE the two `db.delete(...)` calls: count existing `workflowStepDefinitions` rows where `graph = GRAPH`. If the count is greater than zero AND `process.argv` does not include `--force`, `console.error` a message naming the count and stating that re-seeding deletes all live step definitions, edges, and (via FK cascade) every project's `workflow_step_states`, then `process.exit(1)`. Re-running destructively must require an explicit `--force` argv flag. Comment the guard densely with the `quick task 260727-dps` tag explaining that the seeder is bootstrap-only and that a bare `npm run db:seed-workflow-graph` against a populated live graph is data loss, not idempotence.
4. Sync the two per-step config maps with the live rows so a `--force` re-seed reproduces the graph faithfully rather than a stale one. Do NOT guess the values — read them from the live DB read-only first (a throwaway `tsx` one-liner selecting `step_key, additional_kinds, target_roles, required_position, checklist_slug` from `workflow_step_definitions` where `graph='live'`), then mirror exactly what is there into `ASSIGNMENT_STEP_CONFIG` and `ADDITIONAL_KINDS_CONFIG`. Widen those two `Record<...>` value types only as far as the live data requires. Do not issue any write/DDL statement against the live DB during this task.

Preserve the existing code style (no semicolons in these db/ files, single quotes).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npm run verify:live-workflow && npx tsx db/seed-workflow-graph.ts; test $? -ne 0 && echo GUARD_BLOCKED_AS_EXPECTED</automated>
  </verify>
  <done>`npm run verify:live-workflow` exits 0. A bare `npx tsx db/seed-workflow-graph.ts` exits non-zero with the guard message and performs no deletes (live graph still has 21 definitions / 20 edges afterwards, confirmed by re-running verify:live-workflow).</done>
</task>

<task type="auto">
  <name>Task 2: Fix the workflow-engine harness to record fulfillment, and lock the 07-22 gate with a regression assertion</name>
  <files>scripts/verify-workflow-engine.ts</files>
  <action>
AUDIT-03. `npm run verify:workflow-engine` fails 7 assertions. Cause: the 2026-07-22 fix added `'checklist' | 'readiness' | 'ack'` to `STATE_GATED_KINDS`, so `completeGraphStep` now correctly throws `'step-not-fulfilled'` for `test_branch_a` (checklist), `test_branch_b` (readiness), and `test_join` (ack) unless the kind is present in `workflow_step_states.fulfilledKinds`. The harness calls `completeGraphStep` on all three with no fulfillment recorded. The engine behavior is CORRECT and MUST NOT be changed — only the harness is wrong, because it never mirrored what the live app does (`actions/checklists.ts` partial-fulfillment branch / `submitAdditionalRequirementAction`).

Edits:

1. Add a small local helper (e.g. `fulfillKind(projectId, stepDefId, actorId, kind)`) that wraps `wg.recordAdditionalRequirement`, so the mirroring is stated once and every call site reads identically.
2. Before each of the four now-failing `completeGraphStep` calls on state-gated sole-kind steps, record the step's kind first:
   - main project: `test_branch_a` -> `'checklist'` (actor sitePm), `test_branch_b` -> `'readiness'` (actor factoryPm), `test_join` -> `'ack'` (actor superAdmin)
   - second/order-independence project: `test_branch_b` -> `'readiness'`, `test_branch_a` -> `'checklist'`
   Keep the existing assertion labels' intent but drop the now-wrong "(ungated)" wording from the two labels that carry it — these kinds ARE gated as of 2026-07-22.
3. Add ONE new assertion group, placed on the second (order-independence) project immediately after `advanceToBranchPoint` and BEFORE any fulfillment is recorded there, labelled as a regression lock on the 2026-07-22 STATE_GATED_KINDS fix. It uses the existing `assertThrows(label, fn, expectedMessage)` helper to prove `completeGraphStep` on `test_branch_a` with no fulfillment record throws `'step-not-fulfilled'`. Then proceed with the existing reverse-order flow (record `readiness` for branch_b, complete it, then record `checklist` for branch_a, complete it) so the negative assertion does not disturb the order-independence proof.
4. Update the file's header docblock: note under WF-05 (tagged `quick task 260727-dps`) that checklist/readiness/ack are state-gated since 2026-07-22, that the harness therefore records fulfillment exactly as the live actions do, and that the new negative assertion exists so a regression in `STATE_GATED_KINDS` fails this harness loudly.

Do not change `advanceToBranchPoint`'s existing calls (it stops at `test_assign`, before the branch steps). Do not touch `db/seed-workflow-test-graph.ts`. Do not modify `lib/`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npm run verify:workflow-engine</automated>
  </verify>
  <done>`npm run verify:workflow-engine` exits 0, prints RESULT: PASS, and the run includes a passing assertion that `completeGraphStep` on an unfulfilled sole-kind checklist step throws `step-not-fulfilled`. `lib/workflow.ts` and `lib/workflow-graph.ts` are unmodified (`git diff --name-only` shows neither).</done>
</task>

<task type="auto">
  <name>Task 3: Drop the removed design_meeting step from the design-pipeline harness, then run the full verification sweep</name>
  <files>scripts/verify-design-pipeline.ts</files>
  <action>
AUDIT-04. The harness throws at startup because it requires a `live` step `design_meeting` that `scripts/migrate-remove-design-meeting-merge-checks.ts` removed (v2.0 Phase 22d) — `kickoff_meeting` now edges directly to `design_stage`.

Minimal fix, keeping every other assertion intact:
- Remove the `designMeeting` lookup, its entry in the `if (!assignBrief || ...)` null-guard, and the two `assertOk` calls that submit and complete `design_meeting`.
- Update `recordPass('all 7 steps found (6 new + confirmation)')` to the actual count after removal.
- Update the file's header docblock: correct the step chain to `assign_designer_brief -> brief_taking -> design_initiation -> kickoff_meeting -> design_stage`, correct "6 new Design steps" to the real count, and add a `quick task 260727-dps` note that `design_meeting` was removed from the live graph in v2.0 Phase 22d (see `scripts/migrate-remove-design-meeting-merge-checks.ts`) so the harness now verifies the pipeline as it exists today.
- Update the final `RESULT: PASS` message's step count to match.

Do not add new assertions, do not touch the assignment/pool assertions, and do not alter the harness's read-only treatment of `graph='live'` definitions or its cleanup `finally` block.

Then run the full verification sweep across all four edited files.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsx scripts/verify-design-pipeline.ts && npx tsc --noEmit && npm run lint && npm test && npm run verify:live-workflow && npm run verify:workflow-engine</automated>
  </verify>
  <done>All six commands exit 0. `git diff --name-only` lists exactly the four files in this plan's `files_modified` — no `lib/`, `app/`, `actions/`, or `components/` changes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CLI script -> live Postgres | Seeder and harnesses hold full `DATABASE_URL` write credentials against the production Neon DB |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260727-01 | Denial of Service | `db/seed-workflow-graph.ts` | mitigate | Task 1 adds a pre-delete guard: abort with exit 1 unless `--force` is passed when `graph='live'` already has step definitions. Removes the "one npm script wipes every project's workflow state" footgun. |
| T-260727-02 | Tampering | `scripts/verify-workflow-engine.ts` | mitigate | Harness stays scoped to `graph='test'` + uniquely-named throwaway projects/users with a `finally` cleanup; Task 2 adds no new write targets. Regression assertion locks `STATE_GATED_KINDS` so a future weakening of the completion gate fails CI-visible verification. |
| T-260727-03 | Tampering | `scripts/verify-design-pipeline.ts` | accept | Reads `graph='live'` step definitions read-only and writes only throwaway project/user rows it deletes in `finally` — unchanged by this task. |
| T-260727-SC | Tampering | npm/pip/cargo installs | accept | No packages installed by this plan; no `package.json` dependency changes. |
</threat_model>

<verification>
1. `npm run verify:live-workflow` exits 0
2. `npm run verify:workflow-engine` exits 0
3. `npx tsx scripts/verify-design-pipeline.ts` exits 0
4. `npx tsc --noEmit` clean
5. `npm run lint` clean
6. `npm test` green
7. `npx tsx db/seed-workflow-graph.ts` (no flag) exits non-zero, prints the guard message, and leaves the live graph intact
8. `git diff --name-only` == the four `files_modified` entries, nothing else
</verification>

<success_criteria>
- All three previously-failing harnesses exit 0
- The stale seeder reproduces the current 21-step / 20-edge live chain and refuses to run destructively without `--force`
- `lib/`, `app/`, `actions/`, `components/` are byte-unchanged — zero runtime behavior delta
- Live DB step definitions and edges unchanged (21 / 20) after the full sweep
- Every edit carries a dense why-comment tagged `quick task 260727-dps`; no emojis, no `Co-Authored-By` trailer
</success_criteria>

<output>
Create `.planning/quick/260727-dps-sync-workflow-canonical-array-seeder-and/260727-dps-SUMMARY.md` when done
</output>
