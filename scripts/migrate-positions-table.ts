/**
 * One-time, idempotent, live migration (quick task 260714-bpq — renameable
 * positions): converts `users.position` from the `position` Postgres enum
 * to plain text, seeds a new `positions` lookup table (slug PK, label) from
 * the live enum values, normalizes stored values to slugs, and drops the
 * enum type. After this runs, positions are data (the `positions` table),
 * not code — renaming is pure DML via actions/positions.ts, no redeploy.
 *
 * BLOCKING HUMAN CHECKPOINT (260714-bpq Task 3): this script runs against
 * the LIVE Neon database, converting a column that already holds real user
 * rows and dropping a Postgres type. Do NOT run it without explicit human
 * approval — see 260714-bpq-PLAN.md Task 3.
 *
 * Preserves every user's DISPLAY value verbatim (it becomes positions.label
 * for the 6 legacy verbatim entries); only the machine column value changes,
 * and only for those verbatim entries (the 3 machine slugs are already
 * their own slug, so they're a no-op).
 *
 * Idempotent: safe to run any number of times.
 *   - If users.position is already text AND positions has rows, it's a
 *     confirmed no-op (logs "already migrated" and exits).
 *   - If users.position is already text but positions is EMPTY (the
 *     out-of-order case: someone ran `drizzle-kit push` first, which
 *     creates an empty positions shell from the schema before this script
 *     seeded it), it does NOT exit early — it logs a warning and continues
 *     with the seed + normalize steps so real data is never left unseeded.
 *   - Every individual step (CREATE TABLE, INSERT ... ON CONFLICT DO
 *     NOTHING, ALTER COLUMN, UPDATE, DROP TYPE IF EXISTS) is independently
 *     safe to re-run.
 *
 * Run via: npm run db:migrate-positions
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { slugifyPosition } from '../lib/position-slug'

config({ path: '.env.local' })

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient, { schema })

// The 3 baseline machine-gating slugs and their display labels — mirrors
// lib/workflow.ts's (now-retired) POSITION_LABELS. Any OTHER live enum
// value is a verbatim legacy label; its slug is derived via slugifyPosition.
const MACHINE_SLUG_LABELS: Record<string, string> = {
  head_of_operations: 'Head of Operations',
  head_designer: 'Head Designer',
  chief_production_officer: 'Chief Production Officer',
}

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = ${name}
    ) AS exists
  `)
  return !!result.rows[0]?.exists
}

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  // NOTE: this only guards steps 1-5 (seed/convert/normalize). Step 6 (DROP
  // TYPE IF EXISTS) always runs unconditionally at the end — it's naturally
  // idempotent (IF EXISTS) and must not be skippable, or a prior run that
  // failed after normalizing but before dropping the enum would leave the
  // enum type orphaned forever (found live: DROP TYPE IF EXISTS position
  // fails with a syntax error unless the identifier is quoted, since
  // `position` is a reserved SQL keyword — fixed below).
  const udtResult = await db.execute<{ udt_name: string }>(sql`
    SELECT udt_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'position'
  `)
  const columnIsText = udtResult.rows[0]?.udt_name === 'text'
  const positionsTablePresent = await tableExists('positions')

  let alreadyMigrated = false
  if (columnIsText && positionsTablePresent) {
    const countResult = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM positions`)
    const rowCount = Number(countResult.rows[0]?.count ?? 0)
    if (rowCount > 0) {
      console.log('users.position is already text and positions is seeded — already migrated. Still checking the enum type is dropped.')
      alreadyMigrated = true
    } else {
      console.warn(
        'WARNING: users.position is already text and a positions table exists, but it is EMPTY ' +
          '(likely: drizzle-kit push ran before this migration and created an empty shell from the ' +
          'schema). Continuing with seed + normalize so real data is never left unseeded.',
      )
    }
  }

  if (alreadyMigrated) {
    await dropEnumIfExists()
    console.log('Done.')
    return
  }

  // ── 1. Read the live enum values (source of truth for seeding) ───────
  // Prefer live pg_enum over a hardcoded list so this script reflects
  // reality even if the enum type was already dropped by a prior partial
  // run (in which case we fall back to the last-known 9 values).
  const enumResult = await db.execute<{ enumlabel: string }>(sql`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'position'
    ORDER BY e.enumsortorder
  `)
  const enumValues =
    enumResult.rows.length > 0
      ? enumResult.rows.map((r) => r.enumlabel)
      : [
          'head_of_operations',
          'head_designer',
          'chief_production_officer',
          'Customer Rep',
          'Designer',
          'Factory Manager',
          'Head of design',
          'Lead Site Manager',
          'Operations manager admin',
        ]

  const seed = enumValues.map((value) => {
    const isMachineSlug = value in MACHINE_SLUG_LABELS
    return {
      value,
      slug: isMachineSlug ? value : slugifyPosition(value),
      label: isMachineSlug ? MACHINE_SLUG_LABELS[value] : value,
    }
  })

  console.log(`Read ${seed.length} live position value(s) to seed.`)

  // ── 2. CREATE TABLE IF NOT EXISTS positions ───────────────────────────
  // Plain `timestamp` (no tz) — matches drizzle's bare timestamp('created_at')
  // mapping, so the first db:push doesn't ALTER the column.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS positions (
      slug text PRIMARY KEY,
      label text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `)
  console.log('  positions table present (created if missing)')

  // ── 3. Seed positions from the live enum values ───────────────────────
  for (const p of seed) {
    await db.execute(sql`
      INSERT INTO positions (slug, label) VALUES (${p.slug}, ${p.label})
      ON CONFLICT (slug) DO NOTHING
    `)
  }
  console.log(`  seeded ${seed.length} position(s) (ON CONFLICT DO NOTHING)`)

  // ── 4. Convert the column: enum -> text ────────────────────────────────
  if (!columnIsText) {
    await db.execute(sql`ALTER TABLE users ALTER COLUMN position TYPE text USING position::text`)
    console.log('  converted users.position column TYPE to text')
  } else {
    console.log('  users.position is already text — skipping column conversion')
  }

  // ── 5. Normalize stored verbatim values to their slugs ────────────────
  let normalizedUsers = 0
  let normalizedRequired = 0
  let normalizedReceiver = 0
  for (const p of seed) {
    if (p.slug === p.value) continue // machine slugs are already their own slug — no-op
    const userRes = await db.execute(sql`UPDATE users SET position = ${p.slug} WHERE position = ${p.value}`)
    normalizedUsers += userRes.rowCount ?? 0
    const reqRes = await db.execute(
      sql`UPDATE workflow_step_definitions SET required_position = ${p.slug} WHERE required_position = ${p.value}`,
    )
    normalizedRequired += reqRes.rowCount ?? 0
    const recvRes = await db.execute(
      sql`UPDATE workflow_step_definitions SET receiver_required_position = ${p.slug} WHERE receiver_required_position = ${p.value}`,
    )
    normalizedReceiver += recvRes.rowCount ?? 0
  }
  console.log(
    `  normalized verbatim values to slugs: ${normalizedUsers} user(s), ${normalizedRequired} required_position row(s), ${normalizedReceiver} receiver_required_position row(s)`,
  )

  // ── 6. DROP TYPE IF EXISTS "position" ──────────────────────────────────
  await dropEnumIfExists()

  console.log('Done.')
}

// `position` is a reserved SQL keyword (used in the POSITION(x IN y)
// expression syntax) — DROP TYPE IF EXISTS position fails with a syntax
// error unless the identifier is quoted (found live, 2026-07-14). CREATE
// TYPE position AS ENUM(...) (scripts/migrate-position-enum.ts, retired)
// parsed fine unquoted because CREATE TYPE's grammar disambiguates
// differently; DROP TYPE does not.
async function dropEnumIfExists() {
  await db.execute(sql`DROP TYPE IF EXISTS "position"`)
  console.log('  dropped enum type "position" (if it still existed)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
