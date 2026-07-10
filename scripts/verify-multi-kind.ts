/**
 * CLI verification harness (v2.0 Phase 18.1): proves a step configured with
 * BOTH a primary kind AND additionalKinds requires ALL of them fulfilled
 * before completeGraphStep accepts a non-skip completion — against a
 * throwaway TEST-graph step (never touches 'live').
 *
 * Run via: npx tsx scripts/verify-multi-kind.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeModule = require('node:module') as { _load: NodeModuleLoader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  return originalLoad.apply(this, [request, ...rest])
} as NodeModuleLoader
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wg = require('../lib/workflow-graph') as typeof import('../lib/workflow-graph')

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })
const GRAPH = 'test'

let pass = 0
let fail = 0
const failures: string[] = []
async function assertOk(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    console.log(`  PASS: ${label}`)
    pass++
  } catch (err) {
    console.log(`  FAIL: ${label}`, err instanceof Error ? err.message : err)
    fail++
    failures.push(label)
  }
}
async function assertThrows(label: string, expected: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    console.log(`  FAIL: ${label} (expected throw "${expected}", succeeded)`)
    fail++
    failures.push(label)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === expected) {
      console.log(`  PASS: ${label}`)
      pass++
    } else {
      console.log(`  FAIL: ${label} (expected "${expected}", got "${msg}")`)
      fail++
      failures.push(label)
    }
  }
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []
  let stepId: string | null = null
  try {
    const [actor] = await db
      .insert(schema.users)
      .values({ email: `multi-kind-verify-${Date.now()}@example.com`, name: 'Multi Kind Verify', role: 'operations' })
      .returning({ id: schema.users.id })
    createdUserIds.push(actor.id)

    const res = await wg.createGraphStep({
      graph: GRAPH,
      stepKey: `multi_kind_test_${Date.now()}`,
      label: 'Multi-kind test step',
      role: 'operations',
      fulfillmentKind: 'yes_no_upload',
      additionalKinds: ['ack'], // 'ack' isn't state-gated so this also proves non-gated kinds are ignored by the gate
      isOptional: false,
    })
    if (!res.stepId) throw new Error('failed to create test step')
    stepId = res.stepId

    // Add a SECOND additional kind that IS state-gated (assignment) via updateGraphStep,
    // since createGraphStep's additionalKinds above only exercised a non-gated kind.
    await wg.updateGraphStep({ stepId, additionalKinds: ['assignment'] })
    await db.update(schema.workflowStepDefinitions).set({ targetRoles: ['operations'] }).where(eq(schema.workflowStepDefinitions.id, stepId))

    const [project] = await db.insert(schema.projects).values({ name: `MULTI-KIND-VERIFY-${Date.now()}`, createdBy: actor.id }).returning({ id: schema.projects.id })
    createdProjectIds.push(project.id)

    await assertThrows('complete rejected before either requirement is fulfilled', 'step-not-fulfilled', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: stepId!, actorId: actor.id }),
    )

    await assertOk('submit yes_no_upload (1 of 2 requirements)', () =>
      wg.submitYesNoUpload({ projectId: project.id, stepDefId: stepId!, actorId: actor.id, answer: 'yes' }),
    )
    await assertThrows('complete STILL rejected — assignment requirement not yet fulfilled', 'step-not-fulfilled', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: stepId!, actorId: actor.id }),
    )

    await assertOk('assign a user (2 of 2 requirements)', () =>
      wg.assignUser({ projectId: project.id, stepDefId: stepId!, actorId: actor.id, assignedUserId: actor.id }),
    )
    await assertOk('complete now succeeds — both requirements fulfilled', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: stepId!, actorId: actor.id }),
    )
  } catch (err) {
    console.error('UNEXPECTED HARNESS ERROR:', err)
    fail++
  } finally {
    for (const projectId of createdProjectIds) await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
    if (stepId) await db.delete(schema.workflowStepDefinitions).where(eq(schema.workflowStepDefinitions.id, stepId))
    for (const userId of createdUserIds) await db.delete(schema.users).where(eq(schema.users.id, userId))
    console.log(`Cleaned up ${createdProjectIds.length} project(s), 1 test step, ${createdUserIds.length} user(s).`)
  }
  console.log(`\n${'='.repeat(50)}`)
  if (fail > 0) {
    console.log(`RESULT: FAIL (${fail})`, failures)
    process.exit(1)
  }
  console.log(`RESULT: PASS (${pass}/${pass})`)
}
main()
