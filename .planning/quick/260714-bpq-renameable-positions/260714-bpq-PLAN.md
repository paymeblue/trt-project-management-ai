---
phase: quick-260714-bpq
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [RENAME-POS]
files_modified:
  - lib/position-slug.ts
  - lib/position-slug.test.ts
  - lib/positions.ts
  - db/schema.ts
  - lib/workflow.ts
  - scripts/migrate-positions-table.ts
  - scripts/verify-position-rename.ts
  - actions/positions.ts
  - actions/profile.ts
  - app/(app)/profile/page.tsx
  - app/(app)/admin/users/page.tsx
  - app/_components/positions-manager.tsx
  - app/_components/workflow-configurator-editor.tsx
  - app/_components/workflow-configurator-graph.tsx
  - app/_components/workflow-configurator-shared.tsx
  - package.json

must_haves:
  truths:
    - "A super admin can rename a position's display label from a Positions card on /admin/users"
    - "The machine slug is auto-derived from the new label (lowercase, non-alphanumeric -> underscore, collapse repeats, trim)"
    - "Renaming atomically cascades to every users.position and both workflow_step_definitions position columns holding the old slug"
    - "Every user holding the renamed position keeps working; every live step gate on the old slug follows to the new slug"
    - "The profile position picker and the Configurator 'Restrict to a specific title' dropdown show positions read live from the DB, including newly-renamed labels"
    - "Renaming to a label whose slug collides with a different existing position is rejected with a clear message"
    - "authorizeStep still does strict string equality, unchanged; gating stays consistent because both sides hold the same slug"
    - "drizzle-kit push is idempotent (two consecutive no-change runs) after the migration; no enum left to reconcile"
    - "The migration is idempotent (a second run is a no-op) and preserves every current user's position verbatim as its seeded label"
  artifacts:
    - path: "db/schema.ts"
      provides: "positions lookup table (slug PK, label) + users.position converted to text() + positionEnum removed"
      contains: "positions"
    - path: "scripts/migrate-positions-table.ts"
      provides: "idempotent live migration: create+seed positions, enum->text, normalize verbatim values to slugs, drop enum"
    - path: "actions/positions.ts"
      provides: "renamePositionAction — super-admin-only, slugify, collision-reject, atomic db.batch cascade returning counts"
      exports: ["renamePositionAction"]
    - path: "lib/positions.ts"
      provides: "server reader for the positions table (list + label map + usage counts)"
    - path: "lib/position-slug.ts"
      provides: "pure client-safe slugifyPosition() used by both the rename action and its test"
      exports: ["slugifyPosition"]
    - path: "scripts/verify-position-rename.ts"
      provides: "throwaway-data verification of cascade + collision-reject, npm run verify:position-rename"
  key_links:
    - from: "actions/positions.ts"
      to: "users.position + workflow_step_definitions.required_position + receiver_required_position + positions.slug"
      via: "single atomic db.batch cascade"
      pattern: "db\\.batch"
    - from: "app/(app)/profile/page.tsx"
      to: "lib/positions.ts getPositions()"
      via: "server read passed into the select"
      pattern: "getPositions"
    - from: "app/_components/workflow-configurator-shared.tsx"
      to: "positions prop threaded from the server configurator page"
      via: "StepFieldsPanel positions prop"
      pattern: "positions"
---

<objective>
Make positions renameable without breaking anything. A super admin renames a position's display label; the machine slug is auto-derived from the new label; the rename cascades atomically so every user on that position keeps working and every workflow step gated on the old value follows to the new value.

Purpose: The company renames titles "due to the way it is" (e.g. "Head of Operations" -> "Operations admin head" -> operations_admin_head). Positions must be data, not code, so renames are a self-service DB operation with no redeploy and no toolchain churn.

Output: A `positions` lookup table replacing the `position` Postgres enum as the source of truth; a super-admin Positions card with inline rename; an atomic cascade; DB-driven position pickers; and green verification including a db:push idempotency double-run.

