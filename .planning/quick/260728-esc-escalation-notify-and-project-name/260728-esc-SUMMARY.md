---
status: complete
phase: quick-260728-esc
plan: 01
subsystem: escalation / notifications
tags: [escalation, notifications, bell, ux]
requires: [260727-gow, 260727-ibr]
provides: [ESC-A, ESC-B, ESC-C]
affects:
  - app/(app)/disputes/[projectId]/page.tsx
  - app/_components/escalation-amend-panel.tsx
  - actions/escalation.ts
  - lib/notification-autosurface.ts (new)
  - app/_components/notifications-bell.tsx
  - app/_components/pending-step-gate.tsx
  - app/_components/pending-call-gate.tsx
tech-stack:
  added: []
  patterns:
    - "useSyncExternalStore-based module-scope registration store (no context provider) for cross-component forcing-overlay precedence"
    - "sessionStorage-backed once-per-session UI surfacing, distinct from in-memory per-session dismiss sets used by forcing gates"
key-files:
  created:
    - lib/notification-autosurface.ts
    - tests/lib/notification-autosurface.test.ts
  modified:
    - app/(app)/disputes/[projectId]/page.tsx
    - app/_components/escalation-amend-panel.tsx
    - actions/escalation.ts
    - tests/actions/escalation-amend.test.ts
    - app/_components/notifications-bell.tsx
    - app/_components/pending-step-gate.tsx
    - app/_components/pending-call-gate.tsx
decisions:
  - "Recipient for the amend notification resolved into its own `recipientId` variable (not inlined into the notifyUser call) so a planned follow-up — sending the same officer a Resend email at this same choke point — can be added without restructuring."
  - "escalation_amended notification type deliberately NOT added to DISPUTE_NOTIFICATION_TYPES (that set drives the supervisor-facing Disputes badge/list; an officer being told their own record was corrected is not a dispute landing on their desk) and NOT added to NO_NAVIGATE_TYPES (a click should still route to /disputes/{projectId} to read the amended record)."
  - "Bell auto-surface uses sessionStorage (survives soft nav, resets on tab close) while the forcing gates keep their existing in-memory per-session dismiss Sets (reset on hard reload) — deliberately different persistence because 'still pending' (gates) and 'already read the text of' (bell) are different invariants."
metrics:
  duration: ~45min
  completed: 2026-07-28
---

# Phase quick-260728-esc Plan 01: Escalation notify + project name + notification auto-surface Summary

Closed the escalation loop end to end: escalated-step cards now name the project first, a supervisor's amend now notifies the officer who raised the escalation (best-effort, self-amend and null-creator safe), and unread notification content auto-surfaces once per session instead of sitting behind a bare count badge — with a single shared overlay-precedence store so the bell never races the step/call gates.

## What Was Built

### Task 1 — Project name on escalated-step cards (ESC-A)
`EscalationAmendPanel` gained a required `projectName: string` prop, rendered as the primary bold header identifier; `checklistLabel` and `Step N` were demoted to the same muted `text-xs text-gray-400` register, middot-separated, so the header never grows two competing bold strings. `app/(app)/disputes/[projectId]/page.tsx` supplies `projectName={project.name}` from the value it already selects for its own `<h1>` — no new query was added, matching the plan's explicit "every panel on this page belongs to the same project by construction" constraint.

### Task 2 — Amend notification to the escalation creator (ESC-B)
`amendEscalatedChecklistAction` (`actions/escalation.ts`) now runs a best-effort notification block after the write `try/catch` succeeds and before `revalidatePath`:
- Recipient resolved once (`const recipientId = escalation.createdBy`) so a planned Resend-email follow-up can reuse the same lookup.
- Skips entirely when `recipientId` is null (nullable column, `onDelete: 'set null'`) or equals the amending `userId` (self-amend) — before any extra DB read.
- Otherwise reads the project name and amender name fresh, then calls `notifyUser({ recipientId, actorId: userId, type: 'escalation_amended', title, body, projectId })` with a title naming project + checklist + step (`· Step N` appended only when `stepN != null`) and a body naming the amender (falls back to "Amended by a supervisor." when the name lookup returns nothing).
- The whole block (both selects + the `notifyUser` call) is wrapped in its own swallowing `try/catch` — a notification fault can never surface as "Could not save your changes" or trigger a double-write retry, mirroring `sendApprovalAction`'s treatment of its own notification fan-out as non-fatal.
- `canAmendEscalation` and the authorization block were not touched; `actions/escalation.ts` still contains zero references to `completeGraphStep`/`advanceOrConfirmDualRole`/`projectStepCompletions`/`workflowStepStates` (260727-gow module-boundary gate still passes).

