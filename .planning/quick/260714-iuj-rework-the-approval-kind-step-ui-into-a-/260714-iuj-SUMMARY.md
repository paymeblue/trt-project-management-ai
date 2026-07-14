---
phase: quick-260714-iuj
plan: 01
subsystem: workflow-graph / approval-kind step UI
tags: [workflow, approval, two-party, deadlock-fix, notifications, my-work]
dependency-graph:
  requires: []
  provides:
    - "approvalSenderEligible/approvalReceiverEligible deadlock-guard helpers (lib/workflow-graph.ts)"
    - "pickApprovalDrawing fallback-chain helper + getApprovalState/getApprovalDrawing/getApprovalReceiverHolders readers"
    - "rejectApproval engine fn + approveAndCompleteApprovalAction/rejectApprovalAction server actions"
    - "phase-aware two-party ApprovalStep UI with drawing pane"
  affects:
    - "app/(app)/workflow/step/page.tsx (approval branch)"
    - "app/_components/notifications-bell.tsx (routing allowlist)"
    - "lib/my-work.ts (pending filter)"
tech-stack:
  added: []
  patterns:
    - "Deadlock guard as a pure, unit-tested predicate (approvalSenderEligible) rather than only a server-side throw"
    - "Server-resolved, advisory-only UI props — every mutation still re-checked via authorizeStep(forReceive)"
key-files:
  created:
    - tests/lib/workflow-approval-eligibility.test.ts
  modified:
    - lib/workflow-graph.ts
    - actions/workflow-graph.ts
    - app/(app)/workflow/step/page.tsx
    - app/_components/workflow-kinds/approval-step.tsx
    - app/_components/notifications-bell.tsx
    - lib/my-work.ts
decisions:
  - "approveAndCompleteApprovalAction chains receiveApproval + completeGraphStep server-side with the SAME actorId, so completedBy is durably attributed to the receiver from one click (per plan's ask #4), rather than requiring a second 'Complete step' click."
  - "rejectApprovalAction is authorized exactly like receive (authorizeStep(..., forReceive=true)) — only a receiver-eligible user may reject, matching the plan's explicit instruction."
  - "DrawingPane does not wrap <img> in a clickable <a href={dataUrl}> (unlike the audit page's UploadCell) — not required by the plan/threat model and reduces surface; filename-only fallback for non-image uploads is unchanged from the audit pattern."
metrics:
  duration_minutes: 35
  completed: 2026-07-14
---

# Quick Task 260714-iuj: Rework the approval-kind step UI into a phase-aware, two-party flow — Summary

Reworked the `approval`-kind workflow step (previously three bare buttons: "Send for approval" / "Receive / approve" / "Complete step") into a phase-aware, plain-language, two-party flow where a receive-gate holder (e.g. the CPO on `send_for_production`) can never be shown a send control — making the deadlock incident that motivated this task (CPO self-recorded as sender, then correctly rejected by the two-party engine rule, with nobody else holding the CPO title) impossible by construction in the UI, while the server-side two-party rule stays as the real enforcement boundary.

## What Was Built

**Task 1 — Server engine + actions (deadlock-safe two-party approval):**
- `lib/workflow-graph.ts`: pure helpers `approvalSenderEligible`/`approvalReceiverEligible` (the deadlock guard — a receive-gate holder is never sender-eligible) and `pickApprovalDrawing` (drawing fallback chain: `internal_approval` → `confirmation_correction` → `design_stage`); readers `getApprovalState`/`getApprovalDrawing`/`getApprovalReceiverHolders`; new engine fn `rejectApproval` (returns a 'sent' approval to phase 1/2, clearing `sentBy`, never touching the step definition or edges).
- `actions/workflow-graph.ts`: `sendApprovalAction` now notifies every receiver-title holder on send (never throws on an empty holder list — the UI surfaces that as a warning instead); new `approveAndCompleteApprovalAction` chains `receiveApproval` + `completeGraphStep` so `completedBy` = the receiver; new `rejectApprovalAction` (receive-gated) notifies the original sender.
- `tests/lib/workflow-approval-eligibility.test.ts`: 9 unit tests covering the `send_for_production` deadlock shape (CPO viewer under both `super_admin` and `operations` roles, ops-admin viewer, an unrelated role) and the drawing fallback chain (prefer/fallback/null cases).

**Task 2 — Phase-aware UI:**
- `app/(app)/workflow/step/page.tsx`: the `case 'approval':` branch now server-resolves phase (`send`/`sent` from `getApprovalState`), sender/receiver eligibility, the drawing, receiver-holder count, sender/receiver labels, and sender name, passing them all as props.
- `app/_components/workflow-kinds/approval-step.tsx`: fully rewritten. Drawing pane shown to both parties in every phase (`data:image/` → `<img>`, else filename text, else "No drawing found on the design steps." — never a clickable `data:` link for non-images). Phase `send`: heading "1/2 — {role}: approve design & send to Factory"; sender-eligible sees one button "Approve design & send to Factory" (+ no-holder warning inline); receiver-eligible sees "You are the receiving party — {role} sends this to you first." (no button); everyone else sees a waiting message. Phase `sent`: receiver-eligible sees "2/2 — {receiver title}: approve for production" + "Approve & send to Factory" (single click: receive + complete) + "Reject design" (returns to 1/2, `router.refresh()`, no redirect); everyone else sees a waiting banner with sender name + no-holder warning.
- `app/_components/notifications-bell.tsx`: replaced the `type !== 'assignment'` check with a `NO_NAVIGATE_TYPES` allowlist (`assignment`, `approval_request`, `approval_rejected`) so approval notifications mark-read + refresh instead of routing to the super-admin-only `/disputes` page.

