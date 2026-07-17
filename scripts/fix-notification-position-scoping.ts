/**
 * One-time repair (debug session: notification-position-scoping).
 *
 * Root cause: `set_delivery_timeline` (step 5), `internal_approval` (step
 * 12), and `send_for_production` (step 13, SENDER side) all have
 * `role='operations'` with `requiredPosition` NULL in graph='live'.
 * `canRoleActOnStep()` (lib/workflow.ts) special-cases stepRole='operations'
 * to `isAdminRole(userRole)` — true for BOTH `operations`- and
 * `super_admin`-role users, with no further narrowing when
 * `requiredPosition` is falsy. That NULL was deliberate under a since-
 * superseded design decision (D-01, quick task 260713-rb2/260714-qe4 — see
 * db/workflow-live-steps.ts comments), which REQUIREMENTS.md STG-11 and this
 * debug session's trigger now supersede for these 3 ops-approval-chain
 * steps specifically: they must be scoped to the exact Operations Admin
 * position (`operations_manager_admin`), not any operations/super_admin
 * title.
 *
 * This is a pure DATA fix — every consumer that reads `requiredPosition`
 * (page-level gate app/(app)/workflow/step/page.tsx, authorizeStep in
 * actions/workflow-graph.ts, getApprovalReceiverHolders +
 * approvalSenderEligible/approvalReceiverEligible in lib/workflow-graph.ts,
 * and lib/my-work.ts's position-mismatch exclusion) already implements the
 * exact-position gate correctly; it was simply never fed a value for these
 * 3 rows. `send_for_production`'s receiverRequiredPosition
 * (chief_production_officer) is already correct and is left untouched —
 * only its SENDER-side requiredPosition is set here.
 *
 * Idempotent: skips any row already at the target value.
 *
 * Run via: npx tsx scripts/fix-notification-position-scoping.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, positions } = schema

const GRAPH = 'live'
const TARGET_POSITION = 'operations_manager_admin'
const TARGET_KEYS = ['set_delivery_timeline', 'internal_approval', 'send_for_production'] as const

async function main() {
  const [pos] = await db
    .select({ slug: positions.slug })
    .from(positions)
    .where(eq(positions.slug, TARGET_POSITION))
    .limit(1)
  if (!pos) {
    console.error(`REFUSING TO RUN: position "${TARGET_POSITION}" does not exist in the positions table.`)
    process.exit(1)
  }

  let changed = 0
  for (const key of TARGET_KEYS) {
    const [row] = await db
      .select({ id: workflowStepDefinitions.id, requiredPosition: workflowStepDefinitions.requiredPosition })
      .from(workflowStepDefinitions)
      .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, key)))
      .limit(1)
    if (!row) {
      console.error(`REFUSING TO CONTINUE: step "${key}" not found in graph=live.`)
      process.exit(1)
    }
    if (row.requiredPosition === TARGET_POSITION) {
      console.log(`  "${key}" already requiredPosition=${TARGET_POSITION} — skipping (idempotent no-op).`)
      continue
    }
    await db
      .update(workflowStepDefinitions)
      .set({ requiredPosition: TARGET_POSITION, updatedAt: new Date() })
      .where(eq(workflowStepDefinitions.id, row.id))
    console.log(`  "${key}": requiredPosition ${row.requiredPosition ?? 'null'} -> ${TARGET_POSITION}`)
    changed++
  }

  console.log(changed ? `Done — updated ${changed} step definition(s).` : 'Done — nothing to update.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
