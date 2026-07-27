---
phase: quick-260727-f5e
plan: 01
subsystem: workflow
tags: [nextjs, drizzle, authorization, workflow-engine]
status: complete

requires: []
provides:
  - Receiver-aware page-level authorization gates for approval-kind workflow steps in app/(app)/workflow/step/page.tsx
affects: [workflow-step-page, approval-step-rendering]

tech-stack:
  added: []
  patterns:
    - "Page-level auth gates for a step kind must mirror the server action's forReceive-aware gate (authorizeStep), not just the sender's static role/requiredPosition"

key-files:
  created: []
  modified:
    - app/(app)/workflow/step/page.tsx

key-decisions:
  - "Computed receiverOk once (isApproval && approvalReceiverEligible(...)) and used it to bypass both the role gate and the requiredPosition gate, rather than duplicating approvalReceiverEligible's internal receiverRole/receiverRequiredPosition fallback logic inline"
  - "Consolidated the caller-position DB fetch to one query shared by the page gates and renderKind('approval'), gated behind needsPosition = Boolean(step.requiredPosition) || isApproval so non-approval steps with no requiredPosition still make zero position queries"
  - "Left getStepAssigneeGate untouched and NOT bypassed by receiverOk, matching authorizeStep which applies that gate regardless of forReceive"

requirements-completed: [QUICK-260727-f5e]

duration: 15min
completed: 2026-07-27
---

# Phase quick-260727-f5e: Receiver-Aware Approval Step Gates Summary

**Fixed a permanent deadlock on approval-kind workflow steps: the page's role/requiredPosition gates described only the SENDER, so once a sender sent (status='sent'), the receiver (a different role/position via receiverRole/receiverRequiredPosition) was denied access forever — live step 13 send_for_production could never be approved by any chief_production_officer holder.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Hoisted `stepRequiredKinds(step)` above the page gates and computed `isApproval`/`receiverOk` before them
- One consolidated caller-position query (`needsPosition` guard) shared by both gates and `renderKind('approval')` — query count unchanged for non-approval steps
- Both page gates (role gate, requiredPosition gate) now bypassed by `receiverOk`, closing the deadlock while leaving `getStepAssigneeGate` untouched
- `renderKind('approval')` no longer runs its own duplicate position query

## Task Commits

1. **Task 1: Make the page-level gates receiver-aware for approval steps** - `b2008dc` (fix)
2. **Task 2: Full verification suite and diff review** - no additional commit; all checks passed on the Task 1 commit, no fixes needed

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `app/(app)/workflow/step/page.tsx` - Hoisted requiredKinds; added consolidated callerPosition fetch + receiverOk; loosened role and requiredPosition gates with receiverOk; renderKind('approval') reuses hoisted callerPosition instead of re-querying

## Decisions Made
- See key-decisions in frontmatter above.

## Deviations from Plan

None - plan executed exactly as written. Both sub-edits described in Task 1's action block were applied verbatim (hoist, consolidated fetch/receiverOk, loosened gates, dedup renderKind query); Task 2 found no failures requiring fixes.

## Issues Encountered

None.

## Verification Results

- `npx tsc --noEmit` — clean (0 errors)
- `npm run lint` — 0 errors, 3 pre-existing warnings unrelated to this change (app/layout.tsx custom font, netlify function anonymous export, tests/actions/workflow.test.ts unused var)
- `npm test` — 37 test files, 308 passed + 1 todo (309 total), all green
- `git diff --name-only HEAD~1 HEAD` — exactly one file: `app/(app)/workflow/step/page.tsx`
- Exactly one `db.select({ position: users.position })` query remains in the file (verified via grep count = 1)
- Exactly one `const requiredKinds` declaration remains (no stray duplicate)
- `approvalReceiverEligible` used twice (gate computation + renderKind's `receiverEligible` prop) — both intentional, no unused-import issue

## Manual/Browser Verification

**Deferred to the orchestrator**, per execution instructions. Not run in this session:
- Live check that a `chief_production_officer` user opening `/workflow/step?projectId=…&step=send_for_production` on a step at `status='sent'` now renders the receive pane (`<ApprovalStep phase="sent" receiverEligible={true} />`) instead of a denial screen.
- Confirming the sender (`operations_manager_admin`) still reaches the send pane and a user holding neither gate still sees the unchanged denial copy.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Fix is self-contained to one file; no schema/action/lib changes, so no other in-flight work is affected.
- Orchestrator should perform the live browser check on step 13 (`send_for_production`) with a `chief_production_officer` account before considering this fully closed in STATE.md's Quick Tasks table.

---
*Phase: quick-260727-f5e*
*Completed: 2026-07-27*

## Self-Check: PASSED

- FOUND: app/(app)/workflow/step/page.tsx
- FOUND: b2008dc (Task 1 commit)
- FOUND: .planning/quick/260727-f5e-workflow-step-page-position-gate-blocks-/260727-f5e-SUMMARY.md
