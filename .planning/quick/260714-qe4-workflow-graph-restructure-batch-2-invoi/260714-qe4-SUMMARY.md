---
phase: quick-260714-qe4
plan: 01
subsystem: workflow-graph
tags: [workflow, migration, live-db, invoicing, positions, checklists]
dependency-graph:
  requires: [quick-260714-bpq (positions table)]
  provides: [21-step live workflow graph, 2-phase Invoicing, Set Delivery Timeline step, Installation Process checklist, head_of_projects position]
  affects: [scripts/migrate-workflow-restructure-batch2.ts, db/workflow-live-steps.ts, lib/workflow-graph.ts, actions/projects.ts, app/(app)/workflow/step/page.tsx, app/_components/trt-flow-diagram.tsx]
tech-stack:
  added: []
  patterns: ["id-preserving in-place live migration (mirrors migrate-insert-payment-confirmation-step.ts)", "2-part wizard via additionalKinds (mirrors the old invoice_upload/timeline_setting pattern)"]
key-files:
  created:
    - scripts/migrate-workflow-restructure-batch2.ts
    - app/_components/workflow-kinds/confirm-payment-step.tsx
  modified:
    - db/workflow-live-steps.ts
    - db/seed-checklists.ts
    - scripts/verify-live-workflow.ts
    - lib/workflow-graph.ts
    - actions/projects.ts
    - app/(app)/workflow/step/page.tsx
    - app/_components/trt-flow-diagram.tsx
    - app/_components/dashboard-shell.tsx
    - tests/lib/workflow-live.test.ts
    - tests/lib/workflow.test.ts
    - tests/actions/workflow.test.ts
decisions:
  - "2-phase Invoicing reuses the proven additionalKinds wizard pattern (not the approval kind, which blocks same-role two-party flows)"
  - "ASSIGNEE_GATED_STEPS NOT extended to 'confirmation' — the checklist page doesn't consult getStepAssigneeGate, so adding it would only affect a UI hint, not real enforcement"
  - "Deleted-key audit rows (installation_readiness/close_out) permanently relocated to a +100000 stepN offset instead of left at their original integer, to avoid colliding with the new TARGET graph's real steps 19/21"
metrics:
  duration: ~90min
  completed: 2026-07-14
---

# Phase quick-260714-qe4 Plan 01: Workflow Graph Restructure Batch 2 Summary

Un-merged the old "Invoice & Delivery Timeline" step into two ownership-correct steps (customer_care 2-phase Invoicing + operations Set Delivery Timeline), converted the old Operations Confirmation step into a Head-of-Projects "Assign Site PM for Site Confirmation" assignment step, relocated the site Confirmation checklist to immediately follow it, removed Installation Readiness, merged Sorting + Close Out into one Installation Process checklist, and converted Sign Off from a super_admin ack into a site_pm upload step. Live graph: 22 → 21 steps, migrated in place on the live production DB with the real in-flight "Test Project" remapped from step 12 to step 14.

## What Was Built

**Task 1 — Migration + bootstrap/parity references**
- `scripts/migrate-workflow-restructure-batch2.ts`: idempotent, assert-guarded, id-preserving migration. Pre-flight abort guard resolves every live project's current step against the OLD graph and refuses to run if any project sits on a deleted key or the split boundary (`invoice_upload`). Rebuilds `workflow_step_edges` as a strict linear chain over the TARGET order (the live graph has been fully linear since Phase 22e, so this is safe and simpler than surgical predecessor/successor rewiring). Remaps `projects.currentStep`, `project_step_deadlines.stepN`, and `project_step_completions.stepN` via an explicit OLD-key → NEW-orderIndex map (not arithmetic), using a temp-offset technique to avoid unique-constraint collisions during the permutation (confirmation moves backward from 14 to 10).
- `db/workflow-live-steps.ts`: `LIVE_WORKFLOW_STEPS` updated to the 21-step TARGET shape with a new header note.
- `db/seed-checklists.ts`: added `installation_process` checklist definition (3 sections: sorting, execution, close-out), reusing the sorting/close_out template items where sensible.
- `scripts/verify-live-workflow.ts`: doc comment updated to 21 steps (the parity loop already reads `LIVE_WORKFLOW_STEPS.length` dynamically, no logic change needed).

