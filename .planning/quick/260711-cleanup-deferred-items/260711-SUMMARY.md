---
phase: quick-260711-cleanup-deferred-items
plan: 01
subsystem: db-tooling
tags: [drizzle, workflow-graph, seed-script, db-push-idempotency]
requires: []
provides:
  - "db/seed-workflow-graph.ts: crash-safe fresh-DB seed matching the current 23-step live graph"
  - "db/schema.ts messageReactions: idempotent composite unique constraint (drizzle-kit push no longer churns it)"
affects:
  - db/seed-workflow-graph.ts
  - db/schema.ts
tech-stack:
  added: []
  patterns:
    - "drizzle-kit push composite-unique idempotency: declare .on(...) columns in the SAME order drizzle-kit's live introspection reports them in (information_schema.constraint_column_usage has no ORDER BY, so it returns columns alphabetized, not in conkey/declaration order), and always pass an explicit string name to unique() matching any already-existing DB constraint name so no rename is ever emitted."
key-files:
  created: []
  modified:
    - db/seed-workflow-graph.ts
    - db/schema.ts
decisions:
  - "Fixed db/seed-workflow-graph.ts EDGES via read-only live-DB inspection first (per plan constraint) rather than assuming linearity from prose/comments alone — confirmed 23 defs / 22 sequential edges / zero fan-out-join before editing."
  - "message_reactions churn root cause: drizzle-kit's push introspection query for composite unique constraints joins information_schema.constraint_column_usage to information_schema.columns with no ORDER BY, so it returns the constraint's columns alphabetized rather than in conkey/declaration order. Every push diffs the alphabetized introspected column list against schema.ts's declared order; when they mismatch (as they do for message_id,user_id,emoji, which is not alphabetical), drizzle-kit treats the whole constraint as altered and emits DROP+ADD with the SAME name every single run. workflowStepDefinitions (graph, stepKey) and projectStepDeadlines (projectId, stepN) never showed this bug only because their declared column order already happens to be alphabetical by coincidence — not because of the object-form vs array-form declaration syntax (that was ruled out empirically; converting to object-form alone did not stop the churn)."
  - "Fix: declare messageReactions' unique() columns in the alphabetical order push always introspects (emoji, messageId, userId) AND pass the constraint's existing name explicitly (unique('message_reactions_message_id_user_id_emoji_unique').on(...)) so the squashed diff string matches on both name and column order — zero DB migration required, since the underlying Postgres constraint (same name, same column set) already existed unchanged."
metrics:
  duration: ~45min
  completed: 2026-07-11
---

# Quick Task 260711: Cleanup Deferred Items Summary

One-liner: Fixed a crash-on-rerun bug in the fresh-DB seed script (retired step keys) and root-caused + fixed `drizzle-kit push`'s perpetual `message_reactions` constraint churn (introspection column-order mismatch, not a naming/syntax issue).

## What Was Built

**Task 1 — `db/seed-workflow-graph.ts` fresh-DB seed fix**

- Read-only inspected the live DB (`workflow_step_definitions` + `workflow_step_edges` for `graph='live'`) before touching any code: confirmed 23 step definitions and 22 sequential edges, zero fan-out/join — the graph is now a single linear chain (the last parallel/join, materials_readiness/delivery_readiness → project_check_report, collapsed to linear back in Phase 22e).
- Rewrote the hardcoded `EDGES` array to the confirmed current topology (`new_project → assign_designer_brief → ... → sign_off`), removing every retired step key (`payment_confirmation`, `design_meeting`, `delivery_readiness`, `delivery_project`, `project_check_report`).
- Updated the file's header comment, the "18 step definitions" comment (now correctly "23"), the EDGES block comment, and the edge-count log line to describe the current linear graph instead of the historical parallel/join.
- The seed script was never executed against the live DB — verification was read-only inspection plus `tsc --noEmit` / `npm run lint` only, as required.
- Note: the plan's literal automated grep check (`retired.filter(k => s.includes(k))`) reports a false positive on `delivery_project` because it is an unavoidable substring of the CURRENT valid key `delivery_project_check`. Confirmed via a word-boundary regex check that no retired key appears as a standalone token anywhere in the file — only as a substring of the legitimate current key, which the check itself requires to be present.

