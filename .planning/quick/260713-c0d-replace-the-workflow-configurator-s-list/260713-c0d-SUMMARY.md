---
phase: quick-260713-c0d
plan: 01
subsystem: ui
tags: [react, next.js, workflow-configurator, drag-and-drop-removal, accessibility]

# Dependency graph
requires:
  - phase: Phase 18
    provides: "moveConfigStepToIndexAction server action (actions/workflow-config.ts) and the up/down button pattern precedent from checklist-editor.tsx"
provides:
  - "List-view step reordering via single-click up/down icon buttons"
  - "Per-row move-to-position number input for arbitrary 1-based jumps"
affects: [workflow-configurator, workflow-configurator-graph, workflow-configurator-shared]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Reused checklist-editor.tsx ItemRow's up/down icon-button pattern (text-gray-400 hover:text-primary disabled:opacity-30) for another reorderable list"]

key-files:
  created: []
  modified:
    - app/_components/workflow-configurator-editor.tsx

key-decisions:
  - "Removed the confirm-modal step entirely — up/down clicks and position-box submits are now immediate (single startTransition call), matching the plan's goal of eliminating the drag-then-confirm flow"
  - "Move-to-position input clamps out-of-range values on the parent (moveToIndex), not in the row component, keeping StepRow free of business logic"

requirements-completed: [QUICK-260713-c0d]

# Metrics
duration: 12min
completed: 2026-07-13
---

# Quick Task 260713-c0d: Replace Workflow Configurator List Drag-and-Drop with Up/Down Buttons Summary

**Replaced native HTML5 drag-and-drop reordering (with its separate confirm-modal step) in the Workflow Configurator's List view with single-click up/down icon buttons plus a per-row move-to-position number input, mirroring the existing checklist-editor.tsx pattern.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments
- Deleted all drag/confirm-modal state and handlers (`dragIndex`, `overIndex`, `pendingMove`, `onDrop`, `confirmMove`) from `ConfiguratorEditor`
- Added `moveToIndex(stepId, targetIndex)` — a single immediate `startTransition` call that clamps the target index and calls the unchanged `moveConfigStepToIndexAction`
- Rewrote `StepRow` to render stacked up/down `keyboard_arrow_up`/`keyboard_arrow_down` icon buttons (disabled at first/last position) and a compact move-to-position `<input type="number">` + Go button
- Updated the info banner (icon `swap_vert`, copy "Use the ↑ / ↓ buttons or the position box to reorder any step.") and the Add-step helper copy ("move it into place afterward")

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove drag state and wire an immediate move-to-index handler in ConfiguratorEditor** - `d7adaa4` (feat)
2. **Task 2: Rewrite StepRow with up/down buttons and a move-to-position input** - `c8a6685` (feat)

_Note: Both commits touch the same file; the diff was split by hunk along the plan's task boundaries (ConfiguratorEditor top-level changes in commit 1, StepRow rewrite in commit 2) using `git add -p`. Because the two tasks share tightly coupled state/props in one file, the intermediate state after commit 1 alone would not type-check in isolation — this is inherent to the plan's two-task split of a single component file, not a defect. Full verification (`tsc`, lint, tests, build) was run only against the final combined state, per the plan's `<verification>` section._

## Files Created/Modified
- `app/_components/workflow-configurator-editor.tsx` - List-view step reordering: removed drag-and-drop + confirm modal, added up/down buttons and move-to-position input on each `StepRow`

## Decisions Made
None beyond the plan's explicit design — followed the plan's literal instructions and the `checklist-editor.tsx` ItemRow precedent it referenced.

## Deviations from Plan

None - plan executed exactly as written. `actions/workflow-config.ts` was not touched (verified via `git diff` against the base commit). `moveConfigStepToIndexAction` is called with a correctly computed 0-based `targetIndex` in both the up/down button paths (`stepIndex ± 1`) and the move-to-position path (`parsedValue - 1`).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

List view reordering is fully click-based with no drag-and-drop or confirm modal remaining. Graph view (`workflow-configurator-graph.tsx`) was untouched and unaffected — it renders independently in the `view === 'graph'` branch. `moveConfigStepToIndexAction` and the branch/join simple-swap-only rewiring guarantee (from Phase 18) are unchanged, so no backend behavior changed.

Verification run against the final committed state:
- `npx tsc --noEmit` — clean
- `npm run lint` — clean (1 pre-existing unrelated warning in `app/layout.tsx`)
- `npm test` — 83 passed, 1 todo (11 test files)
- `npm run build` — compiled successfully, all routes generated

---
*Phase: quick-260713-c0d*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: commit d7adaa4
- FOUND: commit c8a6685
- FOUND: app/_components/workflow-configurator-editor.tsx
