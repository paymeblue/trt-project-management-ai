---
phase: quick-260727-gow
plan: 01
subsystem: workflow
tags: [drizzle, next-server-actions, authorization, checklists, dispute-thread]

requires:
  - phase: quick-260727-g7a
    provides: stepPositionMismatch/requiredPosition enforcement pattern reused conceptually (fresh-db-read authorization, never session claims)
provides:
  - Durable step_escalations table capturing WHAT was escalated (project, step, checklist, reason, targetPosition captured at creation)
  - canAmendEscalation pure authorization predicate (admin bypass OR fresh-position match)
  - amendEscalatedChecklistAction — authorization-gated upsert (amend-in-place or create-from-blank) of an escalated checklist's content
  - loadEscalationPanelData — server helper feeding the inline dispute-page panel
  - EscalationAmendPanel — inline, collapsed-by-default editing UI on /disputes/{projectId}
affects: [disputes, checklists, escalation]

tech-stack:
  added: []
  patterns:
    - "Fresh-db-read authorization for mutable position claims (never session/JWT), consistent with quick-260727-g7a's stepPositionMismatch"
    - "Targetposition captured at escalation-creation time to prevent later role-change re-routing authorization"
    - "Amend-or-create upsert keyed on newest checklists row for (projectId, definitionId), never re-deriving item set from client payload"

key-files:
  created:
    - app/_components/escalation-amend-panel.tsx
    - tests/actions/escalation-amend.test.ts
    - .planning/quick/260727-gow-escalation-step-content-upsert-by-superv/260727-gow-SUMMARY.md
  modified:
    - db/schema.ts
    - lib/escalation.ts
    - actions/escalation.ts
    - app/_components/escalate-button.tsx
    - "app/(app)/checklists/[slug]/page.tsx"
    - "app/(app)/factory-pm/readiness/page.tsx"
    - "app/(app)/disputes/[projectId]/page.tsx"
    - tests/actions/escalation.test.ts

key-decisions:
  - "D-01/D-02/D-03 locked by the plan: admin-bypass-or-target-position authorization, amend-record-only semantics (never touches projects.currentStep/projectStepCompletions/workflowStepStates), inline surface on the dispute page (no link-out)"
  - "Grep-gate constraint discovered during Task 2: the plan's own verification forbids literal mentions of completeGraphStep/advanceOrConfirmDualRole/projectStepCompletions/workflowStepStates anywhere in actions/escalation.ts, including comments — rephrased the D-02 rationale comments to describe the constraint without using the literal banned identifiers, satisfying both the human-readable intent and the automated grep gate"
  - "Photo evidence editing is out of scope per the plan; the amend panel never renders or accepts photo data, and checklists.photoData is never touched by the amend path"

requirements-completed: [QT-260727-gow]

duration: 16min
completed: 2026-07-27
---

# Phase quick-260727-gow: Escalation Step Content Upsert by Supervisor Summary

**Escalations now persist a durable `step_escalations` row (project + step + checklist + captured targetPosition) and the target superior can view/upsert the escalated checklist's content inline on the dispute page, authorization-gated by a fresh-db-read position check.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-27T12:07:00+01:00 (approx.)
- **Completed:** 2026-07-27T12:21:42+01:00
- **Tasks:** 3 completed
- **Files modified:** 10 (2 created, 8 modified, excluding this SUMMARY)

## Accomplishments

- New additive `step_escalations` table + `checklists.amended_by`/`amended_at` columns, pushed to the live Neon DB additively (verified idempotent on re-run)
- `canAmendEscalation` pure predicate (`lib/escalation.ts`) unit-covered for all 5 required cases (admin bypass ×2, position match, position mismatch, null position)
- `escalateChecklistAction` now writes one `step_escalations` row before the existing notification fan-out, with zero write when the escalation is unroutable (no recipients)
- `amendEscalatedChecklistAction` + `loadEscalationPanelData`: authorization strictly before any write, fresh `users.position` read (never session), amend-in-place vs create-from-blank upsert, server-derived active item set (client-supplied unknown/inactive item ids discarded), zero writes on any rejection path
- Inline `EscalationAmendPanel` on `/disputes/{projectId}`: collapsed by default, grouped by section, pre-filled from the officer's latest answers, disabled+explained when the viewer can't amend, "Amended by <name>, <time>" audit line
- Full gate green: `tsc --noEmit`, `npm run lint` (0 errors, 3 pre-existing warnings, no new ones), `npm test` (329 passed + 1 todo, 0 regressions)