**Task 2 — `message_reactions` composite unique constraint idempotency**

Root cause (confirmed by direct inspection of drizzle-kit's compiled introspection SQL in `node_modules/drizzle-kit/api.js`, plus reproducing the exact push diff twice in a row):

- `drizzle-kit push`'s live-DB introspection query for composite unique constraints joins `information_schema.constraint_column_usage` to `information_schema.columns` with **no `ORDER BY`**. Querying this exact join against the live DB directly showed it returns `message_reactions`' constraint columns as `emoji, message_id, user_id` — alphabetized, NOT the constraint's actual declaration/`conkey` order (`message_id, user_id, emoji`).
- drizzle-kit's diff engine builds a single squashed string per unique constraint (`name;col1,col2,col3;nullsNotDistinct`) and compares the schema.ts-declared version against the introspected version. Since the declared order (`message_id, user_id, emoji`) is not alphabetical, it never matches the always-alphabetized introspected order — so every single `db:push` treats the constraint as "altered" and emits `DROP CONSTRAINT` + `ADD CONSTRAINT` with the identical name, forever.
- `workflowStepDefinitions` (`graph, stepKey`) and `projectStepDeadlines` (`projectId, stepN`) were cited in the plan as "non-churning" — confirmed this is coincidental: their declared column order already happens to be alphabetical, so introspection's alphabetized order matches by luck, not because of the object-form-vs-array-form declaration syntax. Verified empirically: converting `messageReactions` to the object form ALONE (matching the other two tables' syntax) did **not** stop the churn — reproduced a second time after that change, still churning.

Fix applied:
- Reordered `messageReactions`' `unique().on(...)` columns to the alphabetical order drizzle-kit's push always introspects them in: `(emoji, messageId, userId)`.
- Passed the constraint's existing name explicitly: `unique('message_reactions_message_id_user_id_emoji_unique')`, so no rename statement is ever generated either (name already matched the live DB's constraint name character-for-character).
- This is a TypeScript-declaration-order-only change; the underlying Postgres constraint (same name, same column set, same index) already existed and was untouched by this change — zero destructive migration.

Verification performed (as the plan explicitly requires `db:push` to run for this task):
- Ran `npx drizzle-kit push --verbose` before the fix: reproduced the exact churn described in the plan (`DROP CONSTRAINT "message_reactions_message_id_user_id_emoji_unique"` + `ADD CONSTRAINT` with the same name/columns) — confirmed this happens on every run, not just once.
- Applied the fix, then ran `drizzle-kit push --verbose` twice more in immediate succession: the first post-fix run showed zero `message_reactions` statements; a follow-up run (and one more after that) showed **zero statements of any kind** — fully idempotent.
- One incidental, unrelated statement appeared during a single push run mid-investigation: `CREATE TYPE "public"."position" AS ENUM(...)` + `ALTER TABLE "users" ALTER COLUMN "position" SET DATA TYPE "public"."position" USING ...`. This is out of scope for this task (a separate, concurrent Phase 19 session was actively converting `users.position` from `text` to a Postgres enum in the same live DB/repo during this execution window). Verified directly against the DB before and after: `users.position` was already the `position` enum type with all 8 live distinct values intact, `users` row count unchanged (19), and the statement produced no observable change — confirmed via direct SQL inspection, not by inference. Did not touch or revert this; it belongs to the concurrent session's own work, not this task's scope.

## Verification Results

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (1 pre-existing, unrelated warning in `app/layout.tsx` about custom fonts)
- `npm test` — 77 passed, 1 todo (matches baseline)
- `npm run db:push` (twice consecutively, post-fix) — zero `message_reactions` statements; second/third runs emitted zero statements at all
- `npm run verify:live-workflow` — PARITY 23/23, both dualRoles confirmation orders (A and B) pass
- Grep + word-boundary check confirms no retired step key exists as a standalone token in `db/seed-workflow-graph.ts`
- Confirmed `db/seed-workflow-graph.ts` was never executed against the live DB during this task

