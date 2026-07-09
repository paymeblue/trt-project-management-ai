/**
 * Structural seed: copy the current 11 live WORKFLOW_STEPS (lib/workflow.ts)
 * 1:1 into the workflow_step_definitions / workflow_step_edges tables under
 * graph='live', with a linear chain of edges (step n -> step n+1).
 *
 * This is a STRUCTURAL seed only — it mirrors the existing steps' shape so
 * the read engine (lib/workflow-graph.ts) has real data to query. It is NOT
 * the Phase 17 verified content migration.
 *
 * Run via: npm run db:seed-workflow-graph
 *
 * Idempotent: deletes existing graph='live' edges and definitions first
 * (edges before definitions, to respect the edges->definitions FK), then
 * re-inserts fresh.
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from './schema'
import { WORKFLOW_STEPS } from '../lib/workflow'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges } = schema

const GRAPH = 'live'

async function main() {
  console.log(`Seeding workflow graph "${GRAPH}" from WORKFLOW_STEPS...`)

  // Delete existing rows for this graph first (edges before definitions to
  // respect the FK), so re-running the seed is idempotent.
  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH))
  console.log(`  Cleared existing "${GRAPH}" graph rows.`)

  // Insert the 11 step definitions as a 1:1 structural copy of WORKFLOW_STEPS.
  const idByStepN = new Map<number, string>()
  for (const step of WORKFLOW_STEPS) {
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: step.key,
        label: step.label,
        role: step.role,
        fulfillmentKind: step.kind,
        checklistSlug: step.slug ?? null,
        targetRole: null,
        isOptional: false,
        orderIndex: step.n,
      })
      .returning({ id: workflowStepDefinitions.id })
    idByStepN.set(step.n, inserted.id)
    console.log(`  + step ${step.n}: "${step.key}" (${inserted.id})`)
  }

  // Insert a linear edge for each consecutive pair (n -> n+1).
  let edgeCount = 0
  for (const step of WORKFLOW_STEPS) {
    const nextN = step.n + 1
    if (nextN > WORKFLOW_STEPS.length) continue
    const fromId = idByStepN.get(step.n)!
    const toId = idByStepN.get(nextN)!
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: fromId, toStepId: toId })
    edgeCount++
  }
  console.log(`  + ${edgeCount} linear edges`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
