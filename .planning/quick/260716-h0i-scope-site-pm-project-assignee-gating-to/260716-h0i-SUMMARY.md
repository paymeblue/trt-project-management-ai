---
phase: quick-260716-h0i
plan: 01
subsystem: auth
tags: [authorization, workflow-graph, server-actions, drizzle, vitest]

requires:
  - phase: quick-260713-ekr
    provides: "The original ASSIGNEE_GATED_STEPS map + assigneeGoverningStepKey/getStepAssigneeGate mechanism for design-side steps"
provides:
  - "Role-scoped assignee gate covering confirmation, materials_readiness (site_pm half), installation_process, sign_off — enforced server-side at submitChecklistAction, submitReadinessAction, advanceProjectStep, and confirmDualRoleStepAs"
  - "assigneeGatedRole(stepKey) export for any future consumer needing to know which role a gated step's assignee gate applies to"
affects: [my-work, checklists, readiness, workflow-graph]

tech-stack:
  added: []
  patterns:
    - "Assignee gate call-site pattern: `if (assigneeGatedRole(step.key) === role) { const gateUserId = await getStepAssigneeGate('live', projectId, step.key); if (gateUserId && gateUserId !== userId) { reject } }` placed after the existing role/dualRoles check and before any DB write."

key-files:
  created: []
  modified:
    - lib/workflow-graph.ts
    - lib/my-work.ts
    - actions/checklists.ts
    - actions/readiness.ts
    - actions/workflow.ts
    - tests/lib/workflow-graph-assignee-gate.test.ts
    - tests/actions/readiness.test.ts
    - tests/actions/workflow.test.ts

key-decisions:
  - "ASSIGNEE_GATED_STEPS restructured from Record<string,string> to Record<string,{governingKey,gatedRole}> rather than adding a parallel map, keeping one source of truth per gated step."
  - "workflow.test.ts uses a partial vi.mock (importOriginal) for @/lib/workflow-graph so getLiveWorkflowSteps keeps its real DB-mock-backed behavior while assigneeGatedRole/getStepAssigneeGate become controllable test doubles — avoids re-plumbing the file's existing LIVE_WORKFLOW_STEPS-based fixtures."
  - "Rewrote the stale lib/workflow-graph.ts comment block that previously documented confirmation as deliberately NOT gated (because only a 'your turn' hint existed); it now IS gated with real enforcement, so the comment was corrected rather than left misleading."

requirements-completed: [SEC-ASSIGNEE-GATE]

duration: ~35min
completed: 2026-07-16
---

# Quick Task 260716-h0i: Scope site_pm Project-Assignee Gating Summary

**Extended the existing hardcoded assignee-gate mechanism so only the site_pm assigned via `ops_design_confirmation` can act on confirmation, materials_readiness (site_pm half), installation_process, and sign_off — enforced server-side at every call site, with a dedicated test proving a factory_pm's own half of the dual-role materials_readiness step is completely unaffected.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 (2 code tasks + 1 verification-only sweep)
- **Files modified:** 8

## Accomplishments
- Closed the authorization gap where any site_pm role-holder (not just the assigned one) could act project-wide on confirmation, materials_readiness, installation_process, and sign_off.
- Real server-side enforcement at all 4 relevant functions: `submitChecklistAction`, `submitReadinessAction`, `advanceProjectStep`, `confirmDualRoleStepAs` — rejecting before any DB write.
- Proved the dual-role safety property with tests that exercise the real `assigneeGatedRole(step.key) === role` code path (not a trivially-true assertion): a factory_pm confirming their own half of `materials_readiness` never even calls `getStepAssigneeGate`, even when the mock is set up so it WOULD reject them if called.
- `sign_off` is enforced automatically via the existing generic pattern — zero changes to `actions/workflow-graph.ts` or the step page, as specified.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend gate map with role-scoping + role-scope my-work resolution** - `33d7632` (feat)
2. **Task 2: Enforce the assignee gate at all server-action call sites** - `9ab5dc1` (feat)
3. **Task 3: Full verification sweep** - no source changes; verification-only (tsc/lint/full vitest all green)

**Plan metadata:** committed separately by the orchestrator (not this executor).

