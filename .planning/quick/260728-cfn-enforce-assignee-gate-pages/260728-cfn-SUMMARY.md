---
status: complete
phase: quick-260728-cfn
plan: 01
subsystem: workflow / authorization (read-side visibility)
tags: [assignee-gate, anti-stranding, workflow-graph, projects-board]
requires: [260727-g7a, 260716-h0i]
provides: [GAP-1, GAP-2, GAP-3, MSG-1]
affects:
  - lib/workflow-graph.ts
  - actions/workflow.ts
  - actions/checklists.ts
  - actions/readiness.ts
  - app/(app)/checklists/[slug]/page.tsx
  - app/(app)/factory-pm/readiness/page.tsx
  - lib/projects-board.ts
  - app/api/projects/route.ts
  - app/(app)/factory-pm/projects/page.tsx
  - app/(app)/site-pm/projects/page.tsx
  - app/_components/project-steps-board.tsx
tech-stack:
  added: []
  patterns:
    - "Read-side gate mirrors an existing write-side gate 1:1 (stepAssigneeMismatch mirrors stepPositionMismatch's shape exactly) — same fast-path-first, zero-query-when-not-applicable discipline"
    - "Message-only adoption: legacy write paths keep their own independent inline authorization blocks (defense in depth); only the user-facing string is centralized into one exported constant"
    - "Bounded per-project gate prefetch on a listing endpoint (lib/projects-board.ts) mirrors lib/my-work.ts's discipline — resolved once per project, only when the project's current step is actually gated for the viewer's role"
key-files:
  created: []
  modified:
    - lib/workflow-graph.ts
    - actions/workflow.ts
    - actions/checklists.ts
    - actions/readiness.ts
    - app/(app)/checklists/[slug]/page.tsx
    - app/(app)/factory-pm/readiness/page.tsx
    - lib/projects-board.ts
    - app/api/projects/route.ts
    - app/(app)/factory-pm/projects/page.tsx
    - app/(app)/site-pm/projects/page.tsx
    - app/_components/project-steps-board.tsx
    - tests/lib/workflow-graph-assignee-gate.test.ts
    - tests/actions/workflow.test.ts
    - tests/actions/readiness.test.ts
decisions:
  - "ASSIGNEE_MISMATCH_MESSAGE wording generalized from the old site_pm-specific literal ('This step is assigned to a specific Site PM for this project.') to a role-neutral sentence, since the same gate mechanism also covers design/architect steps (brief_taking, kickoff_meeting, design_stage, confirmation_correction)."
  - "The 3 legacy write paths (actions/workflow.ts, actions/readiness.ts, actions/checklists.ts) keep their existing inline `if (assigneeGatedRoles(...).includes(role)) { const gateUserId = await getStepAssigneeGate(...); ... }` blocks structurally unchanged — only the returned message string was swapped for the shared constant. stepAssigneeMismatch was NOT substituted in for these blocks, per the plan's explicit binding constraint (defense in depth must not collapse into one function)."
  - "getBoardProjects(viewerRole?) takes an OPTIONAL role parameter so the function stays byte-identical (every gatedToUserId null) for any future caller that omits it, while the 3 actual callers (both projects pages + the /api/projects poll) now all pass it."
metrics:
  duration: ~40min
  completed: 2026-07-28
---

# Phase quick-260728-cfn Plan 01: Enforce assignee gate on pre-submit pages + projects board Summary

Closed the pre-submit STRANDING gap: a non-assigned officer can no longer be shown an actionable gated checklist/readiness form or an "Open …" link/NEEDS YOU marker on the projects board — they're told (or simply see nothing to click) before investing any form-filling, matching what the 5 already-correct write-path gates would reject at submit anyway.

## What Was Built

### Task 1 — Shared `stepAssigneeMismatch` helper + `ASSIGNEE_MISMATCH_MESSAGE` constant
`lib/workflow-graph.ts` gained a new section directly below the existing `stepPositionMismatch` block, mirroring its shape exactly:
- `ASSIGNEE_MISMATCH_MESSAGE` — one role-neutral sentence, replacing the old site_pm-specific literal at all 3 call sites.
- `stepAssigneeMismatch(userId, projectId, step, role, graph = 'live')` — returns `false` immediately (zero DB queries) when `role` is not in `assigneeGatedRoles(step.key)`; otherwise resolves `getStepAssigneeGate` and returns whether it's held by someone else. `role` is a required parameter specifically so a factory_pm on the dual-role `materials_readiness` step never even triggers the lookup.
- Message-only adoption at `actions/workflow.ts` (`confirmDualRoleStepAs`), `actions/readiness.ts`, and `actions/checklists.ts` — each now imports `ASSIGNEE_MISMATCH_MESSAGE` and returns it in place of the old literal; the surrounding gate-check blocks are byte-for-byte unchanged in structure/logic.

`tests/lib/workflow-graph-assignee-gate.test.ts`'s flat `vi.mock('@/db', () => ({ db: {} }))` stub was replaced with a chainable `select().from().where().limit()` mock (same shape as `tests/actions/workflow.test.ts`) so the new `describe('stepAssigneeMismatch (quick task 260728-cfn)')` block could exercise all 4 required cases, including the zero-queries assertion (`expect(selectLimitMock).not.toHaveBeenCalled()`) for the factory_pm/materials_readiness dual-role safety case. All pre-existing pure tests in that file were left untouched. `tests/actions/workflow.test.ts`'s asserted message literal (line ~393) was updated to the new constant's text; `tests/actions/readiness.test.ts`'s `@/lib/workflow-graph` mock factory gained an `ASSIGNEE_MISMATCH_MESSAGE` stub (matching the real text) so the action's import resolves — no assertion in that file checks the message text directly, so nothing else needed updating there. (No `tests/actions/checklists.test.ts` file exists in this repo, so no update was needed for that write path's tests.)