## Task Commits

1. **Task 1: Persist escalation step identity (schema + capture at creation)** - `d29687d` (feat)
2. **Task 2: amendEscalatedChecklistAction — authorization + upsert both paths** - `0dfc0d8` (test, RED) → `ddab8ed` (feat, GREEN)
3. **Task 3: Inline amend panel on the dispute page** - `f7daf3c` (feat)

**Plan metadata:** (this commit — docs: complete plan)

_Task 2 followed the RED→GREEN TDD cycle: `0dfc0d8` added the full behavior-spec test file (10 of 11 tests failing as expected — the one pre-passing test was a static source-content assertion with no dependency on the new exports existing, not a behavioral false-positive), then `ddab8ed` implemented both exports and turned all 11 green._

## Files Created/Modified

- `db/schema.ts` - `stepEscalations` table (additive) + `checklists.amendedBy`/`amendedAt` (additive, nullable)
- `lib/escalation.ts` - `canAmendEscalation(role, viewerPosition, targetPosition)` pure predicate
- `actions/escalation.ts` - `escalateChecklistAction` extended (checklistSlug/stepN capture); new `amendEscalatedChecklistAction` + `loadEscalationPanelData`
- `app/_components/escalate-button.tsx` - threads `checklistSlug`/`stepN` optional props through to the action
- `app/(app)/checklists/[slug]/page.tsx` - passes `checklistSlug={def.slug}` + `stepN={workflowStepN}`
- `app/(app)/factory-pm/readiness/page.tsx` - passes `stepN` only (readiness has no checklist definition)
- `app/(app)/disputes/[projectId]/page.tsx` - renders one `EscalationAmendPanel` per `step_escalations` row after the existing alerts block; `verifySession()` destructure widened to include `role`
- `app/_components/escalation-amend-panel.tsx` - new inline client editing panel
- `tests/actions/escalation.test.ts` - extended with `canAmendEscalation` table + insert-path coverage for `escalateChecklistAction`
- `tests/actions/escalation-amend.test.ts` - new: authorization + both upsert paths + D-02 grep-style module-boundary check

## Decisions Made

- Targeted position is captured at escalation-creation time (not re-derived from the escalator's current role later) — matches D-01 exactly, preventing a post-escalation role change from silently re-routing amend authorization.
- The plan's Task 2 verification grep-gates `actions/escalation.ts` against literal occurrences of `completeGraphStep`, `advanceOrConfirmDualRole`, `projectStepCompletions`, `workflowStepStates` — including in comments. Rephrased the D-02 rationale comments to convey the same constraint (project's current-step counter, step-completion/state-tracking tables, step-completion function) without using the literal banned identifiers, so both the human documentation intent and the automated gate are satisfied.
- Photo evidence rendering was scoped out entirely (per the plan's explicit out-of-scope note) rather than added as a one-liner, since `loadEscalationPanelData` doesn't fetch `photoData` — simplest correct choice that guarantees the amend path can never touch it.

## Deviations from Plan

None - plan executed exactly as written, aside from the grep-gate comment rephrasing documented above under Decisions Made (Rule 1/Rule 3-adjacent: a wording fix required to make the plan's own stated verification pass, not a functional change).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `npm run db:push` was run by the executor against the live Neon DB as part of Task 1 and confirmed additive-only + idempotent.

## Next Phase Readiness

- Backfill is explicitly out of scope (per the plan): only escalations created after this ships have an actionable panel; pre-existing escalations keep rendering as the read-only banner only.
- Manual browser verification (the plan's Task 3 human-check flow — escalate as factory_pm, amend as chief_production_officer, confirm project currentStep unchanged, confirm a wrong-position viewer sees a disabled panel) is deferred to the orchestrator per the execution instructions; automated gate (tsc/lint/test) is green.

---
*Phase: quick-260727-gow*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 11 files created/modified in this plan verified present on disk; all 4 task commit hashes (`d29687d`, `0dfc0d8`, `ddab8ed`, `f7daf3c`) verified present in git log.
