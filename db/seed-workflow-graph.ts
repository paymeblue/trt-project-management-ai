/**
 * Structural seed: copy the canonical 23 live steps (db/workflow-live-steps.ts)
 * 1:1 into the workflow_step_definitions / workflow_step_edges tables under
 * graph='live'.
 *
 * Edges: an explicit edge list, by step key, rather than a positional n->n+1
 * loop (Phase 17 Plan 01, WF-06/D-03) — historically this encoded a
 * parallel/join around the delivery cluster, but that branch/join collapsed
 * to linear in Phase 22e when the two readiness steps were merged into one
 * dual-confirmation step (see db/workflow-live-steps.ts's header comments
 * for the full history). The live graph today is a single linear
 * chain across all 23 keys, confirmed by read-only inspection of the live DB
 * before this edit. This is a STRUCTURAL/behavioral seed only — it mirrors
 * the existing steps' shape and gating so the read engine
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

  // Insert the 23 step definitions as a 1:1 structural copy of LIVE_WORKFLOW_STEPS.
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

  // Explicit edge list by step key, over the current 23-step live graph.
  // Confirmed via read-only inspection of the live DB (workflow_step_definitions
  // + workflow_step_edges for graph='live') that the graph is a single linear
  // chain with no fan-out/join: the one parallel/join that used to exist around
  // the delivery cluster collapsed to linear in Phase 22e when the two
  // readiness steps were merged into one dual-confirmation step, and again
  // in Phase 22d when the two delivery-checklist steps were merged into
  // delivery_project_check (see db/workflow-live-steps.ts for the full history).
  const idByKey = new Map<string, string>()
  for (const step of LIVE_WORKFLOW_STEPS) {
    idByKey.set(step.key, idByStepN.get(step.n)!)
  }

  const EDGES: [string, string][] = [
    ['new_project', 'assign_designer_brief'],
    ['assign_designer_brief', 'brief_taking'],
    ['brief_taking', 'invoice_upload'],
    ['invoice_upload', 'invoice_timeline'],
    ['invoice_timeline', 'design_initiation'],
    ['design_initiation', 'kickoff_meeting'],
    ['kickoff_meeting', 'design_stage'],
    ['design_stage', 'ops_design_confirmation'],
    ['ops_design_confirmation', 'confirmation_correction'],
    ['confirmation_correction', 'internal_approval'],
    ['internal_approval', 'send_for_production'],
    ['send_for_production', 'project_review_authorisation'],
    ['project_review_authorisation', 'production_process'],
    ['production_process', 'confirmation'],
    ['confirmation', 'factory_manager_readiness'],
    ['factory_manager_readiness', 'materials_readiness'],
    ['materials_readiness', 'delivery_project_check'],
    ['delivery_project_check', 'approval_installation'],
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
  console.log(`  + ${edgeCount} edges (fully linear chain, new_project -> ... -> sign_off, no fan-out/join)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
