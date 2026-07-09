---
phase: 16-workflow-engine-core
plan: 05
subsystem: ui
tags: [nextjs, react, server-components, server-actions, workflow-engine, app-router]

# Dependency graph
requires:
  - phase: 16-03
    provides: actions/workflow-graph.ts server actions (completeStepAction, submitYesNoUploadAction, sendApprovalAction, receiveApprovalAction, assignUserAction)
  - phase: 16-04
    provides: db/seed-workflow-test-graph.ts — the graph='test' fixture these renderers target (test_yesno, test_approval, test_assign)
provides:
  - app/(app)/workflow/step/page.tsx — server route resolving a graph step by projectId+step key (+graph, default 'test') and dispatching to the correct kind renderer under role gating
  - app/_components/workflow-kinds/{yes-no-upload-step,approval-step,assignment-step}.tsx — minimal 'use client' renderers for the 3 new fulfillment kinds, each submitting through the plan 03 server actions
affects: [phase-17-migration, phase-18-ui-polish, phase-19-ui-polish, phase-21-ui-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kind renderers follow the existing useTransition + direct server-action-call pattern (app/_components/approval-actions.tsx) rather than useActionState — simpler for multi-button components where each button triggers a distinct action, not a single form submit"
    - "graphStepHref's '/workflow/step' destination (lib/workflow.ts, plan 02) now has a real implementation; the route keeps 'graph' as an explicit searchParam defaulting to 'test' rather than hardcoding, so Phase 17 can point live projects at graph='live' without changing this route"
    - "Server page resolves and passes assignment candidates (users filtered by step.targetRole) as a prop — client components cannot query the DB directly, mirroring the existing checklists/[slug]/page.tsx role-gating pattern"

key-files:
  created:
    - app/(app)/workflow/step/page.tsx
    - app/_components/workflow-kinds/yes-no-upload-step.tsx
    - app/_components/workflow-kinds/approval-step.tsx
    - app/_components/workflow-kinds/assignment-step.tsx
  modified: []

key-decisions:
  - "Used useTransition + direct async server-action calls (mirroring app/_components/approval-actions.tsx) instead of useActionState/useFormState, since each renderer has multiple independent buttons (submit vs. complete; send vs. receive vs. complete; assign vs. complete) rather than a single form with one submit path"
  - "The route's 'graph' searchParam defaults to 'test' (not hardcoded), keeping the door open for Phase 17 to point real project steps at 'live' once migrated, per the plan's explicit instruction"
  - "Unmapped step kinds (checklist/readiness/ack/creation) render a short inline note rather than a redirect, since their existing routes take different URL shapes (e.g. /checklists/[slug]) that this generic route can't reconstruct without more context than is in scope here"

requirements-completed: [WF-03]

# Metrics
duration: ~6min
completed: 2026-07-09
---

# Phase 16 Plan 05: Minimal Kind Renderers for the Workflow Test Graph Summary

**A `/workflow/step` server route resolving a graph step by projectId+key and dispatching to three new minimal client renderers (yes/no+upload, two-party approval, role-filtered assignment picker), each submitting through the plan 03 server actions — proving WF-03's "renders its correct interface" half at test-graph fidelity.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-09T11:47:00Z
- **Completed:** 2026-07-09T11:52:03Z
- **Tasks:** 2 completed
- **Files modified:** 4 (all new)

## Accomplishments
- `app/(app)/workflow/step/page.tsx` is a server component that awaits `searchParams` (Next 16's async API), resolves the step via `getStepByKey(graph, step)` (graph defaulting to `'test'`), gates with `verifySession` + `canRoleActOnStep` before rendering anything, and dispatches on `step.kind` to the correct client renderer — mirroring the existing `checklists/[slug]/page.tsx` gating pattern
- Three new minimal `'use client'` components under `app/_components/workflow-kinds/` present the correct controls for each new fulfillment kind and submit through the plan 03 actions: `YesNoUploadStep` (yes/no toggle + optional file upload → `submitYesNoUploadAction`), `ApprovalStep` (send/receive/complete → `sendApprovalAction`/`receiveApprovalAction`), `AssignmentStep` (candidate `<select>` of users filtered to `step.targetRole`, resolved server-side and passed as a prop → `assignUserAction`)
- Every renderer also exposes a "Complete step" button calling `completeStepAction`, and surfaces the action's returned `{ ok, message }` directly so a human/test can see gate outcomes (including engine rejection reasons like self-approval or role mismatch) inline
- `npx tsc --noEmit` is clean project-wide and `npx next build` compiles `/workflow/step` successfully alongside all other routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Server route /workflow/step resolving a graph step and dispatching by kind** - `7f90bdc` (feat)
2. **Task 2: Three minimal kind renderers (client components) wired to server actions** - `766bc6f` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `app/(app)/workflow/step/page.tsx` - Server route: awaits searchParams, resolves the step, gates by role, queries assignment candidates by targetRole, dispatches to the matching kind component (or a short note for kinds served by their existing routes).
- `app/_components/workflow-kinds/yes-no-upload-step.tsx` - Yes/no toggle + optional file input (reusing the `downscaleImage` FileReader pattern from `readiness-form.tsx`); submit and complete-step buttons.
- `app/_components/workflow-kinds/approval-step.tsx` - Send/receive/complete buttons for the two-party approval kind.
- `app/_components/workflow-kinds/assignment-step.tsx` - Candidate `<select>` + assign/complete buttons for the assignment kind.

## Decisions Made
- Followed the existing `useTransition`-based action-call pattern (`approval-actions.tsx`) instead of `useActionState`, since these components each have multiple independent action buttons rather than one form submission.
- Kept the route's `graph` param an explicit, defaulted searchParam rather than hardcoding `'test'` inline, per the plan's own instruction, so Phase 17 doesn't need to touch this route to serve `'live'` steps later.
- Unmapped kinds (checklist/readiness/ack/creation) render an inline note rather than attempting a redirect, since reconstructing their real destination (e.g. a checklist slug) is out of scope for this minimal route.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- This closes out Phase 16 (Workflow Engine Core) — all 5 plans complete. The read engine (16-02), write engine + actions (16-03), test graph + harness (16-04), and now the minimal UI surfaces (16-05) are all in place and verified.
- Phase 17 (Confirmation → Sign Off Migration, flagged as highest-risk) can now migrate the existing 11 live steps into this same graph representation, reusing `graphStepHref`'s existing `/workflow/step` destination for any new fulfillment-kind steps it introduces.
- No blockers.

---
*Phase: 16-workflow-engine-core*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: app/(app)/workflow/step/page.tsx
- FOUND: app/_components/workflow-kinds/yes-no-upload-step.tsx
- FOUND: app/_components/workflow-kinds/approval-step.tsx
- FOUND: app/_components/workflow-kinds/assignment-step.tsx
- FOUND: commit 7f90bdc (feat(16-05): add /workflow/step route resolving a graph step by kind)
- FOUND: commit 766bc6f (feat(16-05): add three minimal kind renderers for the workflow test graph)
