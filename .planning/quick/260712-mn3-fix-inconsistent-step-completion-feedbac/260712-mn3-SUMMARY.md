---
phase: quick-260712-mn3
plan: 01
subsystem: ui
tags: [react, nextjs, workflow-engine, feedback, ux]

# Dependency graph
requires:
  - phase: Phase 16 (Workflow Engine Core)
    provides: yes_no_upload/approval/assignment fulfillment kinds, completeStepAction/sendApprovalAction/receiveApprovalAction
  - phase: Post-assignment UX quick task (260710-d32)
    provides: assignment-step.tsx's proven REDIRECT_DELAY_MS/scheduleRedirect/ok-state feedback mechanism
provides:
  - Consistent green/red step-completion feedback (matching assignment-step.tsx) on yes_no_upload and approval workflow steps
  - Auto-redirect to role dashboard ~1.4s after real step completion on those two kinds
  - Rendered "Not your step." / position-restriction messages instead of silent redirects on unauthorized workflow-step page hits
affects: [workflow-step-ux, future fulfillment-kind additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Step-completion feedback: REDIRECT_DELAY_MS=1400 module constant + ok boolean state + redirectTimer ref + scheduleRedirect() helper + text-green-700/text-error conditional render — now used identically across all three interactive fulfillment kinds (assignment, yes_no_upload, approval)"
    - "Access-denied page pattern: render a denied(message) local helper (page shell + red text-error message) instead of redirect() for genuine access-check failures, reserving redirect() for not-found cases (missing projectId/stepKey/step)"

key-files:
  created: []
  modified:
    - app/_components/workflow-kinds/yes-no-upload-step.tsx
    - app/_components/workflow-kinds/approval-step.tsx
    - "app/(app)/workflow/step/page.tsx"

key-decisions:
  - "Redirect fires only on actual step completion (complete()), not on intermediate actions (submit()'s optimistic message, send()/receive() in approval-step) — matches assignment-step's behavior and avoids premature navigation on multi-kind steps where completeStepAction can still return not-ok until every requirement is met."
  - "Kept redirect(dashboard) for missing projectId/stepKey and missing step (not-found bounces); only the two access-check branches (role mismatch, position mismatch) were converted to rendered denied() messages, per the plan's explicit scope boundary."

requirements-completed: [UX-STEP-FEEDBACK]

# Metrics
duration: 4min
completed: 2026-07-12
---

# Quick Task 260712-mn3: Fix Inconsistent Step-Completion Feedback Summary

**Ported assignment-step.tsx's green/red + auto-redirect feedback mechanism into yes_no_upload and approval workflow steps, and replaced two silent access-denied redirects with rendered messages.**

## Performance

- **Duration:** 4 min (commit timestamps: 16:20:29 → 16:23:49 local)
- **Started:** 2026-07-12T15:20:29Z
- **Completed:** 2026-07-12T15:23:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `yes-no-upload-step.tsx` and `approval-step.tsx` now render success in green (`text-green-700`) with a leading `✓` and failure in red (`text-error`), matching the existing `assignment-step.tsx` pattern — a rejected submission (e.g. "You cannot approve your own submission…") can no longer be mistaken for a success.
- Both components auto-redirect to the caller's role dashboard ~1.4s after the step is genuinely completed (not on intermediate `submit()`/`send()`/`receive()` actions).
- `app/(app)/workflow/step/page.tsx` passes `redirectTo={dashboard}` to all three interactive fulfillment-kind components (assignment, yes_no_upload, approval) — the pattern is now consistent across the board.
- Unauthorized-role and required-position mismatches on the workflow step page now render "Not your step." / "This step is restricted to a specific title, and your account is not set to it." instead of silently bouncing to the dashboard.

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply success/error styling + auto-redirect to yes-no-upload-step and approval-step** - `4fd5a1a` (feat)
2. **Task 2: Pass redirectTo from page and surface access-denied messages** - `71eba9c` (feat)

**Plan metadata:** (docs commit handled by orchestrator)

## Files Created/Modified
- `app/_components/workflow-kinds/yes-no-upload-step.tsx` - Added `redirectTo` prop, `ok` state, `scheduleRedirect()`, green/red conditional message styling on `onFile`/`submit`/`complete`
- `app/_components/workflow-kinds/approval-step.tsx` - Same mechanism; `send()`/`receive()` show green ✓ on success but do NOT redirect (intermediate actions), only `complete()` redirects
- `app/(app)/workflow/step/page.tsx` - Passes `redirectTo={dashboard}` to yes_no_upload/approval cases; added local `denied(message)` helper replacing the role-mismatch and position-mismatch `redirect()` calls

## Decisions Made
- Redirect fires only on real step completion, not intermediate actions — matches assignment-step and avoids premature navigation on multi-kind steps.
- Missing-project/step redirects were left unchanged (genuine not-found bounces); only the two access-check redirects were converted to rendered messages, per plan scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three interactive fulfillment kinds (assignment, yes_no_upload, approval) now share one consistent, proven feedback/redirect mechanism — a template for any future fulfillment kind.
- `npx tsc --noEmit` clean project-wide; `npm run lint` clean except one pre-existing, unrelated `app/layout.tsx` font warning (out of scope for this task).
- No blockers for Phase 20 (Payment & Timeline Gating), which remains the project's next planned focus per STATE.md.

---
*Phase: quick-260712-mn3*
*Completed: 2026-07-12*

## Self-Check: PASSED

All created/modified files confirmed present on disk; both task commits (4fd5a1a, 71eba9c) confirmed in git log.