Four new tests were added under a new `describe('amendEscalatedChecklistAction — amend notification (260728-esc)')` block in `tests/actions/escalation-amend.test.ts`, using the file's established hoisted-mock pattern (`notifyUserMock` hoisted alongside the existing mocks). All 19 pre-existing tests in that file were left byte-for-byte untouched and still pass — two of them (the two `super_admin`/different-caller "authorization" tests) now incidentally exercise the new notification block and run out of `mockReturnValueOnce` entries at the two new selects, which throw and get swallowed by the new `try/catch`; this is itself evidence the notification path is non-fatal, exactly as the plan anticipated, and required no changes to those tests.

### Task 3 — Notification auto-surface, single overlay precedence (ESC-C)
New `lib/notification-autosurface.ts` exports:
- `shouldAutoOpenBell(input)` — pure decision function: returns true only when the panel is closed, no forcing overlay is active, the user isn't typing, and at least one unread id is missing from the auto-surfaced set.
- `useRegisterForcingOverlay(active: boolean)` / `useForcingOverlayActive()` — a module-scope counter + listener Set exposed via `useSyncExternalStore`, so `PendingCallGate` and `PendingStepGate` can register their own "am I rendering right now" state without a shared context ancestor.
- `AUTO_SURFACED_KEY` — the sessionStorage key used to persist the once-per-session seen-set.

Wiring:
- `PendingStepGate`: `const step = ...` moved above its two early returns (guarded, `item ? findStep(...) : null`), and `useRegisterForcingOverlay(!!(item && step))` called before either return — hooks cannot live after a conditional return, and the registration must reflect what actually renders.
- `PendingCallGate`: `useRegisterForcingOverlay(!!pending)` called immediately before its `if (!pending) return null`.
- `NotificationsBell`: reads `useForcingOverlayActive()`; hydrates a `useRef<Set<string>>` from `sessionStorage[AUTO_SURFACED_KEY]` inside a mount-only effect (never touches `sessionStorage` at module scope or during render); a second effect keyed on `[feed, open, forcingOverlayActive]` computes unread ids + `isTypingInForm` (from `document.activeElement`) and calls `shouldAutoOpenBell`; on true, opens the panel and persists every currently-unread id (not just the triggering one) back to `sessionStorage`. Never calls `markNotificationsReadAction` on auto-open and never calls `.focus()` — the 4s poll, mousedown-outside close, `NO_NAVIGATE_TYPES` routing, and `markOne`/`markAll` are all unchanged.

7 new tests in `tests/lib/notification-autosurface.test.ts` cover the full decision matrix from `<behavior>` directly against `shouldAutoOpenBell` (pure, no DOM/React — matches the repo's `environment: 'node'` vitest config and the absence of a component-test harness).

## Deviations from Plan

None — plan executed exactly as written, including the exact `[{ name: 'Villa Rossi' }]` / `[{ name: 'Head of Projects' }]` mock row shapes specified for the two new selects in Task 2's test extension.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (3 pre-existing warnings in unrelated files, unchanged).
- `npm test` — 371 passed + 1 todo (372 total), up from the 360-test baseline at session start (+11: 4 in Task 2, 7 in Task 3) — confirms no existing test was replaced rather than extended.
- 260727-gow module-boundary grep gate (`grep -v '^\s*[/*]' actions/escalation.ts | grep -c 'completeGraphStep\|advanceOrConfirmDualRole\|projectStepCompletions\|workflowStepStates'`) → `0`.
- `git diff --stat db/schema.ts` — empty; no schema change was needed.
- Next 16 conventions preserved: no `middleware.ts` introduced, no unawaited `params`/`cookies()`/`headers()` sites touched.

Manual browser verification (bell auto-open behavior, focus-preservation while typing, overlay precedence with a live "Action required" modal or incoming call) was intentionally **not** performed by this executor — deferred to the orchestrator per the execution instructions.

## Recipient-Resolution Shape (for the planned email follow-up)

In `amendEscalatedChecklistAction`, the notification block resolves the recipient once, ahead of the `notifyUser` call:

```ts
const recipientId = escalation.createdBy
if (recipientId && recipientId !== userId) {
  try {
    const [proj] = await db.select({ name: projects.name }).from(projects)
      .where(eq(projects.id, escalation.projectId)).limit(1)
    const [amender] = await db.select({ name: users.name }).from(users)
      .where(eq(users.id, userId)).limit(1)
    // ... build title/body ...
    await notifyUser({ recipientId, actorId: userId, type: 'escalation_amended', title, body, projectId: escalation.projectId })
  } catch { /* swallowed */ }
}
```

A follow-up Resend email send can be added inside the same `try` block, addressed to the same `recipientId` (after resolving that user's email, e.g. via one more `db.select({ email: users.email })` scoped to `recipientId`), without restructuring this guard/skip logic. The whole block already swallows failures, so an email-send failure would need its own inner guard if it must not suppress the in-app notification (or vice versa) — worth a one-line decision when that follow-up is planned.

## Self-Check: PASSED
