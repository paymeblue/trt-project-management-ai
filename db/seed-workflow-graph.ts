/**
 * Structural seed: copy the canonical 11 live steps (db/workflow-live-steps.ts)
 * 1:1 into the workflow_step_definitions / workflow_step_edges tables under
 * graph='live'.
 *
 * Edges (Phase 17 Plan 01, WF-06/D-03): an explicit edge list, by step key,
 * rather than a linear n->n+1 chain — every step is still sequential EXCEPT
 * the delivery cluster, which natively encodes the existing
 * Delivery Readiness + Delivery Project Checklist -> Project Check Report
 * parallel/join (both branches must complete, in either order, before
 * Project Check Report is actionable; see lib/workflow-graph.ts
 * getActionableSteps). This is a STRUCTURAL/behavioral seed only — it
 * mirrors the existing steps' shape and gating so the read engine
 * (lib/workflow-graph.ts) has real data to query, proven byte-identical to
 * LIVE_WORKFLOW_STEPS by scripts/verify-live-workflow.ts.
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
import { LIVE_WORKFLOW_STEPS } from './workflow-live-steps'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges } = schema

const GRAPH = 'live'

async function main() {
  console.log(`Seeding workflow graph "${GRAPH}" from LIVE_WORKFLOW_STEPS...`)

  // Delete existing rows for this graph first (edges before definitions to
  // respect the FK), so re-running the seed is idempotent.
  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH))
  console.log(`  Cleared existing "${GRAPH}" graph rows.`)

  // The two assignment-kind steps (v2.0 Phase 19/21) need their target pool +
  // required position seeded too — WorkflowStep itself doesn't carry those
  // fields, so they're keyed here by stepKey rather than added to the type.
  const ASSIGNMENT_STEP_CONFIG: Record<string, { targetRoles: ('design' | 'architect')[]; requiredPosition: string }> = {
    assign_designer_brief: { targetRoles: ['design', 'architect'], requiredPosition: 'head_designer' },
    design_initiation: { targetRoles: ['design', 'architect'], requiredPosition: 'head_designer' },
  }

  // Insert the 18 step definitions as a 1:1 structural copy of LIVE_WORKFLOW_STEPS.
  const idByStepN = new Map<number, string>()
  for (const step of LIVE_WORKFLOW_STEPS) {
    const assignmentConfig = ASSIGNMENT_STEP_CONFIG[step.key]
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: step.key,
        label: step.label,
        role: step.role,
        fulfillmentKind: step.kind,
        checklistSlug: step.slug ?? null,
        targetRoles: assignmentConfig?.targetRoles ?? null,
        requiredPosition: assignmentConfig?.requiredPosition ?? null,
        isOptional: false,
        orderIndex: step.n,
      })
      .returning({ id: workflowStepDefinitions.id })
    idByStepN.set(step.n, inserted.id)
    console.log(`  + step ${step.n}: "${step.key}" (${inserted.id})`)
  }

  // Explicit edge list by step key (Phase 17 Plan 01, D-03): every step stays
  // sequential EXCEPT the delivery cluster, which fans out from
  // materials_readiness into delivery_readiness AND delivery_project, both
  // converging on project_check_report (the parallel/join this milestone
  // requires to be natively modeled, not incidental numbering).
  const idByKey = new Map<string, string>()
  for (const step of LIVE_WORKFLOW_STEPS) {
    idByKey.set(step.key, idByStepN.get(step.n)!)
  }

  const EDGES: [string, string][] = [
    ['new_project', 'payment_confirmation'],
    ['payment_confirmation', 'assign_designer_brief'],
    ['assign_designer_brief', 'kickoff_meeting'],
    ['kickoff_meeting', 'design_meeting'],
    ['design_meeting', 'brief_taking'],
    ['brief_taking', 'design_initiation'],
    ['design_initiation', 'design_stage'],
    ['design_stage', 'confirmation'],
    ['confirmation', 'materials_readiness'],
    ['materials_readiness', 'delivery_readiness'],
    ['materials_readiness', 'delivery_project'],
    ['delivery_readiness', 'project_check_report'],
    ['delivery_project', 'project_check_report'],
    ['project_check_report', 'approval_installation'],
    ['approval_installation', 'installation_readiness'],
    ['installation_readiness', 'sorting'],
    ['sorting', 'close_out'],
    ['close_out', 'sign_off'],
  ]

  let edgeCount = 0
  for (const [fromKey, toKey] of EDGES) {
    const fromId = idByKey.get(fromKey)!
    const toId = idByKey.get(toKey)!
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: fromId, toStepId: toId })
    edgeCount++
  }
  console.log(`  + ${edgeCount} edges (incl. fan-out materials_readiness->{delivery_readiness,delivery_project} and join ->project_check_report)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
