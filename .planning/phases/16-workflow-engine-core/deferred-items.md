# Deferred Items — Phase 16 (Workflow Engine Core)

Out-of-scope discoveries logged during execution, per the executor's scope-boundary rule
(only auto-fix issues directly caused by the current task's changes).

## From 16-01 (schema push)

- **`checklist_template_items_definition_id_checklist_definitions_id_fk`** and
  **`checklist_responses_template_item_id_checklist_template_items_id_fk`** — both FK
  constraint names exceed Postgres' 63-byte identifier limit (66-67 chars) and get silently
  truncated on creation. Every `drizzle-kit push` re-detects a name mismatch and proposes a
  DROP+ADD for these two constraints. Pre-existing (predates Phase 16), unrelated to any
  table this plan touches — not fixed here. Fix (when addressed): give both FKs explicit
  short names via drizzle-orm's `foreignKey()` table-config helper, same pattern used for
  the 3 new FKs added in 16-01 (`psc_step_def_id_fk`, `wse_from_step_id_fk`,
  `wss_step_def_id_fk`).
- **`message_reactions_message_id_user_id_emoji_unique`** — this unique constraint (49
  chars, under the 63-char limit) also intermittently reappears in `drizzle-kit push`'s
  diff/statement list despite matching the DB state. Cause not fully diagnosed; did not
  affect this plan's tables. Not fixed here (out of scope, pre-existing, unrelated table).

None of the above block Phase 16 execution — they only mean `drizzle-kit push` will keep
printing (and applying no-op) ALTER statements for these three pre-existing constraints on
every future push. Confirmed via direct `pg_constraint` queries that no data or constraint
state actually changes across repeated pushes.
