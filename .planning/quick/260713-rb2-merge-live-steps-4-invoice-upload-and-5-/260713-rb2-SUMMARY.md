---
phase: quick-260713-rb2
plan: 01
subsystem: workflow-engine
tags: [workflow, live-migration, invoice, timeline, ux-merge]
dependency-graph:
  requires: []
  provides:
    - "22-step live workflow graph (was 23)"
    - "Merged Operations-owned 'Invoice & Delivery Timeline' step at orderIndex 4"
    - "2-part wizard rendering pattern on /workflow/step for additionalKinds=[timeline_setting]"
  affects:
    - scripts/migrate-merge-invoice-upload-timeline.ts
    - db/workflow-live-steps.ts
    - db/seed-workflow-graph.ts
    - scripts/verify-live-workflow.ts
    - actions/projects.ts
    - lib/workflow.ts
    - app/(app)/workflow/step/page.tsx
    - app/_components/workflow-kinds/yes-no-upload-step.tsx
    - app/(app)/admin/invoice-timeline/invoice-timeline-form.tsx
    - app/(app)/admin/invoice-timeline/page.tsx (deleted)
    - app/_components/pending-step-gate.tsx
    - app/_components/trt-flow-diagram.tsx
    - tests/lib/workflow-live.test.ts
    - tests/lib/workflow.test.ts
    - tests/actions/workflow.test.ts
tech-stack:
  added: []
  patterns:
    - "2-part wizard on /workflow/step keyed off additionalKinds includes 'timeline_setting', gated on workflow_step_states.fulfilledKinds"
    - "completeOnSubmit prop on YesNoUploadStep to defer step completion until a later sub-form finishes"
key-files:
  created:
    - scripts/migrate-merge-invoice-upload-timeline.ts
  modified:
    - db/workflow-live-steps.ts
    - db/seed-workflow-graph.ts
    - scripts/verify-live-workflow.ts
    - actions/projects.ts
    - lib/workflow.ts
    - app/(app)/workflow/step/page.tsx
    - app/_components/workflow-kinds/yes-no-upload-step.tsx
    - app/(app)/admin/invoice-timeline/invoice-timeline-form.tsx
    - app/_components/pending-step-gate.tsx
    - app/_components/trt-flow-diagram.tsx
    - tests/lib/workflow-live.test.ts
    - tests/lib/workflow.test.ts
    - tests/actions/workflow.test.ts
  deleted:
    - app/(app)/admin/invoice-timeline/page.tsx
decisions:
  - "D-01: merged step requiredPosition=null (role=operations only) — role=operations already admits operations-role users AND super_admins via isAdminRole; requiredPosition is strict-equality for every role, so head_of_operations would wrongly block a super_admin whose position isn't that exact slug."
  - "D-02: survivor is invoice_upload (orderIndex 4), becomes role=operations, fulfillmentKind=yes_no_upload, additionalKinds=[timeline_setting]; invoice_timeline deleted. additionalKinds is the trigger for the 2-part wizard, reusing the engine's existing multi-kind machinery."
  - "D-03: merged step label is exactly 'Invoice & Delivery Timeline' everywhere (migration, LIVE_WORKFLOW_STEPS, seed) — byte-identical or parity fails."
  - "D-04: folded the timeline form into /workflow/step (single page); removed the /admin/invoice-timeline PAGE route but kept invoice-timeline-form.tsx, now imported by /workflow/step."
metrics:
  duration: ~70min
  completed: 2026-07-13
---

# Quick Task 260713-rb2: Merge Live Steps 4+5 (Invoice Upload + Delivery Timeline) Summary

Merged live workflow steps 4 (Invoice Upload, was mis-assigned to `customer_care`) and 5 (Set Delivery Timeline, `operations`/`head_of_operations`) into ONE Operations-owned step at orderIndex 4, rendered as a 2-part wizard (part 1 = upload invoice, part 2 = set delivery date + per-step deadlines) that completes once and advances the project straight to Design Initiation.

## Final State

- **Live graph:** 22 steps (was 23), single linear chain `new_project -> ... -> sign_off`.
- **Merged step (orderIndex 4, `invoice_upload`):**
  - `label`: `Invoice & Delivery Timeline`
  - `role`: `operations`
  - `fulfillmentKind`: `yes_no_upload`
  - `additionalKinds`: `['timeline_setting']`
  - `requiredPosition`: `null` (D-01 — actionable by operations OR super_admin, not restricted to Head of Operations exact-position)
- **Step 13 (`project_review_authorisation`)** flow-diagram blurb now names both the routing role (Operations) and the acting title (Chief Production Officer); its `role=operations` + `requiredPosition=chief_production_officer` gate is unchanged (copy-only fix).

## Tasks Completed

