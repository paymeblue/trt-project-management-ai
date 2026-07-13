/**
 * One-time, idempotent migration (v2.0 quick task 260713-rb2, 2026-07-13):
 * merges live steps 4 (Invoice Upload — mis-assigned to customer_care) and 5
 * (Set Delivery Timeline — operations/head_of_operations) into ONE
 * Operations-owned step at orderIndex 4, presented as a two-part wizard
 * (part 1 = upload invoice; part 2 = set delivery date + per-step deadlines)
 * that completes ONCE and advances the project straight to Design Initiation.
 *
 * Survivor is 'invoice_upload' (D-02): becomes role='operations',
 * fulfillmentKind='yes_no_upload', additionalKinds=['timeline_setting'],
 * requiredPosition=null (D-01 — role=operations already admits
 * operations-role users AND super_admins via isAdminRole; requiredPosition
 * is strict-equality for every role, so head_of_operations would wrongly
 * block a super_admin whose position isn't that exact slug).
 * 'invoice_timeline' is deleted; the graph compacts from 23 -> 22 steps.
 *
 * SAFETY (assumes zero in-flight projects — no currentStep/deadline/
 * completion remap is performed):
 *   1. Refuses to run if `projects` count !== 0.
 *   2. Idempotent: if 'invoice_timeline' no longer exists in graph='live',
 *      exits cleanly ("already merged — nothing to do").
 *   3. Edge deletes are exact-count-checked before proceeding (mirrors
 *      scripts/migrate-insert-invoice-timeline-step.ts's precedent).
 *
 * Does NOT import from `lib/` — talks to the DB directly, so no
 * server-only shim is required (that shim is only needed when a script
 * imports the engine).
 *
 * Run via: npx tsx scripts/migrate-merge-invoice-upload-timeline.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, gt } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges, projects } = schema

const GRAPH = 'live'
const MERGED_LABEL = 'Invoice & Delivery Timeline' // D-03: must be byte-identical everywhere

async function main() {
  // 1. SAFETY: refuse to run against a live DB with any in-flight projects.
  const allProjects = await db.select({ id: projects.id }).from(projects)
  if (allProjects.length !== 0) {
    console.error(
      `REFUSING TO RUN: expected 0 projects, found ${allProjects.length}. This migration does not remap currentStep/deadlines/completions.`,
    )
    process.exit(1)
  }

  // 2. IDEMPOTENCY: if invoice_timeline is already gone, nothing to do.
  const [existingTimeline] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_timeline')))
    .limit(1)
  if (!existingTimeline) {
    console.log('already merged — nothing to do.')
    return
  }

  // 3. Load by key.
  const [invoiceUploadStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_upload')))
    .limit(1)
  const [invoiceTimelineStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_timeline')))
    .limit(1)
  const [designInitiationStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'design_initiation')))
    .limit(1)
  if (!invoiceUploadStep || !invoiceTimelineStep || !designInitiationStep) {
    console.error(
      'REFUSING TO RUN: could not find invoice_upload and/or invoice_timeline and/or design_initiation in graph=live.',
    )
    process.exit(1)
  }

  console.log('Pre-flight OK. Proceeding with merge...')

  // 4. Update the survivor invoice_upload.
  await db
    .update(workflowStepDefinitions)
    .set({
      label: MERGED_LABEL,
      role: 'operations',
      fulfillmentKind: 'yes_no_upload',
      additionalKinds: ['timeline_setting'],
      requiredPosition: null,
      updatedAt: new Date(),
    })
    .where(eq(workflowStepDefinitions.id, invoiceUploadStep.id))
  console.log(
    `  updated "invoice_upload" (${invoiceUploadStep.id}): label="${MERGED_LABEL}", role=operations, fulfillmentKind=yes_no_upload, additionalKinds=[timeline_setting], requiredPosition=null`,
  )

  // 5. Rewire edges: delete invoice_upload->invoice_timeline and
  //    invoice_timeline->design_initiation (exact-count guard), then insert
  //    invoice_upload->design_initiation.
  const deleted1 = await db
    .delete(workflowStepEdges)
    .where(
      and(
        eq(workflowStepEdges.graph, GRAPH),
        eq(workflowStepEdges.fromStepId, invoiceUploadStep.id),
        eq(workflowStepEdges.toStepId, invoiceTimelineStep.id),
      ),
    )
    .returning({ id: workflowStepEdges.id })
  const deleted2 = await db
    .delete(workflowStepEdges)
    .where(
      and(
        eq(workflowStepEdges.graph, GRAPH),
        eq(workflowStepEdges.fromStepId, invoiceTimelineStep.id),
        eq(workflowStepEdges.toStepId, designInitiationStep.id),
      ),
    )
    .returning({ id: workflowStepEdges.id })
  const totalDeleted = deleted1.length + deleted2.length
  if (totalDeleted !== 2) {
    console.error(
      `REFUSING TO CONTINUE: expected to delete exactly 2 edges (invoice_upload->invoice_timeline, invoice_timeline->design_initiation), deleted ${totalDeleted}.`,
    )
    process.exit(1)
  }
  await db
    .insert(workflowStepEdges)
    .values({ graph: GRAPH, fromStepId: invoiceUploadStep.id, toStepId: designInitiationStep.id })
    .onConflictDoNothing()
  console.log('  rewired edges: invoice_upload -> design_initiation (invoice_timeline removed from the chain)')

  // 6. Delete the invoice_timeline step def. Delete any remaining edges that
  //    still reference its id first (defensive — the two edges above already
  //    covered its only incoming/outgoing edges in the linear live graph, but
  //    workflow_step_edges FK-references workflow_step_definitions, so a
  //    stray edge would otherwise block the delete).
  const strayEdges = await db
    .delete(workflowStepEdges)
    .where(eq(workflowStepEdges.fromStepId, invoiceTimelineStep.id))
    .returning({ id: workflowStepEdges.id })
  const strayEdges2 = await db
    .delete(workflowStepEdges)
    .where(eq(workflowStepEdges.toStepId, invoiceTimelineStep.id))
    .returning({ id: workflowStepEdges.id })
  if (strayEdges.length > 0 || strayEdges2.length > 0) {
    console.log(`  removed ${strayEdges.length + strayEdges2.length} stray edge(s) still referencing invoice_timeline`)
  }
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, invoiceTimelineStep.id))
  console.log(`  deleted "invoice_timeline" (${invoiceTimelineStep.id})`)

  // 7. COMPACT orderIndex: every step with orderIndex > 4 shifts down by 1,
  //    processed in ASCENDING order so no two rows collide during the update.
  const toCompact = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), gt(workflowStepDefinitions.orderIndex, 4)))
    .orderBy(workflowStepDefinitions.orderIndex)
  for (const s of toCompact) {
    await db
      .update(workflowStepDefinitions)
      .set({ orderIndex: s.orderIndex - 1, updatedAt: new Date() })
      .where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  shifted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex - 1}`)
  }

  // 8. Summary.
  const finalCount = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
  console.log(`Done. graph='live' now has ${finalCount.length} steps (expected 22).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
