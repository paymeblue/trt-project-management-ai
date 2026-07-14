/**
 * CLI verification harness (quick task 260714-bpq — renameable positions):
 * proves renamePositionCore's atomic cascade + collision-reject against the
 * LIVE Neon DB, touching ONLY throwaway, uniquely-named rows (cleaned up in
 * a finally block) — never a real position/user/step.
 *
 * Run via: npm run verify:position-rename
 *
 * Exits 0 iff every assertion passes; exits 1 otherwise.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only / next-cache shim (mirrors scripts/verify-live-workflow.ts) ─
type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must run before the static import below
const NodeModule = require('node:module') as { _load: NodeModuleLoader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  if (request === 'next/cache') return { revalidatePath: () => {} }
  return originalLoad.apply(this, [request, ...rest])
} as NodeModuleLoader

// eslint-disable-next-line @typescript-eslint/no-require-imports
const positionsAction = require('../actions/positions') as typeof import('../actions/positions')

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

let pass = 0
let fail = 0
const failures: string[] = []

function assertEqual<T>(label: string, actual: T, expected: T) {
  if (actual === expected) {
    console.log(`  PASS: ${label}`)
    pass++
  } else {
    console.log(`  FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
    fail++
    failures.push(label)
  }
}

function assertTrue(label: string, actual: boolean) {
  assertEqual(label, actual, true)
}

async function main() {
  const ts = Date.now()
  const slugA = `zzz_verify_${ts}`
  const labelA = `ZZZ Verify ${ts}`
  const slugB = `zzz_verify_b_${ts}`
  const labelB = `ZZZ Verify B ${ts}`
  const graph = `verify-${ts}`
  const createdUserIds: string[] = []
  const createdStepDefIds: string[] = []

  try {
    // ── Seed throwaway rows ────────────────────────────────────────────
    await db.insert(schema.positions).values({ slug: slugA, label: labelA })
    await db.insert(schema.positions).values({ slug: slugB, label: labelB })

    const [user] = await db
      .insert(schema.users)
      .values({ email: `verify-position-rename-${ts}@example.com`, name: 'Verify Position Rename', role: 'operations', position: slugA })
      .returning({ id: schema.users.id })
    createdUserIds.push(user.id)

    const [stepDef] = await db
      .insert(schema.workflowStepDefinitions)
      .values({
        graph,
        stepKey: `verify_step_${ts}`,
        label: 'Verify Step',
        role: 'operations',
        fulfillmentKind: 'ack',
        requiredPosition: slugA,
        orderIndex: 1,
      })
      .returning({ id: schema.workflowStepDefinitions.id })
    createdStepDefIds.push(stepDef.id)

    // ── Rename slugA -> a new label (new slug derived) ──────────────────
    console.log('\n=== Rename cascade ===')
    const newLabel = `ZZZ Verify Renamed ${ts}`
    const result = await positionsAction.renamePositionCore({ slug: slugA, newLabel })
    assertTrue('rename ok', result.ok)
    if (result.ok) {
      assertEqual('userCount == 1', result.userCount, 1)
      assertEqual('stepCount == 1', result.stepCount, 1)
      assertEqual('newLabel matches input', result.newLabel, newLabel)

      const [positionRow] = await db.select().from(schema.positions).where(eq(schema.positions.slug, result.newSlug)).limit(1)
      assertTrue('positions row updated to new slug/label', positionRow?.label === newLabel)

      const [userRow] = await db.select({ position: schema.users.position }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
      assertEqual('user.position followed the rename', userRow?.position, result.newSlug)

      const [stepRow] = await db
        .select({ requiredPosition: schema.workflowStepDefinitions.requiredPosition })
        .from(schema.workflowStepDefinitions)
        .where(eq(schema.workflowStepDefinitions.id, stepDef.id))
        .limit(1)
      assertEqual('step required_position followed the rename', stepRow?.requiredPosition, result.newSlug)

      // clean up the renamed slug too (it's no longer slugA)
      await db.delete(schema.positions).where(eq(schema.positions.slug, result.newSlug))
    }

    // ── Collision reject: renaming slugB to a label whose slug == slugB is fine;
    // renaming it to collide with an EXISTING different position must fail ──
    console.log('\n=== Collision reject ===')
    // Re-seed a position holding the label that would collide (simulate a real
    // different position occupying that slug).
    const collisionSlug = `zzz_verify_collision_${ts}`
    await db.insert(schema.positions).values({ slug: collisionSlug, label: 'ZZZ Verify Collision' })

    const collisionResult = await positionsAction.renamePositionCore({ slug: slugB, newLabel: 'ZZZ Verify Collision' })
    assertEqual('collision rename returns ok=false', collisionResult.ok, false)

    const [slugBRow] = await db.select().from(schema.positions).where(eq(schema.positions.slug, slugB)).limit(1)
    assertTrue('slugB position untouched after rejected collision', slugBRow?.label === labelB)

    await db.delete(schema.positions).where(eq(schema.positions.slug, collisionSlug))
  } catch (err) {
    console.error('\nUNEXPECTED HARNESS ERROR:', err)
    fail++
    failures.push(`harness error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const id of createdStepDefIds) {
      await db.delete(schema.workflowStepDefinitions).where(eq(schema.workflowStepDefinitions.id, id))
    }
    for (const id of createdUserIds) {
      await db.delete(schema.users).where(eq(schema.users.id, id))
    }
    await db.delete(schema.positions).where(eq(schema.positions.slug, slugA))
    await db.delete(schema.positions).where(eq(schema.positions.slug, slugB))
    console.log('\nCleaned up throwaway rows.')
  }

  console.log(`\n${'='.repeat(60)}`)
  if (fail > 0) {
    console.log(`RESULT: FAIL (${fail} assertion(s) failed)`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`RESULT: PASS (${pass}/${pass} assertions)`)
  process.exit(0)
}

main()