1. **Reshape the live graph** — created `scripts/migrate-merge-invoice-upload-timeline.ts` (idempotent, safety-guarded on `projects` count == 0, exact-count edge-delete guard, ascending orderIndex compaction), ran it against the live Neon DB (23 -> 22 steps, confirmed idempotent on a 2nd run), updated `db/workflow-live-steps.ts` and `db/seed-workflow-graph.ts` to match, updated `scripts/verify-live-workflow.ts`'s header comment. Commit `387fa04`.
2. **Rework server action + routing + wizard UX** — `YesNoUploadStep` gained `completeOnSubmit` (default `true`); `/workflow/step` renders a 2-part wizard when `additionalKinds` includes `timeline_setting`; `setInvoiceTimelineAction` reworked to complete the merged step once via `completeGraphStep` (gated on `isAdminRole` only, `requiredPosition` check removed); `lib/workflow.ts`'s dead `timeline_setting` href branches removed; `/admin/invoice-timeline/page.tsx` deleted (form kept, now imported by `/workflow/step`); `pending-step-gate.tsx`'s dead route check removed. Commit `beee7c5`.
3. **Flow-diagram copy** — removed the `invoice_timeline` DETAIL entry, rewrote the `invoice_upload` blurb, fixed step 13's blurb (copy-only). Commit `7ae41f6`.
4. **Full-suite verification + dangling-reference sweep** — all green, no additional fixes needed.

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean |
| `npm run lint` | Clean (1 pre-existing unrelated warning: `app/layout.tsx` custom font) |
| `npm test` | 83 passed, 1 todo (11 test files) |
| `npm run verify:live-workflow` | `RESULT: PASS` — PARITY 22/22 + both dualRoles confirmation orders |
| `npm run build` | Succeeded; `/admin/invoice-timeline` route absent from route list; `/workflow/step` compiles |
| Migration idempotency | 1st run: 23 -> 22 steps; 2nd run: "already merged — nothing to do" |
| Dangling-reference sweep (`invoice_timeline\|invoice-timeline\|setInvoiceTimelineAction` across `app lib actions db scripts`) | Only acceptable hits: historical prose in `db/workflow-live-steps.ts`/`db/seed-workflow-graph.ts` comments, old `scripts/migrate-insert-invoice-timeline-step.ts` history file, the new migration script's own internal references to the key it deletes, and `invoice-timeline-form.tsx` + its `setInvoiceTimelineAction` usage (now keyed to `invoice_upload`) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 — blocking test failures] Updated 3 test files hardcoding the prior 23-step graph**
- **Found during:** Task 2 verification (`npm test` run to confirm the full suite, ahead of Task 4's formal gate)
- **Issue:** Task 1's live-DB migration and `LIVE_WORKFLOW_STEPS` edit correctly shrank the graph to 22 steps, but three pre-existing test files asserted the old 23-step count/ordering/step-numbers, causing 6 test failures unrelated to any bug in the new code — a direct, mechanical consequence of the step-count change this plan intentionally makes.
- **Fix:** Updated `tests/lib/workflow-live.test.ts` (step count 23->22, removed `invoice_timeline` from the expected role-order array, `invoice_upload`'s expected role changed to `operations`, final-step `n` 23->22), `tests/lib/workflow.test.ts` (`lastStepN` expectation 23->22), and `tests/actions/workflow.test.ts` (hardcoded Close Out/Sign Off step numbers 22/23 -> 21/22, matching the new compacted numbering).
- **Files modified:** `tests/lib/workflow-live.test.ts`, `tests/lib/workflow.test.ts`, `tests/actions/workflow.test.ts`
- **Commit:** `beee7c5`

No other deviations — the plan executed as written otherwise.

## Threat Model Notes

- **T-rb2-01/T-rb2-02 (Elevation of Privilege):** Mitigated as planned — `authorizeStep`/page-level `canRoleActOnStep('operations')` gates part 1; `setInvoiceTimelineAction` keeps the `isAdminRole` gate and completes via `completeGraphStep`, which throws `step-not-fulfilled` (surfaced as a clear error message) if part 1 wasn't recorded — a spoofed direct part-2 submit cannot skip part 1.
- **T-rb2-03 (Tampering, migration script):** Mitigated as planned — `projects` count == 0 assertion, idempotency guard, exact-count edge-delete guard (refuses unless exactly 2 edges deleted) all present and exercised live.
- **T-rb2-04 (Repudiation):** Accepted per plan — `projectStepCompletions.completedBy` unchanged.
- **T-rb2-SC (package installs):** No new packages installed.

No new threat surface introduced beyond what's already covered by the plan's threat register.

## Self-Check: PASSED

- `scripts/migrate-merge-invoice-upload-timeline.ts` exists: FOUND
- `app/(app)/workflow/step/page.tsx` exists (modified): FOUND
- `db/workflow-live-steps.ts` exists (modified): FOUND
- `app/(app)/admin/invoice-timeline/page.tsx` deleted: CONFIRMED (file absent)
- Commit `387fa04` (Task 1): FOUND in `git log`
- Commit `beee7c5` (Task 2): FOUND in `git log`
- Commit `7ae41f6` (Task 3): FOUND in `git log`
