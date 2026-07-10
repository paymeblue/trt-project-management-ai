/**
 * One-time migration (v2.0 Phase 22c, 2026-07-10): removes the
 * 'payment_confirmation' step entirely — per the user's original handwritten
 * process notes, step 1 (Customer Care creates the project) is directly
 * followed by step 2 (Design Head assigns Architect for the brief), with no
 * separate payment/approval step in between. Reconnects new_project ->
 * assign_designer_brief directly and compacts every subsequent step's
 * orderIndex down by 1 (no gap left at position 2).
 *
 * NOTE: project_step_completions rows for 'payment_confirmation' are
 * CASCADE-DELETED along with the step definition (FK
 * psc_step_def_id_fk ... onDelete: 'cascade') — this is a real, irreversible
 * loss of that historical audit-trail entry for any project that had already
 * completed it. Accepted here per explicit instruction to remove the step
 * completely.
 *
 * Idempotent: if 'payment_confirmation' no longer exists in graph='live',
 * exits without making any changes.
 *
 * Run via: npx tsx scripts/migrate-remove-payment-confirmation-step.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, gt } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges, projects, projectStepDeadlines, projectStepCompletions } = schema

const GRAPH = 'live'

async function main() {
  const [step] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'payment_confirmation')))
    .limit(1)
  if (!step) {
    console.log('payment_confirmation already removed from graph=live — nothing to do.')
    return
  }

  const boundary = step.orderIndex // 2
  console.log(`Pre-flight OK. Removing "payment_confirmation" (orderIndex ${boundary})...`)

  const edges = await db.select().from(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  const incoming = edges.filter((e) => e.toStepId === step.id).map((e) => e.fromStepId)
  const outgoing = edges.filter((e) => e.fromStepId === step.id).map((e) => e.toStepId)
  if (incoming.length !== 1 || outgoing.length !== 1) {
    console.error(`REFUSING TO CONTINUE: expected exactly 1 incoming + 1 outgoing edge, found ${incoming.length} in / ${outgoing.length} out.`)
    process.exit(1)
  }

  // ── 1. Any project stuck exactly on this step (currentStep === boundary)
  //      is already correctly positioned: its successor sits at
  //      orderIndex boundary+1 today and will be compacted down to
  //      `boundary` in step 3 below — so its currentStep needs no change at
  //      all, it'll be picked up by step 4's general `> boundary` shift...
  //      except `currentStep === boundary` is NOT `> boundary`, so it must
  //      be logged (informational only) but explicitly left alone here.
  const stuckProjects = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.currentStep, boundary))
  for (const p of stuckProjects) {
    console.log(`  project "${p.name}" was awaiting payment_confirmation -> now awaiting its successor (orderIndex stays ${boundary} after compaction)`)
  }

  // ── 2. Delete the step (cascades its project_step_completions rows) + reconnect ──
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, step.id))
  await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: incoming[0], toStepId: outgoing[0] })
  console.log(`  deleted step + edges; reconnected predecessor -> successor directly`)

  // ── 3. Compact orderIndex: every step > boundary shifts down by 1 ──────
  const remaining = await db.select().from(workflowStepDefinitions).where(and(eq(workflowStepDefinitions.graph, GRAPH), gt(workflowStepDefinitions.orderIndex, boundary))).orderBy(workflowStepDefinitions.orderIndex)
  for (const s of remaining) {
    await db.update(workflowStepDefinitions).set({ orderIndex: s.orderIndex - 1, updatedAt: new Date() }).where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  compacted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex - 1}`)
  }

  // ── 4. Compact projects.currentStep for everything > boundary ──────────
  const allProjects = await db.select({ id: projects.id, name: projects.name, currentStep: projects.currentStep }).from(projects)
  for (const p of allProjects) {
    if (p.currentStep > boundary) {
      await db.update(projects).set({ currentStep: p.currentStep - 1, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${p.currentStep - 1}`)
    }
  }

  // ── 5. Compact project_step_deadlines.stepN for everything > boundary ──
  const allDeadlines = await db.select().from(projectStepDeadlines)
  const deadlinesToShift = allDeadlines.filter((d) => d.stepN > boundary).sort((a, b) => a.stepN - b.stepN)
  for (const d of deadlinesToShift) {
    await db.update(projectStepDeadlines).set({ stepN: d.stepN - 1 }).where(eq(projectStepDeadlines.id, d.id))
  }
  console.log(`  compacted ${deadlinesToShift.length} project_step_deadlines row(s)`)

  // ── 6. Compact project_step_completions.stepN for everything > boundary ──
  const allCompletions = await db.select().from(projectStepCompletions)
  const completionsToShift = allCompletions.filter((c) => c.stepN > boundary)
  for (const c of completionsToShift) {
    await db.update(projectStepCompletions).set({ stepN: c.stepN - 1 }).where(eq(projectStepCompletions.id, c.id))
  }
  console.log(`  compacted ${completionsToShift.length} project_step_completions row(s)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