Chosen design — Direction B (migrate away from the enum), justified:
- The `neon-http` driver (db/index.ts) throws on `db.transaction()` ("No transactions support in neon-http driver", verified in node_modules/drizzle-orm/neon-http/session.cjs). Atomicity is achieved with `db.batch([...])` (driver.cjs:90 -> neon non-interactive transaction) OR a single multi-CTE data-modifying SQL statement. Both are genuinely atomic in one round-trip.
- Direction A (keep the enum, ALTER TYPE RENAME VALUE) makes the live enum diverge from the hardcoded `POSITION_VALUES` tuple that `db/schema.ts`'s `pgEnum` is built from, so the next `drizzle-kit push` detects drift and churns — the repo already has a documented history of fighting db:push idempotency (STATE.md: message_reactions, FK-name truncation). The tuple in code also goes stale the moment anyone renames. drizzle-kit cannot be told to leave enum values alone.
- Direction B removes the enum entirely (users.position becomes plain text, matching the deliberately-text step-def columns per D-19-01-A). After migration there is no enum to reconcile, so db:push stays idempotent forever, and a rename is pure DML.
- Blast radius (grepped repo-wide): `POSITION_VALUES`/`POSITION_LABELS` are consumed only by profile/page.tsx, workflow-configurator-shared.tsx, and db/schema.ts's pgEnum; `PositionValue` type has no importers; the `Positions` 3-machine-constant object has no consumers. All are handled by this plan.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Re-read these FRESH before editing (no baked line numbers — files change):
@lib/workflow.ts
@db/schema.ts
@db/index.ts
@actions/workflow-graph.ts
@actions/profile.ts
@app/(app)/profile/page.tsx
@app/(app)/admin/users/page.tsx
@app/(app)/admin/workflow-configurator/page.tsx
@app/_components/workflow-configurator-shared.tsx
@app/_components/workflow-configurator-editor.tsx
@app/_components/workflow-configurator-graph.tsx
@scripts/migrate-position-enum.ts
@scripts/verify-live-workflow.ts

<interfaces>
<!-- Key facts extracted from the codebase. Use directly — verify fresh, do not re-derive. -->

DB client (db/index.ts): `import 'server-only'` + `neon(...)` + `drizzle(sql, { schema })` on the
neon-http driver. `db.transaction()` THROWS. Use `db.batch([q1, q2, ...])` for atomicity (neon
non-interactive transaction) — or a single multi-CTE UPDATE statement via `db.execute(sql.raw(...))`.

Current position source of truth (lib/workflow.ts):
  POSITION_VALUES: 9 values = 3 machine slugs (head_of_operations, head_designer,
  chief_production_officer) + 6 verbatim legacy labels (Customer Rep, Designer, Factory Manager,
  Head of design, Lead Site Manager, Operations manager admin).
  POSITION_LABELS: Record mapping the 3 machine slugs -> display labels; verbatim values display as-is.
  Positions: { HeadOfOperations, HeadDesigner, ChiefProductionOfficer } — exported, ZERO consumers.
  PositionValue type — ZERO importers.

Schema today (db/schema.ts):
  positionEnum = pgEnum('position', POSITION_VALUES ...); users.position = positionEnum('position') (nullable).
  workflow_step_definitions.required_position = text(); .receiver_required_position = text() (both slugs/values).

authorizeStep (actions/workflow-graph.ts) — DO NOT MODIFY. Fetches acting user's position fresh from DB
and does `actingUser.position !== requiredPos` strict equality. Stays correct because migration + rename
keep users.position and the step-def columns on the SAME slug.

Live gates today (per task brief — VERIFY fresh): send_for_production.receiver_required_position =
'chief_production_officer'; step 12 required_position = 'chief_production_officer'; steps 2/5
required_position = 'head_designer'. All are machine slugs -> unchanged by the migration's normalization.
No live step gate is on a verbatim value.