### Task 2 — Wire the gate into both form pages' `workflowNotice` chains
`app/(app)/checklists/[slug]/page.tsx` and `app/(app)/factory-pm/readiness/page.tsx` each gained one new `else if` branch, inserted immediately after the existing `stepPositionMismatch` branch and before the final `else` that sets `workflowProjectId`/`workflowStepN` — so a stranded caller never reaches the wizard/form render path. Branch ordering (project/step existence → slug match → currentStep match → role → position → assignee) is unchanged. Both files' existing `@/lib/workflow-graph` imports were extended with `stepAssigneeMismatch` and `ASSIGNEE_MISMATCH_MESSAGE`.

### Task 3 — Thread `gatedToUserId` + `viewerUserId` into the client projects board
- `lib/projects-board.ts`: `getBoardProjects` gained an optional `viewerRole?: UserRole` parameter. When supplied, `getLiveWorkflowSteps()` is called once outside the per-project loop, then each non-paused, non-complete project's current step is checked via `assigneeGatedRoles(step.key).includes(viewerRole)` — only projects that pass this check pay the `getStepAssigneeGate` DB round trip. When `viewerRole` is omitted, behavior is byte-identical to today (every `gatedToUserId` is `null`).
- `app/api/projects/route.ts`: now captures `const { role } = await verifySession()` and passes it through — this poll replaces the entire board state every 4s, so omitting the role here would silently un-gate the board seconds after load.
- `app/(app)/factory-pm/projects/page.tsx` and `app/(app)/site-pm/projects/page.tsx`: both now capture `userId` + `role` from `verifySession()` (previously discarded entirely), pass `role` into `getBoardProjects(...)`, and pass `viewerUserId={userId}` to `<ProjectStepsBoard />`.
- `app/_components/project-steps-board.tsx`: `BoardProject` gained an optional `gatedToUserId?: string | null` field; `ProjectStepsBoard` and the internal `StepsModal` both gained a required `viewerUserId: string` prop. The modal's `mine` computation (which drives the "Open …" link, `AckComplete`, and `BypassRequest` controls) now also requires `!current || project.gatedToUserId == null || project.gatedToUserId === viewerUserId` — the `!current ||` guard is deliberate, since `gatedToUserId` is only ever resolved for the project's CURRENT step and must never gate a done/locked row. The board-level `needsViewer` function (drives the dropdown's " • NEEDS YOU" marker) got the same predicate without the `!current` guard, since it already operates on the current step exclusively. No copy in the component was changed — a gated non-assignee simply falls through to the existing amber "Waiting on …" line.

## Deviations from Plan

None — plan executed exactly as written, including the exact insertion points, guard comments, and byte-identical-when-omitted behavior specified for `getBoardProjects`.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test` — 375 passed + 1 todo (376 total), up from the 371-test baseline at session start (+4, all in Task 1's new `stepAssigneeMismatch` describe block) — confirms no regressions.
- `grep -rn "assigned to a specific Site PM" app actions lib tests` — 0 hits.
- `grep -n "ASSIGNEE_GATED_STEPS" -A 14 lib/workflow-graph.ts` — byte-identical to its pre-task content (8 entries, same governingKey/gatedRoles for every key).
- `grep -c "stepAssigneeMismatch" app/(app)/checklists/[slug]/page.tsx app/(app)/factory-pm/readiness/page.tsx` — both files reference it 3 times (import, comment, call site).
- `npm run lint` — **one pre-existing error found, out of this plan's scope**: `app/_components/audit-asset-gallery.tsx:32` (`react-hooks/set-state-in-effect`). This file is NOT in this plan's `files_modified` list and was found with an **uncommitted, unstaged** working-tree modification at the time of this run — evidence of a concurrent session editing the same shared working tree (consistent with the standing "Concurrent computer-use session" note for this repo). It predates and is unrelated to every change in this plan; running `npx eslint` scoped to only this plan's touched files (`lib/workflow-graph.ts`, `actions/workflow.ts`, `actions/checklists.ts`, `actions/readiness.ts`, both page files, `lib/projects-board.ts`, `app/api/projects/route.ts`, both projects pages, `project-steps-board.tsx`, and the 3 test files) produced only one unrelated pre-existing warning (`tests/actions/workflow.test.ts:55`, unused `_opts` param) and zero errors. Per the deviation rules' scope boundary, this was left untouched rather than fixed.

Manual browser verification (non-assignee sees no "Open …" link / NEEDS YOU marker; amber notice on hand-navigation to the gated checklist/readiness URL; assignee sees no change) was intentionally **not** performed by this executor — deferred to the orchestrator per the execution instructions.

## Self-Check: PASSED

- `lib/workflow-graph.ts` — FOUND (contains `export async function stepAssigneeMismatch` and `export const ASSIGNEE_MISMATCH_MESSAGE`)
- `tests/lib/workflow-graph-assignee-gate.test.ts` — FOUND (contains the new `stepAssigneeMismatch` describe block)
- Commit `afdeb9e` — FOUND in `git log --oneline`
- Commit `b247341` — FOUND in `git log --oneline`
- Commit `310e8a9` — FOUND in `git log --oneline`
