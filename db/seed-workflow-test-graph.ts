/**
 * Test graph seed (Phase 16 Plan 04): seeds an ISOLATED `graph='test'` set of
 * workflow_step_definitions + workflow_step_edges that exercises every
 * capability this phase must prove — the 4 fulfillment kinds (checklist +
 * yes_no_upload + approval + assignment), an optional step (WF-04), and a
 * parallel/join pair (WF-05).
 *
 * This does NOT touch the 'live' graph seeded by db/seed-workflow-graph.ts —
 * `graph` namespaces the two completely apart (see db/schema.ts).
 *
 * Run via: npm run db:seed-workflow-test-graph
 *
 * Idempotent: deletes existing graph='test' edges and definitions first
 * (edges before definitions, to respect the edges->definitions FK), then
 * re-inserts fresh.
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges } = schema

const GRAPH = 'test'

type TestStepDef = {
  key: string
  label: string
  role: 'operations' | 'site_pm' | 'factory_pm' | 'super_admin'
  kind: (typeof schema.fulfillmentKindEnum.enumValues)[number]
  checklistSlug?: string
  targetRole?: 'factory_pm' | 'site_pm' | 'super_admin' | 'operations'
  isOptional?: boolean
  orderIndex: number
}

const TEST_STEPS: TestStepDef[] = [
  { key: 'test_start', label: 'Test Start', role: 'operations', kind: 'creation', orderIndex: 1 },
  { key: 'test_yesno', label: 'Test Yes/No + Upload', role: 'site_pm', kind: 'yes_no_upload', orderIndex: 2 },
  { key: 'test_optional', label: 'Test Optional Ack', role: 'site_pm', kind: 'ack', isOptional: true, orderIndex: 3 },
  { key: 'test_approval', label: 'Test Approval', role: 'operations', kind: 'approval', orderIndex: 4 },
  { key: 'test_assign', label: 'Test Assignment', role: 'operations', kind: 'assignment', targetRole: 'factory_pm', orderIndex: 5 },
  { key: 'test_branch_a', label: 'Test Branch A (checklist)', role: 'site_pm', kind: 'checklist', checklistSlug: 'sorting', orderIndex: 6 },
  { key: 'test_branch_b', label: 'Test Branch B (readiness)', role: 'factory_pm', kind: 'readiness', orderIndex: 7 },
  { key: 'test_join', label: 'Test Join', role: 'super_admin', kind: 'ack', orderIndex: 8 },
]

// Linear chain 1->2->3->4->5, fan-out 5->6 AND 5->7, converge 6->8 AND 7->8.
const TEST_EDGES: [string, string][] = [
  ['test_start', 'test_yesno'],
  ['test_yesno', 'test_optional'],
  ['test_optional', 'test_approval'],
  ['test_approval', 'test_assign'],
  ['test_assign', 'test_branch_a'],
  ['test_assign', 'test_branch_b'],
  ['test_branch_a', 'test_join'],
  ['test_branch_b', 'test_join'],
]

async function main() {
  console.log(`Seeding workflow graph "${GRAPH}"...`)

  // Delete existing rows for this graph first (edges before definitions to
  // respect the FK), so re-running the seed is idempotent.
  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH))
  console.log(`  Cleared existing "${GRAPH}" graph rows.`)

  const idByKey = new Map<string, string>()
  for (const step of TEST_STEPS) {
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: step.key,
        label: step.label,
        role: step.role,
        fulfillmentKind: step.kind,
        checklistSlug: step.checklistSlug ?? null,
        targetRole: step.targetRole ?? null,
        isOptional: step.isOptional ?? false,
        orderIndex: step.orderIndex,
      })
      .returning({ id: workflowStepDefinitions.id })
    idByKey.set(step.key, inserted.id)
    console.log(`  + step ${step.orderIndex}: "${step.key}" (${inserted.id})`)
  }

  let edgeCount = 0
  for (const [fromKey, toKey] of TEST_EDGES) {
    const fromId = idByKey.get(fromKey)!
    const toId = idByKey.get(toKey)!
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: fromId, toStepId: toId })
    edgeCount++
  }
  console.log(`  + ${edgeCount} edges (incl. fan-out 5->{6,7} and join 6->8, 7->8)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