**Task 3 — my-work pending filter:**
- `lib/my-work.ts`: a second bounded map (`approvalStateByProjectId`) populated in the same per-project loop as the existing assignee gate, only for active projects whose current step is approval-kind (one `getApprovalState` query per such project, not N queries across all projects). The pending filter now excludes a 'sent' approval from the sender's pending list and includes it only for a receiver-eligible caller who is not the sender.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a grep-self-defeating code comment in approval-step.tsx**
- **Found during:** Task 2 verification
- **Issue:** The file-header comment I wrote quoted the literal old button label strings ("Send for approval" / "Receive / approve") to explain what was replaced, which made the plan's own done-criteria grep (`grep -c "Send for approval\|Receive / approve\|Complete step"`) print 1 instead of the required 0.
- **Fix:** Reworded the comment to describe the old UI without using the literal quoted strings.
- **Files modified:** `app/_components/workflow-kinds/approval-step.tsx`
- **Commit:** `67490e4`

**2. [Rule 3 - Blocking, environmental] A concurrent process's stray commit bundled my Task 2 edit with an unrelated file**
- **Found during:** Task 2, pre-commit `git status` check
- **Issue:** Mid-task, a commit titled "update" (authored by the repo's configured git user, not by me) landed on `main` between my Task 1 and Task 2 commits. It bundled my in-progress, uncommitted edit to `app/(app)/workflow/step/page.tsx` together with a new file from an unrelated, concurrently-running plan (`.planning/quick/260714-bpq-renameable-positions/260714-bpq-PLAN.md` — explicitly out of scope per this plan's scope guard). This was evidently another process/session operating in the same working tree concurrently with this execution.
- **Fix:** Verified no other ref pointed at the stray commit and nothing had been pushed, then `git reset --soft HEAD~1` followed by `git reset` (mixed) to undo the stray commit while preserving both my working-tree edit and the unrelated plan file's original untracked state. Re-verified `tsc --noEmit` was still clean, then re-committed Task 2 with only its own files (`page.tsx`, `approval-step.tsx`, `notifications-bell.tsx`), leaving the unrelated positions-plan file exactly as it was before (untracked, untouched).
- **Files affected:** none of my task files were altered in content by this; only git history was corrected.
- **Commit:** `67490e4` (the corrected, atomic Task 2 commit)

### Known Environmental Blocker (not a code deviation)

**`npm run build` could not complete — host disk is full, unrelated to this task's code.**
- `npx tsc --noEmit`, `npm run lint`, and `npm test` (111 tests, 1 pre-existing todo) all pass cleanly.
- `npm run build` fails with `ENOSPC: no space left on device` while writing `.next/static` and webpack cache files. `df -h` on the project's volume shows 409Gi used / 460Gi total with as little as ~100–560Mi free during the attempt — a machine-wide disk-space exhaustion, not a defect introduced by this task. Compilation itself (the TypeScript pass inside `next build`) succeeded on the first attempt before failing at trace-file/static-asset write time.
- I removed this project's own regenerable `.next` directory (zero blast radius, project-scoped) to free some headroom and retried; the build still ran out of space partway through, because free space across the whole disk is on the order of hundreds of megabytes, not enough headroom for a Next.js production build's temp/cache writes regardless of what this repo alone can free.
- I did not attempt any broader, riskier disk cleanup outside this project (that would have a large, hard-to-reverse blast radius and needs the user's explicit direction) — per CLAUDE.md's blast-radius guidance, this is surfaced as a blocker rather than auto-remediated.
- **Recommended next step:** free disk space on the host (`~460Gi` volume is at 100% capacity) and re-run `npm run build` to complete the final verification. No code changes are implicated.

## Self-Check: PASSED

All files confirmed present on disk:
- FOUND: lib/workflow-graph.ts
- FOUND: actions/workflow-graph.ts
- FOUND: tests/lib/workflow-approval-eligibility.test.ts
- FOUND: app/(app)/workflow/step/page.tsx
- FOUND: app/_components/workflow-kinds/approval-step.tsx
- FOUND: app/_components/notifications-bell.tsx
- FOUND: lib/my-work.ts

All commits confirmed present in `git log`:
- FOUND: 067a9ff (Task 1)
- FOUND: 67490e4 (Task 2)
- FOUND: a598875 (Task 3)

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (clean) |
| `npm run lint` | PASS (0 errors, 1 pre-existing unrelated warning in `app/layout.tsx`) |
| `npm test` | PASS (14 test files, 111 tests passed, 1 pre-existing todo) |
| `npm run build` | BLOCKED — host disk full (`ENOSPC`), unrelated to this task's code; see "Known Environmental Blocker" above |

## Threat Flags

None — all threat-model mitigations (T-iuj-01 through T-iuj-05, T-iuj-SC) were implemented as specified: both new actions gate through `authorizeStep(..., forReceive=true)`; the deadlock guard is enforced both by the pure eligibility helpers (UI) and the unchanged `receiveApproval` two-party check (server); the drawing pane renders `<img>` only for `data:image/` uploads; `completedBy` is attributed to the receiver via the chained server action; reject resets to 'pending' with a no-holder warning surfaced in the UI rather than silently blocking; no new packages were introduced.