Configurator prop chain: page (server) app/(app)/admin/workflow-configurator/page.tsx ->
ConfiguratorEditorSection loads getGraphSteps/getGraphEdges -> <ConfiguratorEditor> (client) ->
StepFieldsPanel (list view) AND <ConfiguratorGraph> -> StepFieldsPanel (graph view). StepFieldsPanel
(workflow-configurator-shared.tsx) currently imports POSITION_VALUES/POSITION_LABELS directly; it must
instead receive a `positions: {slug,label}[]` prop threaded from the server page.

server-only CLI shim precedent (scripts/verify-live-workflow.ts): patch node:module `_load` via a plain
`require()` to stub `server-only` and `next/cache` BEFORE requiring engine/action modules.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: positions table + slugify + idempotent live migration</name>
  <files>lib/position-slug.ts, lib/position-slug.test.ts, lib/positions.ts, db/schema.ts, scripts/migrate-positions-table.ts, package.json</files>
  <behavior>
    slugifyPosition (pure, client-safe):
    - "Operations admin head" -> "operations_admin_head"
    - "Head of Operations" -> "head_of_operations"
    - "  Head  of   Design!! " -> "head_of_design" (trim, collapse whitespace + non-alphanumeric runs to a single underscore, strip leading/trailing underscores)
    - "R&D / QA" -> "r_d_qa"
    - "head_designer" -> "head_designer" (already a slug is stable / idempotent: slugifyPosition(x) === slugifyPosition(slugifyPosition(x)))
    - only ASCII [a-z0-9] survive; other characters become separators (e.g. "cafe!" -> "cafe")
  </behavior>
  <action>
    Create `lib/position-slug.ts` exporting a pure `slugifyPosition(label: string): string` — no server-only imports, importable from client and Node CLIs. Lowercase, replace every run of characters not in [a-z0-9] with a single `_`, strip leading/trailing `_`. Add `lib/position-slug.test.ts` covering the behavior cases above (vitest, mirroring tests/ conventions).

    Edit `db/schema.ts` (D: users.position becomes plain text, NOT a FK — mirrors the deliberately-text step-def columns per D-19-01-A and avoids FK-name-truncation churn documented in STATE.md):
    - Add a `positions` pgTable: `slug text('slug').primaryKey()`, `label text('label').notNull()`, `createdAt timestamp('created_at').defaultNow().notNull()`. Keep column/type/default choices byte-aligned with the CREATE TABLE the migration emits (see below) so db:push sees zero diff.
    - Change `position: positionEnum('position')` to `position: text('position')` (stays nullable).
    - Remove the `positionEnum` pgEnum declaration and the `import { POSITION_VALUES } from '@/lib/workflow'` line (now unused by schema). Do NOT touch lib/workflow.ts's exports in this task — profile/page.tsx and workflow-configurator-shared.tsx still import POSITION_VALUES/POSITION_LABELS and must keep compiling until Task 3 rewires them.

    Create `lib/positions.ts` (server-only reader): export `getPositions(): Promise<{ slug: string; label: string }[]>` (ordered by label) and `getPositionLabelMap(): Promise<Record<string,string>>`. Also export `getPositionsWithCounts()` returning each position plus `userCount` (users.position = slug) and `stepCount` (distinct workflow_step_definitions rows where required_position = slug OR receiver_required_position = slug) — used by the admin card in Task 3.

    Create `scripts/migrate-positions-table.ts` — idempotent, runnable via `npx tsx`, using the same dotenv + neon-http setup as scripts/migrate-position-enum.ts (config .env.local; neon(DATABASE_URL); drizzle). Steps, in order, each guarded:
      1. Idempotency guard (checker finding: must distinguish "migrated" from "db:push ran first and made an EMPTY shell"): treat as already-migrated ONLY when users.position udt_name is 'text' AND the positions table exists AND `SELECT count(*) FROM positions` > 0. If the column is text and the table exists but is EMPTY (the out-of-order db:push case), do NOT exit — log a warning and continue with steps 3 and 5 (seed + normalize) so real data is never left unseeded; steps 2/4/6 are individually guarded (IF NOT EXISTS / udt check / DROP IF EXISTS) so re-running them is safe.
      2. CREATE TABLE IF NOT EXISTS positions (slug text PRIMARY KEY, label text NOT NULL, created_at timestamp NOT NULL DEFAULT now()) — note: plain `timestamp` (no tz), because drizzle's bare timestamp('created_at') maps to `timestamp without time zone`; using timestamptz here would make the first db:push ALTER the column (checker finding).
      3. Build the seed + normalization map from the CURRENT 9 enum values (read them fresh: SELECT enumlabel FROM pg_enum JOIN pg_type ON ... WHERE typname='position', or hardcode from the verified POSITION_VALUES/POSITION_LABELS — prefer reading pg_enum so the script reflects live truth). For each value: if it is one of the 3 machine slugs, seed (slug=value, label=its POSITION_LABELS display label); otherwise seed (slug=slugifyPosition(value), label=value). INSERT ... ON CONFLICT (slug) DO NOTHING.
      4. Convert the column: `ALTER TABLE users ALTER COLUMN position TYPE text USING position::text`.
      5. Normalize stored values to slugs for the verbatim entries only (machine slugs already equal their slug, so those are no-ops): for each verbatim value V with slug S (S != V), run UPDATE users SET position=S WHERE position=V; UPDATE workflow_step_definitions SET required_position=S WHERE required_position=V; UPDATE workflow_step_definitions SET receiver_required_position=S WHERE receiver_required_position=V. (Per live inspection no step gate is on a verbatim value; run it anyway for correctness.)
      6. `DROP TYPE IF EXISTS position` (safe now that no column uses it).
      Log a row-count summary. Preserve every user's DISPLAY value verbatim (it becomes the positions.label); only the machine column value changes for verbatim entries.

    Add npm scripts to package.json: `"db:migrate-positions": "tsx scripts/migrate-positions-table.ts"` and (for Task 2's verifier) `"verify:position-rename": "tsx scripts/verify-position-rename.ts"`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run lib/position-slug.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>slugifyPosition + tests pass; db/schema.ts compiles with positions table, users.position as text, positionEnum removed; lib/positions.ts + migration script exist; tsc clean. (The live migration RUN happens at the Task 2 checkpoint — do not execute it against the live DB yet.)</done>
</task>

<task type="auto">
  <name>Task 2: atomic rename action + collision reject + verification harness</name>
  <files>actions/positions.ts, scripts/verify-position-rename.ts</files>
  <action>
    Create `actions/positions.ts` (`'use server'`) exporting `renamePositionAction(input: { slug: string; newLabel: string })`:
    - Gate to SUPER ADMIN ONLY: verifySession() then require `role === Roles.SuperAdmin` (NOT isAdminRole — Operations must not rename positions). Return `{ ok: false, message }` on failure; never throw to the client.
    - Trim newLabel; reject empty ("Enter a position name.").
    - `newSlug = slugifyPosition(newLabel)`; reject if newSlug is empty ("That name has no usable letters or numbers.").
    - Collision check: if `newSlug !== slug` (the old slug) AND a positions row already exists with slug = newSlug, reject ("A different position already uses that name — pick another.").
    - Atomic cascade via `db.batch([...])` (neon-http supports batch = non-interactive transaction; `db.transaction()` would throw). Statements, all matching the OLD slug:
        1. update positions set slug=newSlug, label=newLabel where slug=oldSlug
        2. update users set position=newSlug where position=oldSlug returning { id }
        3. update workflow_step_definitions set required_position=newSlug where required_position=oldSlug returning { id }
        4. update workflow_step_definitions set receiver_required_position=newSlug where receiver_required_position=oldSlug returning { id }
      Compute userCount from (2) and a distinct stepCount from (3)+(4). If newSlug === oldSlug this is a label-only change — the same batch still runs correctly (matches on the unchanged slug).
    - revalidatePath('/admin/users') and '/profile' and '/admin/workflow-configurator' so the pickers refresh.
    - Return `{ ok: true, userCount, stepCount, newSlug, newLabel }` so the UI can show "3 users and 2 steps updated".
    Document inline WHY db.batch (not db.transaction) is used, citing the neon-http driver limitation.
    Factor an auth-free `renamePositionCore(input)` that does the validation + collision + batch, and have `renamePositionAction` do the session gate then delegate — so the verifier can exercise the core without faking a session (mirrors confirmDualRoleStepAs's auth-free core in actions/workflow.ts).

    Create `scripts/verify-position-rename.ts` (runnable via `npm run verify:position-rename`), using the server-only/next-cache Module._load shim from scripts/verify-live-workflow.ts so it can require actions/positions.ts. It must, against the live DB but touching ONLY throwaway rows (unique-named, cleaned up in a finally):
    - Seed a throwaway position (e.g. slug `zzz_verify_<ts>`, label "ZZZ Verify <ts>"), a throwaway user with that position, and a throwaway workflow_step_definitions row (graph='verify-<ts>', required_position = that slug) so nothing real is touched.
    - Call renamePositionCore to rename it; assert positions.slug/label updated, the user's position followed, the step's required_position followed, and returned counts are correct.
    - Seed a SECOND throwaway position, then attempt to rename it to a label whose slug collides with the first -> assert `ok === false` and nothing cascaded.
    - Clean up all throwaway rows (positions, user, step defs, graph='verify-*') in a finally block; exit non-zero on any failed assertion.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>renamePositionAction + renamePositionCore compile and lint clean; verify:position-rename script exists. Live run of the migration + rename verifier happens at the checkpoint below.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <what-built>
    The idempotent live migration (scripts/migrate-positions-table.ts), the atomic rename action + core (actions/positions.ts), and the throwaway-data rename verifier are all written and compile/lint clean. This checkpoint RUNS the migration against the live Neon DB (it converts users.position from enum to text, seeds the positions table, and drops the enum type) — a one-way, auth-relevant data migration on live rows. It must be run and inspected before wiring the UI.
  </what-built>
  <how-to-verify>
    Run, in order, from /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm:
    1. `npm run db:migrate-positions` — read the summary; confirm the 9 positions were seeded and the enum dropped.
    2. `npm run db:migrate-positions` again — MUST print "already migrated" and change nothing (idempotency).
    3. `npm run db:push` twice — the SECOND run MUST report no changes (no enum-vs-tuple churn; positions table matches schema).
    4. `npm run verify:position-rename` — MUST pass (cascade + collision reject on throwaway rows).
    5. `npm run verify:live-workflow` — MUST stay green (PARITY + both dualRoles orders).
    6. Spot-check live: every real user still has a non-null position (now a slug), and the live gates (chief_production_officer on step 12 + send_for_production receiver; head_designer on steps 2/5) are intact.
  </how-to-verify>
  <resume-signal>Type "approved" once the migration ran, both idempotency checks are clean, and all verifiers pass — or describe what diverged.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: DB-driven pickers + admin Positions card + retire static constants</name>
  <files>app/(app)/admin/users/page.tsx, app/_components/positions-manager.tsx, app/(app)/profile/page.tsx, actions/profile.ts, app/_components/workflow-configurator-shared.tsx, app/_components/workflow-configurator-editor.tsx, app/_components/workflow-configurator-graph.tsx, lib/workflow.ts, lib/project-audit.ts, tests/lib/project-audit.test.ts, scripts/migrate-position-enum.ts</files>
  <action>
    Admin Positions card (smallest viable surface — a card on the existing super-admin users page):
    - `app/(app)/admin/users/page.tsx`: this page currently uses requireAdmin() (super_admin OR operations). Load `getPositionsWithCounts()` from lib/positions.ts and render a new "Positions" section BELOW the users table, passing the list plus whether the viewer is super_admin (only super admins may rename — Operations sees the list read-only). Use verifySession()/role to determine that.
    - Create `app/_components/positions-manager.tsx` (`'use client'`): renders each position as a row showing label, slug (monospace), userCount ("N users"), stepCount ("N steps"). For super admins, each row has an inline text input (defaulting to the current label) + Save button calling `renamePositionAction`; on success show "{userCount} users and {stepCount} steps updated" and refresh (router.refresh()); on failure show the returned message (e.g. collision). Mirror the existing client-action pattern in admin-users-table.tsx (useState/useRouter/useTransition, disabled-while-busy). Show a live preview of the derived slug (import slugifyPosition from lib/position-slug.ts) next to the input so the admin sees "operations_admin_head" before saving.

    Profile picker -> DB:
    - `app/(app)/profile/page.tsx` (server): replace the POSITION_VALUES/POSITION_LABELS import + map with `await getPositions()`; render `<option value={p.slug}>{p.label}</option>`; keep defaultValue={u?.position ?? ''} (now a slug).
    - `actions/profile.ts`: replace the static `POSITION_VALUES.includes(...)` guard with a DB check — load the valid slug set via getPositions() (or a lightweight `positionExists(slug)` in lib/positions.ts) and coerce any unknown value to null before the write. Keep the exact same null-coercion contract.

    Configurator dropdown -> DB (thread a prop, do not import DB into the client component):
    - `app/(app)/admin/workflow-configurator/page.tsx`: in ConfiguratorEditorSection, load `getPositions()` and pass `positions` into <ConfiguratorEditor>.
    - `app/_components/workflow-configurator-editor.tsx` and `workflow-configurator-graph.tsx`: accept a `positions: {slug,label}[]` prop and pass it down to every `<StepFieldsPanel>` (list view AND graph-view side panel).
    - `app/_components/workflow-configurator-shared.tsx`: add `positions` to StepFieldsPanel's props; replace the POSITION_VALUES/POSITION_LABELS import + map in the "Restrict to a specific title?" dropdown with the prop (`<option value={p.slug}>{p.label}</option>`). Remove the now-unused POSITION_VALUES/POSITION_LABELS import.

    Audit page label resolution -> DB (checker finding #1 — lib/project-audit.ts is a 4th consumer of POSITION_LABELS, added 2026-07-14 after this plan was first drafted):
    - `lib/project-audit.ts`: `resolvePositionLabel()` currently reads the static POSITION_LABELS map — after a rename it would show the raw slug instead of the new label. Rework: `getProjectAudit` loads the label map once via lib/positions.ts (e.g. a `getPositionLabelMap(): Promise<Map<string,string>>` helper — add it to lib/positions.ts if not already planned) and passes it into `assembleAuditRows` as part of its input; `resolvePositionLabel` becomes a lookup against that map with the same `?? position ?? '—'` fallback. Keep `assembleAuditRows` pure (map passed in, no DB access inside).
    - `tests/lib/project-audit.test.ts`: update the "resolves a machine position value through POSITION_LABELS" test to pass a label map into the assembler input instead of relying on the static import.

    Retire obsolete migration tooling (checker finding #2):
    - `scripts/migrate-position-enum.ts`: DELETE this file. It imports POSITION_VALUES and is one-time, already-run migration tooling fully superseded by scripts/migrate-positions-table.ts; tsconfig includes scripts/ in the tsc --noEmit scope, so leaving it breaks the compile gate once POSITION_VALUES is removed.

    Retire the static constants (now that no importer remains):
    - `lib/workflow.ts`: remove `POSITION_VALUES`, `POSITION_LABELS`, and the `PositionValue` type. Keep the `Positions` 3-machine-constant object and its comment (harmless, documents the baseline machine slugs; grep confirms no consumers but it is the conceptual seed reference). Verify with grep that nothing else imports the removed names before deleting.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && ! grep -rEn "POSITION_VALUES|POSITION_LABELS|PositionValue" --include="*.ts" --include="*.tsx" lib app actions db scripts tests && npx tsc --noEmit && npm run lint && npm test && npm run verify:live-workflow && npm run build</automated>
    <human-check>On the running dev server as a super admin: open /admin/users, rename a position (e.g. "Head of Operations" -> "Operations admin head"), confirm the "N users and N steps updated" message, then confirm the new label appears in the /profile picker and the Configurator "Restrict to a specific title" dropdown, and that a user on that position can still act on their step.</human-check>
  </verify>
  <done>No importer of POSITION_VALUES/POSITION_LABELS/PositionValue remains; profile + configurator pickers read positions from the DB; admin Positions card renames with a live cascade; tsc, lint, test, verify:live-workflow, and build all pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> renamePositionAction | Super-admin-only privileged DML that rewrites auth-relevant position gates across users + step definitions |
| CLI -> live Neon DB | The one-way migration converts a column holding real user rows and drops a type |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bpq-01 | Elevation | renamePositionAction | mitigate | verifySession() then require role === Roles.SuperAdmin (NOT isAdminRole); Operations sees the Positions list read-only |
| T-bpq-02 | Tampering | slug collision merging two positions / orphaning a gate | mitigate | reject when newSlug != oldSlug and a different position already holds newSlug; positions.slug is PRIMARY KEY as a DB backstop |
| T-bpq-03 | Denial of Service | partial cascade leaving users.position and step gates inconsistent | mitigate | single atomic db.batch (neon non-interactive transaction) covering positions + users + both step-def columns; db.transaction() is unsupported and would throw |
| T-bpq-04 | Tampering | live migration silently dropping/altering real position data | mitigate | idempotency guard (early-exit if already text + table present); preserve every value verbatim as the label; enum-drop only after column no longer uses it; double-run + verify:live-workflow at the blocking checkpoint |
| T-bpq-05 | Repudiation | rename cascade opaque to the operator | accept | action returns userCount/stepCount surfaced in the UI ("N users and N steps updated"); no audit-log table in scope for this quick task |
| T-bpq-SC | Tampering | npm/pip/cargo installs | accept | No new packages installed — no legitimacy gate required |
</threat_model>

<verification>
- `npx vitest run lib/position-slug.test.ts` — slugify behavior (Task 1)
- `npx tsc --noEmit` and `npm run lint` — after every task
- `npm run db:migrate-positions` twice — second run is a no-op (idempotency)
- `npm run db:push` twice — second run reports no changes (no enum churn)
- `npm run verify:position-rename` — cascade + collision reject on throwaway rows
- `npm run verify:live-workflow` — PARITY + both dualRoles orders stay green
- `npm test` and `npm run build` — full suite + production build (Task 4)
- Grep gate: zero remaining importers of POSITION_VALUES/POSITION_LABELS/PositionValue
</verification>

<success_criteria>
- A super admin renames a position label from /admin/users; the slug auto-derives; the change cascades atomically to users.position and both workflow_step_definitions position columns.
- Every user on the renamed position keeps working; every live step gate on the old slug follows to the new slug; authorizeStep is unchanged.
- Profile + Configurator pickers read positions live from the DB and show renamed labels.
- Slug collisions with a different position are rejected with a clear message.
- The live migration is idempotent and db:push is idempotent afterward (no enum to reconcile).
- All verification commands pass.
</success_criteria>

<output>
Create `.planning/quick/260714-bpq-renameable-positions/260714-bpq-SUMMARY.md` when done.
</output>
