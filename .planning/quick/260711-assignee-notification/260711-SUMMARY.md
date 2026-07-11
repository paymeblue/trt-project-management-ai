---
phase: quick-260711-assignee-notification
plan: 01
subsystem: notifications
tags: [drizzle, next.js, assignment, in-app-notifications]

requires:
  - phase: 19-new-roles-assignment
    provides: verify-role-assignment.ts, which surfaced this gap as an honest FAIL
provides:
  - notifyUser — single-recipient in-app notification writer (lib/notifications.ts)
  - assignUser fires an 'assignment' notification to the assignee after the durable write
  - NotificationsBell mounted for every authenticated role, not just super_admin
affects: [ROLE-02]

tech-stack:
  added: []
  patterns:
    - "Single-recipient notification mirrors the existing fan-out (notifyAllSuperAdmins) shape — same table, same DTO, same self-exclusion rule (recipientId === actorId inserts nothing)"

key-files:
  created: []
  modified:
    - lib/notifications.ts
    - lib/workflow-graph.ts
    - scripts/verify-role-assignment.ts
    - app/(app)/layout.tsx
    - app/_components/notifications-bell.tsx
    - .planning/REQUIREMENTS.md

key-decisions:
  - "notifyUser call lives in assignUser (lib/workflow-graph.ts), not assignUserAction — verify-role-assignment.ts calls wg.assignUser directly, and this is also where autoAssignIfConfigured routes through, so self-exclusion correctly suppresses the auto-assign self-assignment case"
  - "An invisible notification does not satisfy ROLE-02's 'notifies that user' — the header bell was super_admin-only, so it had to be mounted for every role; /api/notifications is already per-user (verifySession-scoped) so this exposes nothing"
  - "markOne's existing /disputes routing is super-admin-only; guarded so 'assignment'-typed notifications never navigate a non-admin assignee there"

requirements-completed: [ROLE-02]

duration: ~20min
completed: 2026-07-11
---

# Quick Task 260711: Assignee Notification (ROLE-02 gap closure) Summary

**Closed the ROLE-02 gap Phase 19's verification harness found: assignments were recorded but never notified the assignee, and even if they had been, the bell that would show it was super-admin-only.**

## Accomplishments

- Added `notifyUser` (single-recipient) to `lib/notifications.ts`, mirroring the existing `notifyAllSuperAdmins` fan-out shape and self-exclusion rule.
- Wired it into `assignUser` (`lib/workflow-graph.ts`) right after the durable `workflowStepStates` write, with title `"You've been assigned: {step label} on {project name}"`, `type: 'assignment'`.
- Tightened `scripts/verify-role-assignment.ts`'s ROLE-02b assertion from "any notification row exists" to "a row with `type === 'assignment'` exists" — now genuinely PASSes (was an honest FAIL from Phase 19).
- Mounted `NotificationsBell` for every authenticated role in `app/(app)/layout.tsx` (was `role === 'super_admin' &&`-gated) — `/api/notifications` was already per-user, so this is safe.
- Guarded `notifications-bell.tsx`'s `markOne` so `'assignment'`-typed notifications never route a non-admin to the super-admin-only `/disputes/{projectId}` thread; updated the file's header comment to reflect the wider audience.
- Flipped ROLE-02 from `[~]` Partial to `[x]` Complete in `.planning/REQUIREMENTS.md`, merged into the ROLE-01..07 traceability table row.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test` (77 passed, 1 todo) — all green.
- `npx tsx scripts/verify-role-assignment.ts` — RESULT: PASS, including the tightened ROLE-02b assertion (previously an honest FAIL from Phase 19's 19-04 plan).
- `npm run verify:live-workflow` — RESULT: PASS (workflow graph engine untouched, per this task's own scope constraint).

## Commits

1. `f87b0d3` — feat: notifyUser + assignUser wiring + tightened verify-role-assignment.ts assertion
2. `9333477` — feat: bell mounted for all roles + markOne routing guard + REQUIREMENTS.md ROLE-02 flip

## Issues Encountered

The first executor attempt for this task failed mid-flight with a Claude API session-limit error before making any changes (working tree was clean afterward — nothing to recover). Re-executed directly (inline, no subagent) to completion once tool calls were available again; no functional issue, just an execution-mechanics interruption.

## Next Phase Readiness

ROLE-02 is now genuinely complete — all of Phase 19's ROLE-01..07 requirements are done. No further follow-up items from this task.