**Task 2 — Engine + server actions**
- Chosen 2-phase invoicing mechanism: reuses the existing `additionalKinds` 2-part-wizard pattern (not the `approval` kind, which throws `approval-requires-two-parties` when sender === receiver — Invoicing's two phases are both done by customer_care). `lib/workflow-graph.ts` gained `confirmPaymentReceived` (phase 2/2 fulfillment bookkeeping).
- `actions/projects.ts`: new `confirmClientPaidAction` sets `projects.paymentStatus = 'paid'` then completes the `invoice_upload` step (sole caller, mirrors `setInvoiceTimelineAction`'s precedent). `setInvoiceTimelineAction` retargeted from the old merged `invoice_upload` step to the new standalone `set_delivery_timeline` step, resolved by stepKey. `createProjectIntentAction`'s early-deadline seeding gained a `set_delivery_timeline: +1d` entry.
- Gating audit: confirmed no hardcoded reference to `installation_readiness`/`close_out`/`sorting` remains in `actions/workflow.ts`; `completeAckStepAction` is generic (guards on `step.kind === 'ack'`, not role), so `sign_off`'s move to `yes_no_upload` needed no special-case removal.
- **Deviation (Rule 1/2, not in the original files list):** `app/(app)/workflow/step/page.tsx`'s single `timeline_setting`-in-`additionalKinds` branch had to be split into two branches — a standalone `InvoiceTimelineForm` render for `set_delivery_timeline` (now a primary kind, no upload phase) and a new upload-then-confirm-payment wizard for `invoice_upload`. Without this the new steps would have been uncompletable (the old branch would have asked users to re-upload an invoice on the timeline step). New client component `app/_components/workflow-kinds/confirm-payment-step.tsx` provides the phase 2/2 UI.

**Task 3 — UI copy**
- `trt-flow-diagram.tsx` DETAIL updated for every changed/new/removed step; SLA copy fixed to "1 day" / "2 days"; front-page-only help text added to `confirmation_correction`.
- `dashboard-shell.tsx`'s icon substring matcher: `'sorting'`/`'close out'` replaced with `'installation process'`; `'confirmation'` match left unchanged (still resolves to the relocated step).

**Task 4 — Live migration + full gate**
- Migration ran against the live DB. Hit and fixed a real bug (see Deviations below), then completed successfully. Second run confirmed idempotent (no-op). Full gate (`tsc`, `lint`, `test`, `verify:live-workflow`, `build`) all green. `verify:live-workflow` reports PARITY 21/21 + both dualRoles confirmation orders passing.
- "Test Project" (the real in-flight project) remapped `currentStep` 12 → 14 as predicted by the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `project_step_deadlines`/`project_step_completions` stepN collision on first live migration attempt**
- **Found during:** Task 4 (live migration run)
- **Issue:** The migration's temp-offset remap correctly avoided collisions for the *affected* (surviving) keys' rows, but two projects had `project_step_deadlines` rows still sitting at the *deleted* keys' old stepN values (19 = `installation_readiness`, 21 = `close_out`), left "as-is" per the plan's audit-trail instruction. The new TARGET graph's real steps `approval_installation` (19) and `sign_off` (21) legitimately need those same integers, so finalizing the affected-key remap hit `duplicate key value violates unique constraint "project_step_deadlines_project_id_step_n_unique"` partway through, aborting with `projects.currentStep` and part of the deadlines/completions remap already applied but incomplete.
- **Fix:** Patched `scripts/migrate-workflow-restructure-batch2.ts` to permanently relocate any deadline/completion row still at a deleted key's old stepN (19/21) to a `+100000` offset *before* the affected-key temp/finalize dance — this is safe on both a fresh run and a resumed one, and keeps the row as a stable historical marker (readable via `stepKey` text) that can never collide with a live step number again. Then manually completed the same corrected remap on the already-partially-migrated live DB (3 stuck deadline rows finalized, 2 audit rows relocated, 10 completion rows for "Test Project" remapped) using a throwaway inspection script that was deleted immediately after (never committed).
- **Files modified:** `scripts/migrate-workflow-restructure-batch2.ts`
- **Commit:** `7c0a48b`

**2. [Rule 1 - Bug] Stale 22-step unit test fixtures**
- **Found during:** Task 4 (`npm test` gate step)
- **Issue:** `tests/lib/workflow-live.test.ts`, `tests/lib/workflow.test.ts`, and `tests/actions/workflow.test.ts` asserted the old 22-step shape (role order, `lastStepN`, `sign_off` as `super_admin`/`ack` at n=22, Close Out step numbers) — none of these files were in the plan's `files_modified` list, but they broke against the intentionally-changed `LIVE_WORKFLOW_STEPS`, exactly the class of pre-existing-test-vs-intentional-change gap the Phase 17-06 precedent already established as a blocking fix.
- **Fix:** Retargeted all three files' assertions to the new 21-step TARGET shape.
- **Files modified:** `tests/lib/workflow-live.test.ts`, `tests/lib/workflow.test.ts`, `tests/actions/workflow.test.ts`
- **Commit:** `7c0a48b`

**3. [Rule 2 - Missing functionality] No working UI for Invoicing phase 2/2**
- **Found during:** Task 2
- **Issue:** The plan's chosen 2-phase mechanism (additionalKinds wizard) requires a UI for phase 2/2 ("the client has finally paid"), but no such component existed and `app/(app)/workflow/step/page.tsx` was not in Task 2's files list.
- **Fix:** Added `app/_components/workflow-kinds/confirm-payment-step.tsx` (minimal, single-button, mirrors `yes-no-upload-step.tsx`'s pending/redirect pattern) and wired it into `workflow/step/page.tsx`'s new `payment_confirmation` branch.
- **Files modified:** `app/_components/workflow-kinds/confirm-payment-step.tsx` (new), `app/(app)/workflow/step/page.tsx`
- **Commit:** `0d1c2f5`

No other deviations — the rest of the plan executed as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary-crossing surface introduced beyond what the plan's threat model already covers (T-qe4-01/02/03/SC all mitigated as planned; T-qe4-04 accepted, and the deleted-key audit rows were preserved, just permanently relocated off the live 1-21 stepN range rather than left in a collision-prone slot).

## Self-Check

- `scripts/migrate-workflow-restructure-batch2.ts` exists: FOUND
- `app/_components/workflow-kinds/confirm-payment-step.tsx` exists: FOUND
- Commit `b1f6a8c` (Task 1) exists in `git log`: FOUND
- Commit `0d1c2f5` (Task 2) exists in `git log`: FOUND
- Commit `302196d` (Task 3) exists in `git log`: FOUND
- Commit `7c0a48b` (Task 4 fix) exists in `git log`: FOUND
- `npm run verify:live-workflow` PARITY 21/21, both dualRoles orders PASS: CONFIRMED (live run)
- Full gate (`tsc`, `lint`, `test`, `verify:live-workflow`, `build`) green: CONFIRMED
- Migration idempotent (3 total runs: 1 real + fix + 2 no-op confirmations): CONFIRMED

## Self-Check: PASSED
