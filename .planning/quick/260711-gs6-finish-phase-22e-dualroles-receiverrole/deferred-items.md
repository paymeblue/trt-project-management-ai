## Deferred Items — quick-260711-gs6

### `message_reactions` unique-constraint churn on every `db:push`

**Found during:** Task 1 (verifying `db:push` idempotency for the additive dualRoles/receiverRole
columns).

**Issue:** `drizzle-kit push --verbose` shows a DROP CONSTRAINT + ADD CONSTRAINT (same name,
`message_reactions_message_id_user_id_emoji_unique`) on every run, even with zero schema.ts
changes. Not data loss (no column/table dropped, no data affected — the unique constraint is
recreated identically), but it means `db:push` is not perfectly idempotent at the SQL-statement
level, only at the resulting-schema level.

**Scope:** `message_reactions` (added in quick-260706-bpg, Slack-like reactions) is not in this
plan's Task 1 `<files>` list and predates this session's changes. Out of scope per SCOPE BOUNDARY.

**Root cause (likely):** Same class of Postgres 63-char identifier truncation / drizzle-kit
introspection ordering quirk already documented for 3 FKs in Phase 16 and fixed for 2 more FKs
(`checklist_template_items`, `checklist_responses`) in this session's Task 1 — but this one is a
composite UNIQUE constraint, not a FK, so the existing short-name pattern doesn't directly apply
(the constraint name here is short enough already, 46 chars). Needs separate investigation into
whether drizzle-kit's introspection sorts the composite index columns differently than declared.

**Recommendation:** Investigate in a future formal phase or quick task — not blocking, purely
cosmetic double-statement in `db:push` output.

### `db/seed-workflow-graph.ts` references retired step keys (pre-existing, unrelated to this task)

**Found during:** Task 2 (re-inspecting the live graph before writing the merge migration).

**Issue:** `db/seed-workflow-graph.ts`'s hardcoded edge list still references `delivery_project`
and `project_check_report` — both keys were retired in Phase 22d (2026-07-10, prior session),
merged into `delivery_project_check`. This script is a one-time DB seed tool (`npm run
db:seed-workflow-graph`), not exercised by `tsc`/`lint`/`test`/`verify:live-workflow`, so it
compiles (string literals aren't type-checked against real keys) but would fail at runtime if
ever re-run against a fresh DB.

**Scope:** Not in this plan's Task 2 `<files>` list (`scripts/migrate-merge-readiness-dualroles.ts`,
`db/workflow-live-steps.ts`, `scripts/verify-live-workflow.ts` only) and predates this session
entirely — the stale references were introduced by Phase 22d, not by this quick task's Phase 22e
work. Out of scope per SCOPE BOUNDARY.

**Recommendation:** Update `db/seed-workflow-graph.ts`'s `EDGES`/step list to match the current
23-step live graph (post this task's merge) in a future formal phase or quick task, before it is
ever run again.
