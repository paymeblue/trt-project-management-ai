/**
 * One-time repair (v2.0 Phase 21): realigns the 6 Design steps' orderIndex
 * and graph edges to match db/workflow-live-steps.ts (reconciled 2026-07-10):
 *
 *   assign_designer_brief -> brief_taking -> design_initiation ->
 *   kickoff_meeting -> design_meeting -> design_stage
 *
 * The initial migrate-insert-design-stages.ts used a different order; this
 * script fixes live DBs that already ran that migration. Idempotent: exits
 * when brief_taking is already at orderIndex 4.
 *
 * Also repairs projects stuck at a step that already has a completion row
 * (graph steps completed before completeGraphStep synced currentStep).
 *
 * Run via: npx tsx scripts/fix-design-step-order.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges, projects, projectStepCompletions } = schema

const GRAPH = 'live'

const CANONICAL_ORDER = [
  'assign_designer_brief',
  'brief_taking',
  'design_initiation',
  'kickoff_meeting',
  'design_meeting',
  'design_stage',
] as const

async function main() {
  const designSteps = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))

  const byKey = new Map(designSteps.map((s) => [s.stepKey, s]))
  const briefTaking = byKey.get('brief_taking')
  const kickoff = byKey.get('kickoff_meeting')
  if (!briefTaking || !kickoff) {
    console.log('Design steps not found in graph=live — nothing to do.')
    return
  }

  if (briefTaking.orderIndex === 4 && kickoff.orderIndex === 6) {
    console.log('Design step order already canonical — skipping reorder.')
  } else if (kickoff.orderIndex === 4 && briefTaking.orderIndex === 6) {
    console.log('Detected legacy design-step order — realigning orderIndex + edges...')
    const assign = byKey.get('assign_designer_brief')
    const designInitiation = byKey.get('design_initiation')
    const designMeeting = byKey.get('design_meeting')
    const designStage = byKey.get('design_stage')
    const payment = byKey.get('payment_confirmation')
    const confirmation = byKey.get('confirmation')
    if (!assign || !designInitiation || !designMeeting || !designStage || !payment || !confirmation) {
      console.error('Missing anchor steps — aborting.')
      process.exit(1)
    }

    const targetOrder: [string, number][] = [
      [assign.id, 3],
      [briefTaking.id, 4],
      [designInitiation.id, 5],
      [kickoff.id, 6],
      [designMeeting.id, 7],
      [designStage.id, 8],
    ]
    for (const [id, orderIndex] of targetOrder) {
      await db
        .update(workflowStepDefinitions)
        .set({ orderIndex, updatedAt: new Date() })
        .where(eq(workflowStepDefinitions.id, id))
      console.log(`  orderIndex ${orderIndex}: ${designSteps.find((s) => s.id === id)?.stepKey}`)
    }

    // Remove old design-chain edges between payment and confirmation, then rewire.
    const designIds = new Set(CANONICAL_ORDER.map((k) => byKey.get(k)!.id))
    const edges = await db.select().from(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
    for (const e of edges) {
      if (designIds.has(e.fromStepId) || designIds.has(e.toStepId)) {
        await db.delete(workflowStepEdges).where(eq(workflowStepEdges.id, e.id))
      }
    }
    const chain = [payment.id, assign.id, briefTaking.id, designInitiation.id, kickoff.id, designMeeting.id, designStage.id, confirmation.id]
    for (let i = 0; i < chain.length - 1; i++) {
      await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: chain[i], toStepId: chain[i + 1] })
    }
    console.log('  rewired design-chain edges.')
  } else {
    console.log('Unexpected design-step orderIndex values — manual review required.', {
      briefTaking: briefTaking.orderIndex,
      kickoff: kickoff.orderIndex,
    })
  }

  // Repair projects whose current step already has a completion row but
  // currentStep was never advanced (pre-fix graph completions).
  const allProjects = await db.select().from(projects)
  const lastStepN = Math.max(...designSteps.map((s) => s.orderIndex), 18)
  let repaired = 0
  for (const p of allProjects) {
    if (p.currentStep > lastStepN) continue
    const [completion] = await db
      .select({ id: projectStepCompletions.id })
      .from(projectStepCompletions)
      .where(
        and(
          eq(projectStepCompletions.projectId, p.id),
          eq(projectStepCompletions.stepN, p.currentStep),
        ),
      )
      .limit(1)
    if (!completion) continue
    const nextStep = p.currentStep + 1
    const done = nextStep > lastStepN
    await db
      .update(projects)
      .set({
        currentStep: nextStep,
        status: done ? 'delivered' : p.status,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, p.id))
    console.log(`  repaired project "${p.name}": currentStep ${p.currentStep} -> ${nextStep}`)
    repaired++
  }
  console.log(repaired ? `Repaired ${repaired} stuck project(s).` : 'No stuck projects needed repair.')
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