## Files Created/Modified
- `lib/workflow-graph.ts` - `ASSIGNEE_GATED_STEPS` restructured to `Record<string,{governingKey,gatedRole}>`; added 4 new entries (confirmation/materials_readiness/installation_process/sign_off → ops_design_confirmation, site_pm); added `assigneeGatedRole()` export; rewrote the now-stale explanatory comment.
- `lib/my-work.ts` - `getMyWork`'s gate resolution now also requires `assigneeGatedRole(step.key) === role`, so an ungated role never sees (or is scoped by) a gate that isn't theirs.
- `actions/checklists.ts` - `submitChecklistAction`'s step-linked block rejects an unassigned gated caller before the DB insert.
- `actions/readiness.ts` - `submitReadinessAction`'s step-linked block rejects an unassigned gated caller before the DB insert.
- `actions/workflow.ts` - `advanceProjectStep` and `confirmDualRoleStepAs` both reject an unassigned gated caller before any write.
- `tests/lib/workflow-graph-assignee-gate.test.ts` - added `assigneeGoverningStepKey`/`assigneeGatedRole` cases for the 4 new step keys; 6 pre-existing assertions left unmodified.
- `tests/actions/readiness.test.ts` - added `assigneeGatedRoleMock`/`getStepAssigneeGateMock` to the existing `vi.mock`; 3 new cases (assigned, unassigned, dual-role-safety).
- `tests/actions/workflow.test.ts` - added a partial `vi.mock` for `@/lib/workflow-graph` (real `getLiveWorkflowSteps`, mocked gate functions); 5 new cases across `advanceProjectStep` and `confirmDualRoleStepAs` (assigned/unassigned for each, plus the dual-role-safety case for `confirmDualRoleStepAs`).

## Decisions Made
- Kept the gate map as a single restructured object rather than a second parallel lookup — `assigneeGoverningStepKey` and `assigneeGatedRole` both read from the same `ASSIGNEE_GATED_STEPS` entries, so there's no risk of the two falling out of sync.
- For `workflow.test.ts`, used `vi.mock('@/lib/workflow-graph', async (importOriginal) => ...)` to keep `getLiveWorkflowSteps` wired to its real implementation (which the file's existing tests already depend on via the `dbMock`/`selectOrderByMock` chain and `LIVE_WORKFLOW_STEPS` fixtures) while making `assigneeGatedRole`/`getStepAssigneeGate` independently controllable — this avoided having to rebuild that file's entire step-fixture plumbing around a fully-mocked module.
- Corrected the pre-existing `lib/workflow-graph.ts` comment block that explained why `confirmation` was "deliberately NOT added" to the gate map (a decision this task explicitly reverses now that real enforcement exists at every relevant call site).

## Deviations from Plan

None - plan executed exactly as written. All `files_modified` in the plan frontmatter were touched exactly as specified; no additional files were changed.

## Issues Encountered

**Verification command cwd:** the plan's `<verify>` blocks specify `cd /Users/.../trt-pm && npx vitest run ...` (the main repo path). Since this execution runs inside a git worktree at `.../trt-pm/.claude/worktrees/agent-a5bed1a585987e167/`, running that literal command would test the main repo's checked-out branch (which doesn't have this task's edits) instead of the worktree's changes. All verification commands were instead run directly from the worktree root (`npx vitest run ...` without the `cd`), which correctly resolves `vitest`/`tsc`/`eslint` binaries via Node's ancestor `node_modules` lookup (the worktree has no local `node_modules`, but its parent-of-parent directory — the main repo checkout — does). Confirmed this resolves and runs against the worktree's file contents by checking that the newly-added test cases appeared in the verbose reporter output.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The assignee-gate mechanism now covers every step listed in the plan's success criteria. No follow-up scope was identified — the plan's original design already accounted for `sign_off` being covered automatically via the existing generic `authorizeStep` pattern once the map entry was added, and that held true with zero changes needed to `actions/workflow-graph.ts` or the step page.

---
*Phase: quick-260716-h0i*
*Completed: 2026-07-16*

## Self-Check: PASSED

All 8 modified/created source and test files confirmed present on disk. Both task commits (`33d7632`, `9ab5dc1`) confirmed in git log.
