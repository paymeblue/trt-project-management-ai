/**
 * One-time, additive-safe migration (v2.0, formal Phase 19, plan 19-01):
 * converts `users.position` from free `text()` to the DB-enforced Postgres
 * enum `position` (ROLE-04) — sourced from `POSITION_VALUES` in
 * lib/workflow.ts, the single source of truth also consumed by the pgEnum
 * declaration in db/schema.ts and (downstream, 19-03) every position-picking
 * UI.
 *
 * BLOCKING HUMAN CHECKPOINT (19-01 Task 3): this script runs against the LIVE
 * Neon database, converting a column that already holds real user rows. Do
 * NOT run it without explicit human approval — see 19-01-PLAN.md Task 3.
 *
 * Steps, in order, idempotently:
 *   1. CREATE TYPE position AS ENUM (...) — guarded so a duplicate_object
 *      error (already exists) is caught and treated as a no-op, not a failure.
 *   2. Backfill any approved junk/placeholder `users.position` values to NULL
 *      via a targeted UPDATE naming the EXACT values approved at the Task 3
 *      checkpoint (APPROVED_BACKFILL_VALUES below — empty unless/until the
 *      checkpoint approves specific values; scripts/inspect-positions.ts run
 *      2026-07-11 flagged NONE, so this array starts empty).
 *   3. ALTER TABLE users ALTER COLUMN position TYPE position USING
 *      position::text::position.
 *
 * Aborts with a thrown error (no partial/silent data loss) if ANY existing
 * users.position value is NOT in POSITION_VALUES and NOT in
 * APPROVED_BACKFILL_VALUES — never silently drops data.
 *
 * Idempotent: if users.position's udt_name is already 'position' (the ALTER
 * already ran), the script logs and exits without making further changes.
 *
 * Run via: npx tsx scripts/migrate-position-enum.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { POSITION_VALUES } from '../lib/workflow'

config({ path: '.env.local' })

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient, { schema })

// Exact values approved at the Task 3 checkpoint to be backfilled to NULL.
// scripts/inspect-positions.ts (run 2026-07-11) flagged NONE as junk — every
// live users.position value was a legitimate title kept verbatim in
// POSITION_VALUES. Update this array ONLY if the checkpoint approves specific
// values to null out; never widen it beyond what was explicitly approved.
const APPROVED_BACKFILL_VALUES: string[] = []

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const udtResult = await db.execute<{ udt_name: string }>(sql`
    SELECT udt_name FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'position'
  `)
  const [udtRow] = udtResult.rows
  if (udtRow?.udt_name === 'position') {
    console.log("users.position udt_name is already 'position' — migration already ran, nothing to do.")
    return
  }

  // ── Pre-flight: abort if any live value is uncovered ─────────────────
  const liveValuesResult = await db.execute<{ position: string }>(sql`
    SELECT DISTINCT position FROM users WHERE position IS NOT NULL
  `)
  const covered = new Set<string>([...POSITION_VALUES, ...APPROVED_BACKFILL_VALUES])
  const uncovered = liveValuesResult.rows.map((r) => r.position).filter((v) => !covered.has(v))
  if (uncovered.length > 0) {
    throw new Error(
      `REFUSING TO RUN: found live users.position value(s) NOT in POSITION_VALUES and NOT in APPROVED_BACKFILL_VALUES: ${JSON.stringify(uncovered)}. Add them to POSITION_VALUES (lib/workflow.ts) verbatim, or add them to APPROVED_BACKFILL_VALUES here ONLY with explicit Task 3 checkpoint approval, then re-run.`,
    )
  }

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── 1. CREATE TYPE position AS ENUM (...) — idempotent via catch ─────
  const enumValuesSql = POSITION_VALUES.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')
  try {
    await db.execute(sql.raw(`CREATE TYPE position AS ENUM (${enumValuesSql})`))
    console.log('  created enum type "position"')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('already exists') || message.includes('duplicate_object')) {
      console.log('  enum type "position" already exists — skipping create')
    } else {
      throw err
    }
  }

  // ── 2. Backfill approved junk values to NULL (explicit array only) ──
  if (APPROVED_BACKFILL_VALUES.length > 0) {
    for (const junkValue of APPROVED_BACKFILL_VALUES) {
      const result = await db.execute(
        sql`UPDATE users SET position = NULL WHERE position = ${junkValue}`,
      )
      console.log(`  backfilled "${junkValue}" -> NULL (${result.rowCount ?? 0} row(s) affected)`)
    }
  } else {
    console.log('  no approved backfill values — skipping backfill step')
  }

  // ── 3. ALTER TABLE users ALTER COLUMN position TYPE position ────────
  await db.execute(sql`ALTER TABLE users ALTER COLUMN position TYPE position USING position::text::position`)
  console.log('  altered users.position column TYPE to enum "position"')

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
