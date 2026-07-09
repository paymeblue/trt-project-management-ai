/**
 * One-time, additive migration (v2.0, STG-01/PAY-01/PAY-02): inserts a new
 * "Payment Confirmation & Timeline" step at position 2 in the live graph,
 * shifting every step from the old position 2 onward down by one, and
 * changes step 1 ("new_project") from operations-owned "New Project" to
 * customer_care-owned "Project Intent".
 *
 * UNLIKE db/seed-workflow-graph.ts, this script does NOT delete and recreate
 * definitions — every existing step definition keeps its same id (only
 * orderIndex/role/label change in place), because real projects already
 * reference these steps and re-creating them would orphan any FK. This
 * mirrors the same care Phase 17 took migrating onto the live engine.
 *
 * What it migrates, all in one pass:
 *  1. workflow_step_definitions: orderIndex >= 2 shifts to +1 (same ids);
 *     'new_project' role -> customer_care, label -> "Project Intent"
 *  2. Inserts the new 'payment_confirmation' definition at orderIndex 2
 *  3. workflow_step_edges: rewires new_project -> confirmation into
 *     new_project -> payment_confirmation -> confirmation
 *  4. projects.currentStep >= 2 shifts to +1 (so an in-flight project stays
 *     conceptually on the SAME real step it was on before the insert)
 *  5. project_step_deadlines.stepN >= 2 shifts to +1
 *  6. project_step_completions.stepN >= 2 shifts to +1 (audit trail only;
 *     all existing rows have stepDefId=null per the pre-flight check below,
 *     so no FK risk)
 *
 * Idempotent: if a 'payment_confirmation' step already exists in graph='live',
 * exits without making any changes.
 *
 * Run via: npx tsx scripts/migrate-insert-payment-confirmation-step.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, gte } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const {
  workflowStepDefinitions,
  workflowStepEdges,
  projects,
  projectStepDeadlines,
  projectStepCompletions,
} = schema

const GRAPH = 'live'

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'payment_confirmation')))
    .limit(1)
  if (existing) {
    console.log('payment_confirmation step already exists in graph=live — nothing to do.')
    return
  }

  // ── Pre-flight safety check ──────────────────────────────────────────
  // This migration renumbers stepN/stepDefId-bearing rows in place. If any
  // completion already carries a stepDefId (FK-linked, post-Phase-16 engine
  // usage), refuse to run blind — that would need a more careful id-aware
  // migration than this stepN-shift script performs.
  const allCompletions = await db.select().from(projectStepCompletions)
  const fkLinked = allCompletions.filter((c) => c.stepDefId !== null)
  if (fkLinked.length > 0) {
    console.error(
      `REFUSING TO RUN: ${fkLinked.length} project_step_completions row(s) already carry a stepDefId. ` +
        'This script only shifts stepN by number and does not touch stepDefId values — verify those rows are consistent with the shift before proceeding, or extend this script to handle them.',
    )
    process.exit(1)
  }

  const [newProjectStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'new_project')))
    .limit(1)
  const [confirmationStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'confirmation')))
    .limit(1)
  if (!newProjectStep || !confirmationStep) {
    console.error('REFUSING TO RUN: could not find new_project and/or confirmation steps in graph=live.')
    process.exit(1)
  }

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── 1. Shift orderIndex >= 2 by +1 (same ids) ────────────────────────
  const allSteps = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
    .orderBy(workflowStepDefinitions.orderIndex)
  const toShift = allSteps.filter((s) => s.orderIndex >= 2).sort((a, b) => b.orderIndex - a.orderIndex)
  // Descending order avoids transient collisions with the unique (graph, step_key) — orderIndex has no
  // uniqueness constraint, but shifting high-to-low is still the safer habit.
  for (const s of toShift) {
    await db
      .update(workflowStepDefinitions)
      .set({ orderIndex: s.orderIndex + 1, updatedAt: new Date() })
      .where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  shifted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex + 1}`)
  }

  // ── 2. Update step 1 (new_project): role -> customer_care ────────────
  await db
    .update(workflowStepDefinitions)
    .set({ role: 'customer_care', label: 'Project Intent', updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, newProjectStep.id))
  console.log('  updated "new_project": role operations -> customer_care, label -> "Project Intent"')

  // ── 3. Insert the new payment_confirmation step at orderIndex 2 ──────
  const [inserted] = await db
    .insert(workflowStepDefinitions)
    .values({
      graph: GRAPH,
      stepKey: 'payment_confirmation',
      label: 'Payment Confirmation & Timeline',
      role: 'operations',
      fulfillmentKind: 'payment_confirmation',
      isOptional: false,
      orderIndex: 2,
    })
    .returning({ id: workflowStepDefinitions.id })
  console.log(`  + inserted "payment_confirmation" (${inserted.id}) at orderIndex 2`)

  // ── 4. Rewire edges: new_project -> confirmation becomes ────────────
  //      new_project -> payment_confirmation -> confirmation
  const deleted = await db
    .delete(workflowStepEdges)
    .where(
      and(
        eq(workflowStepEdges.graph, GRAPH),
        eq(workflowStepEdges.fromStepId, newProjectStep.id),
        eq(workflowStepEdges.toStepId, confirmationStep.id),
      ),
    )
    .returning({ id: workflowStepEdges.id })
  if (deleted.length !== 1) {
    console.error(`REFUSING TO CONTINUE: expected to delete exactly 1 edge (new_project->confirmation), deleted ${deleted.length}.`)
    process.exit(1)
  }
  await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: newProjectStep.id, toStepId: inserted.id })
  await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: inserted.id, toStepId: confirmationStep.id })
  console.log('  rewired edges: new_project -> payment_confirmation -> confirmation')

  // ── 5. Shift projects.currentStep >= 2 by +1 ─────────────────────────
  const allProjects = await db.select().from(projects)
  for (const p of allProjects) {
    if (p.currentStep >= 2) {
      await db
        .update(projects)
        .set({ currentStep: p.currentStep + 1, updatedAt: new Date() })
        .where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${p.currentStep + 1}`)
    }
  }

  // ── 6. Shift project_step_deadlines.stepN >= 2 by +1 ─────────────────
  const allDeadlines = await db.select().from(projectStepDeadlines).where(gte(projectStepDeadlines.stepN, 2))
  // Descending stepN first to avoid transiently colliding with the (projectId, stepN) unique constraint.
  for (const d of allDeadlines.sort((a, b) => b.stepN - a.stepN)) {
    await db.update(projectStepDeadlines).set({ stepN: d.stepN + 1 }).where(eq(projectStepDeadlines.id, d.id))
  }
  console.log(`  shifted ${allDeadlines.length} project_step_deadlines row(s)`)

  // ── 7. Shift project_step_completions.stepN >= 2 by +1 (audit only) ──
  const completionsToShift = allCompletions.filter((c) => c.stepN >= 2)
  for (const c of completionsToShift) {
    await db.update(projectStepCompletions).set({ stepN: c.stepN + 1 }).where(eq(projectStepCompletions.id, c.id))
  }
  console.log(`  shifted ${completionsToShift.length} project_step_completions row(s)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
