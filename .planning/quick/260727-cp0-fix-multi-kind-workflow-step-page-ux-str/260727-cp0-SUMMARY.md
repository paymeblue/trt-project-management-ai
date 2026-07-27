---
phase: quick-260727-cp0
plan: 01
subsystem: ui
tags: [workflow-engine, drizzle, react-server-components, next16]
status: complete

requires:
  - phase: 16-18.1
    provides: DB-driven workflow graph, additionalKinds/fulfilledKinds model, completeGraphStep's state-gated fulfillment check
provides:
  - "outstandingRequiredKinds() — client-safe DISPLAY mirror of completeGraphStep's gate, in lib/workflow.ts"
  - "Recorded yes_no_upload banner on multi-kind /workflow/step pages"
  - "CompleteStepButton disabled + 'Still needed' hint until every state-gated required kind is recorded"
affects: [workflow-step-page, complete-step-button, workflow-configurator]

tech-stack:
  added: []
  patterns:
    - "Display-layer gate mirrors: a pure helper co-located with the constant it depends on (STATE_GATED_KINDS), kept client-safe, so a server component can preview a server-only gate's outcome without duplicating the authoritative check"

key-files:
  created:
    - lib/workflow-outstanding-kinds.test.ts
  modified:
    - lib/workflow.ts
    - lib/workflow-graph.ts
    - "app/(app)/workflow/step/page.tsx"
    - app/_components/workflow-kinds/complete-step-button.tsx

key-decisions:
  - "STATE_GATED_KINDS declaration site moved from lib/workflow-graph.ts (server-only) to lib/workflow.ts (client-safe) so the display layer and the engine gate can never drift apart; completeGraphStep's filter/every() expressions stayed byte-identical, only the import source changed"
  - "outstandingRequiredKinds() is purely additive display state — computed server-side in page.tsx from the same genericState row already being read, no new DB query"
  - "Recorded-answer banner reuses the existing checklist-completed banner markup exactly (same wrapper/icon classes) for visual consistency"

patterns-established:
  - "When a server-only gate needs a client-visible preview, extract the shared constant/predicate into the client-safe module instead of importing the server-only module from a client component"

requirements-completed: [QUICK-260727-cp0]

duration: ~12min
completed: 2026-07-27
---

# Quick Task 260727-cp0: Fix multi-kind workflow step page UX Summary

**Multi-kind workflow steps (e.g. confirmation_correction) now show a recorded green banner for an already-fulfilled yes_no_upload requirement, and the page-level Complete step button is disabled with a "Still needed: ..." hint until every state-gated requirement is recorded — eliminating the opaque "Complete this step's form before marking it done" dead end.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-27
- **Tasks:** 2
- **Files modified:** 4 (+1 new test file)

## Accomplishments
- Extracted `STATE_GATED_KINDS` + new `outstandingRequiredKinds()` into client-safe `lib/workflow.ts`, TDD'd (RED then GREEN), with `completeGraphStep`'s gate expressions in `lib/workflow-graph.ts` left byte-identical (only the constant's declaration site moved)
- Multi-kind `/workflow/step` page now renders a green "recorded" banner (capitalized answer + attached file name) for a fulfilled `yes_no_upload` requirement instead of an empty form, using the existing `genericState` query extended with `answer`/`uploadName` (no new query)
- `CompleteStepButton` gained a required `outstandingKinds` prop: disables the button and shows `Still needed: {kinds}` whenever any state-gated required kind is unfulfilled; re-enables automatically after any sub-form's `router.refresh()`

## Task Commits

1. **Task 1: Extract STATE_GATED_KINDS + outstandingRequiredKinds()** - `e65cf98` (test, RED) → `3c8179b` (feat, GREEN)
2. **Task 2: Recorded banner + outstanding-kinds gating** - `c27b443` (feat)

**Plan metadata:** (this commit) `docs(quick-260727-cp0): complete fix-multi-kind-workflow-step-page-ux-str`

## Files Created/Modified
- `lib/workflow-outstanding-kinds.test.ts` - New unit suite (7 cases) covering full/partial/empty outstanding sets, null additionalKinds/fulfilledKinds, non-state-gated exclusion, and a STATE_GATED_KINDS drift guard
- `lib/workflow.ts` - Added `STATE_GATED_KINDS` (relocated from workflow-graph.ts, comment carried verbatim) + `outstandingRequiredKinds()`
- `lib/workflow-graph.ts` - Removed local `STATE_GATED_KINDS` declaration, imports it from `@/lib/workflow` instead; `completeGraphStep`'s `gatedRequiredKinds`/`every()` gate expressions unchanged; stale comment near `recordAdditionalRequirement` updated to point at the new location
- `app/(app)/workflow/step/page.tsx` - Extended `genericState` select with `answer`/`uploadName`; added recorded-banner branch in `renderKind('yes_no_upload')`; computed `outstandingKinds` and passed it to `CompleteStepButton`
- `app/_components/workflow-kinds/complete-step-button.tsx` - New required `outstandingKinds: StepKind[]` prop; `blocked = outstandingKinds.length > 0` gates `disabled` and renders the "Still needed" hint

## Decisions Made
- Kept the relocation of `STATE_GATED_KINDS` a pure declaration-site move — no behavior change to `completeGraphStep`, verified by re-reading the filter/every() lines post-edit and confirming they're untouched aside from the import line
- Did not touch `yes-no-upload-step.tsx`, any server action, or the timeline_setting/payment_confirmation branches in page.tsx, per plan constraints

## Deviations from Plan

None - plan executed exactly as written. TDD gate sequence confirmed in git log: `test(...)` commit (`e65cf98`) precedes the `feat(...)` commit (`3c8179b`) for Task 1.

## Issues Encountered
None.

## Manual Verification (deferred)

The plan's 5-step manual browser check (open a multi-kind step, submit the yes/no sub-form, confirm the banner + hint update, reload mid-way, and confirm the single-kind/invoice_upload regressions) was **not run in this execution** — per the orchestrator's instruction, browser QA is deferred to a follow-up pass. All automated verification (vitest, `tsc --noEmit`, `npm run lint`, full `npm test` — 308 passed + 1 todo) is green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Display-layer fix is self-contained; no follow-on work required unless the deferred manual browser check surfaces a rendering issue
- Pending: orchestrator-driven manual browser QA of the 5-step verification script in the plan

---
*Phase: quick-260727-cp0*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 3 task commits (`e65cf98`, `3c8179b`, `c27b443`) confirmed present in git log.
