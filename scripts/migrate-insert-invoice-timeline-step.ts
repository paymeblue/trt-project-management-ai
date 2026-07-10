/**
 * One-time, additive migration (v2.0 Phase 22b, 2026-07-10): inserts
 * 'invoice_timeline' immediately after 'invoice_upload' (orderIndex 5),
 * shifting design_initiation (was 6) and everything after it down by 1 (26
 * steps -> 27).
 *
 * 'invoice_timeline' (role=operations, requiredPosition=head_of_operations,
 * kind=timeline_setting) is where Head of Operations sets the overall
 * delivery date + a deadline for every step from design_initiation onward,
 * once the invoice has been uploaded — this used to happen at
 * payment_confirmation (see actions/projects.ts confirmPaymentAndSetTimelineAction,
 * now simplified to just confirm payment) but moved here per the
 * production-pipeline update.
 *
 * Idempotent: if 'invoice_timeline' already exists in graph='live', exits
 * without making any changes. Mirrors scripts/migrate-insert-design-stages.ts.
 *
 * Run via: npx tsx scripts/migrate-insert-invoice-timeline-step.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, gte } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges, projects, projectStepDeadlines, projectStepCompletions } = schema

const GRAPH = 'live'
const SHIFT = 1

async function main() {
  const [existing] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_timeline')))
    .limit(1)
  if (existing) {
    console.log('invoice_timeline already exists in graph=live — nothing to do.')
    return
  }

  const [invoiceUploadStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_upload')))
    .limit(1)
  const [designInitiationStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'design_initiation')))
    .limit(1)
  if (!invoiceUploadStep || !designInitiationStep) {
    console.error('REFUSING TO RUN: could not find invoice_upload and/or design_initiation in graph=live.')
    process.exit(1)
  }

  console.log('Pre-flight OK. Proceeding with migration...')

  const boundary = designInitiationStep.orderIndex
  const allSteps = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH)).orderBy(workflowStepDefinitions.orderIndex)
  const toShift = allSteps.filter((s) => s.orderIndex >= boundary).sort((a, b) => b.orderIndex - a.orderIndex)
  for (const s of toShift) {
    await db.update(workflowStepDefinitions).set({ orderIndex: s.orderIndex + SHIFT, updatedAt: new Date() }).where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  shifted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex + SHIFT}`)
  }

  const [inserted] = await db
    .insert(workflowStepDefinitions)
    .values({
      graph: GRAPH,
      stepKey: 'invoice_timeline',
      label: 'Set Delivery Timeline (Invoice)',
      role: 'operations',
      fulfillmentKind: 'timeline_setting',
      requiredPosition: 'head_of_operations',
      isOptional: false,
      orderIndex: boundary,
    })
    .returning({ id: workflowStepDefinitions.id })
  console.log(`  + inserted "invoice_timeline" (${inserted.id}) at orderIndex ${boundary}`)

  const deleted = await db
    .delete(workflowStepEdges)
    .where(and(eq(workflowStepEdges.graph, GRAPH), eq(workflowStepEdges.fromStepId, invoiceUploadStep.id), eq(workflowStepEdges.toStepId, designInitiationStep.id)))
    .returning({ id: workflowStepEdges.id })
  if (deleted.length !== 1) {
    console.error(`REFUSING TO CONTINUE: expected to delete exactly 1 edge (invoice_upload->design_initiation), deleted ${deleted.length}.`)
    process.exit(1)
  }
  await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: invoiceUploadStep.id, toStepId: inserted.id })
  await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: inserted.id, toStepId: designInitiationStep.id })
  console.log('  rewired edges: invoice_upload -> invoice_timeline -> design_initiation')

  const allProjects = await db.select().from(projects)
  for (const p of allProjects) {
    if (p.currentStep >= boundary) {
      await db.update(projects).set({ currentStep: p.currentStep + SHIFT, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${p.currentStep + SHIFT}`)
    }
  }

  const allDeadlines = await db.select().from(projectStepDeadlines).where(gte(projectStepDeadlines.stepN, boundary))
  for (const d of allDeadlines.sort((a, b) => b.stepN - a.stepN)) {
    await db.update(projectStepDeadlines).set({ stepN: d.stepN + SHIFT }).where(eq(projectStepDeadlines.id, d.id))
  }
  console.log(`  shifted ${allDeadlines.length} project_step_deadlines row(s)`)

  const allCompletions = await db.select().from(projectStepCompletions)
  const completionsToShift = allCompletions.filter((c) => c.stepN >= boundary)
  for (const c of completionsToShift) {
    await db.update(projectStepCompletions).set({ stepN: c.stepN + SHIFT }).where(eq(projectStepCompletions.id, c.id))
  }
  console.log(`  shifted ${completionsToShift.length} project_step_completions row(s)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