## Deviations from Plan

### Auto-fixed / adjusted during execution

**1. [Rule 1 - investigation correction] Object-form syntax alone did not fix the churn**
- The plan's action text speculated the fix was likely "aligning the declared column order" and/or giving the constraint an explicit name matching the object-form pattern used by `workflowStepDefinitions`/`projectStepDeadlines`. Converting `messageReactions` to the object form (matching those two tables' syntax) alone was tried first and empirically did NOT stop the churn — reproduced the identical DROP+ADD a second time after that change. Only reordering the declared columns to match drizzle-kit's alphabetized introspection order, combined with an explicit matching constraint name, actually stopped it. Documented the true root cause (introspection query has no `ORDER BY`) in the schema.ts comment and in this Summary so the "why" is discoverable next time.
- **Files modified:** `db/schema.ts`
- **Commit:** landed at `7049c81` (see note below on commit attribution)

**2. [Environmental note, not a code deviation] Concurrent session sharing the same non-worktree checkout**
- This repository is a plain (non-worktree) checkout. During this execution, a separate concurrent session was actively committing Phase 19 (`19-01`, positionEnum) work directly to `main` in the same working directory. That session's commit `7049c81` ("feat(19-01): add POSITION_VALUES source of truth + positionEnum (Task 2)") captured the on-disk state of `db/schema.ts` at the moment it ran `git add`, which — because both sessions were editing the same file in the same unisolated working tree — included this task's `messageReactions` fix bundled alongside their unrelated `positionEnum` diff.
- Verified via `git diff HEAD -- db/schema.ts` (empty) and `git diff HEAD -- db/seed-workflow-graph.ts` (empty) that both of this task's fixes are durably present in the current `HEAD` exactly as intended — there is nothing left uncommitted. Task 1's fix landed cleanly in its own commit (`7ed7f81`, this task's own commit). Task 2's fix is present in `HEAD` but its own dedicated commit boundary was absorbed into the concurrent session's commit `7049c81` rather than a commit made by this task — there is no remaining diff to commit separately.
- No action taken to un-bundle or re-commit this, since doing so would require reverting/rewriting the other session's already-pushed history on a shared branch, which is out of scope and risky. Flagging this for visibility only.

### Deferred / out of scope (not fixed)

- The `CREATE TYPE "public"."position" ... / ALTER TABLE "users" ALTER COLUMN "position" ...` statement observed once during push verification is unrelated to this task (Phase 19's `users.position` text→enum migration, in progress concurrently). Confirmed no data loss (live DB already has the enum type, all 8 live position values intact, user count unchanged at 19). Not investigated further or fixed — belongs to the other session's scope.

## Known Stubs

None — both fixes are complete, live-verified, and require no follow-up plan to finish wiring anything.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema trust-boundary changes introduced. The `messageReactions` schema change is declaration-order-only; the `seed-workflow-graph.ts` change only affects a manually-invoked, never-executed-in-this-session dev tool.

## Self-Check: PASSED

- `db/seed-workflow-graph.ts` exists and contains `delivery_project_check`, no retired keys as standalone tokens — FOUND
- `db/schema.ts` exists and contains `messageReactionsUq: unique('message_reactions_message_id_user_id_emoji_unique').on(t.emoji, t.messageId, t.userId)` — FOUND
- Commit `7ed7f81` (Task 1, seed-workflow-graph.ts fix) — FOUND in `git log --oneline`
- Commit `7049c81` (contains Task 2's messageReactions fix, bundled with concurrent Phase 19 work — see Deviations) — FOUND in `git log --oneline`
- `git diff HEAD -- db/seed-workflow-graph.ts db/schema.ts` — empty (both fixes durably committed, nothing left dirty)
