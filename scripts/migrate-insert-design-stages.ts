/**
 * One-time, additive migration (v2.0, Phase 21 / STG-02..07): inserts 6 new
 * Design-team steps into the live graph, between "Payment Confirmation &
 * Timeline" (orderIndex 2) and "Confirmation" (orderIndex 3):
 *
 *   3. assign_designer_brief  (assignment, role=design, requiredPosition=head_designer,
 *                              targetRoles=[design, architect])
 *   4. kickoff_meeting        (yes_no_upload, role=design)
 *   5. design_meeting         (yes_no_upload, role=design)
 *   6. brief_taking           (yes_no_upload, role=design)
 *   7. design_initiation      (assignment, role=design, requiredPosition=head_designer,
 *                              targetRoles=[design, architect]) -- a SECOND, distinct
 *                              assignment moment, may pick a different person than
 *                              assign_designer_brief
 *   8. design_stage           (yes_no_upload, role=design)
 *
 * "Confirmation" (and everything after it) shifts down by 6 orderIndex
 * positions but is otherwise byte-for-byte unchanged, per the Phase 21 goal.
 *
 * UNLIKE db/seed-workflow-graph.ts, this script does NOT delete and recreate
 * definitions — every existing step definition keeps its same id (only
 * orderIndex changes in place), because real projects already reference
 * these steps and re-creating them would orphan any FK. This mirrors the
 * same care scripts/migrate-insert-payment-confirmation-step.ts took.
 *
 * Idempotent: if 'assign_designer_brief' already exists in graph='live',
 * exits without making any changes.
 *
 * Run via: npx tsx scripts/migrate-insert-design-stages.ts
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
const SHIFT = 6

type NewStep = {
  stepKey: string
  label: string
  role: 'design'
  fulfillmentKind: 'assignment' | 'yes_no_upload'
  requiredPosition?: string
  targetRoles?: ('design' | 'architect')[]
}

const NEW_STEPS: NewStep[] = [
  {
    stepKey: 'assign_designer_brief',
    label: 'Assign Designer/Architect for Brief',
    role: 'design',
    fulfillmentKind: 'assignment',
    requiredPosition: 'head_designer',
    targetRoles: ['design', 'architect'],
  },
  { stepKey: 'kickoff_meeting', label: 'Kickoff Meeting', role: 'design', fulfillmentKind: 'yes_no_upload' },
  { stepKey: 'design_meeting', label: 'Design Meeting', role: 'design', fulfillmentKind: 'yes_no_upload' },
  { stepKey: 'brief_taking', label: 'Brief Taking', role: 'design', fulfillmentKind: 'yes_no_upload' },
  {
    stepKey: 'design_initiation',
    label: 'Design Initiation',
    role: 'design',
    fulfillmentKind: 'assignment',
    requiredPosition: 'head_designer',
    targetRoles: ['design', 'architect'],
  },
  { stepKey: 'design_stage', label: 'Design Stage', role: 'design', fulfillmentKind: 'yes_no_upload' },
]

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'assign_designer_brief')))
    .limit(1)
  if (existing) {
    console.log('assign_designer_brief already exists in graph=live — nothing to do.')
    return
  }

  // ── Pre-flight: locate the two anchor steps ──────────────────────────
  const [paymentStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'payment_confirmation')))
    .limit(1)
  const [confirmationStep] = await db
    .select()
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'confirmation')))
    .limit(1)
  if (!paymentStep || !confirmationStep) {
    console.error('REFUSING TO RUN: could not find payment_confirmation and/or confirmation steps in graph=live.')
    process.exit(1)
  }

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── 1. Shift orderIndex >= confirmationStep.orderIndex by +SHIFT (same ids) ──
  const allSteps = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
    .orderBy(workflowStepDefinitions.orderIndex)
  const boundary = confirmationStep.orderIndex
  const toShift = allSteps.filter((s) => s.orderIndex >= boundary).sort((a, b) => b.orderIndex - a.orderIndex)
  for (const s of toShift) {
    await db
      .update(workflowStepDefinitions)
      .set({ orderIndex: s.orderIndex + SHIFT, updatedAt: new Date() })
      .where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  shifted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex + SHIFT}`)
  }

  // ── 2. Insert the 6 new steps at orderIndex boundary..boundary+5 ─────
  const insertedIds: string[] = []
  for (let i = 0; i < NEW_STEPS.length; i++) {
    const step = NEW_STEPS[i]
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: step.stepKey,
        label: step.label,
        role: step.role,
        fulfillmentKind: step.fulfillmentKind,
        requiredPosition: step.requiredPosition ?? null,
        targetRoles: step.targetRoles ?? null,
        isOptional: false,
        orderIndex: boundary + i,
      })
      .returning({ id: workflowStepDefinitions.id })
    insertedIds.push(inserted.id)
    console.log(`  + inserted "${step.stepKey}" (${inserted.id}) at orderIndex ${boundary + i}`)
  }

  // ── 3. Rewire edges: payment_confirmation -> confirmation becomes ────
  //      payment_confirmation -> assign_designer_brief -> ... -> design_stage -> confirmation
  const deleted = await db
    .delete(workflowStepEdges)
    .where(
      and(
        eq(workflowStepEdges.graph, GRAPH),
        eq(workflowStepEdges.fromStepId, paymentStep.id),
        eq(workflowStepEdges.toStepId, confirmationStep.id),
      ),
    )
    .returning({ id: workflowStepEdges.id })
  if (deleted.length !== 1) {
    console.error(
      `REFUSING TO CONTINUE: expected to delete exactly 1 edge (payment_confirmation->confirmation), deleted ${deleted.length}.`,
    )
    process.exit(1)
  }
  const chain = [paymentStep.id, ...insertedIds, confirmationStep.id]
  for (let i = 0; i < chain.length - 1; i++) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: chain[i], toStepId: chain[i + 1] })
  }
  console.log('  rewired edges: payment_confirmation -> [6 new design steps] -> confirmation')

  // ── 4. Shift projects.currentStep >= boundary by +SHIFT ──────────────
  const allProjects = await db.select().from(projects)
  for (const p of allProjects) {
    if (p.currentStep >= boundary) {
      await db
        .update(projects)
        .set({ currentStep: p.currentStep + SHIFT, updatedAt: new Date() })
        .where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${p.currentStep + SHIFT}`)
    }
  }

  // ── 5. Shift project_step_deadlines.stepN >= boundary by +SHIFT ──────
  const allDeadlines = await db.select().from(projectStepDeadlines).where(gte(projectStepDeadlines.stepN, boundary))
  for (const d of allDeadlines.sort((a, b) => b.stepN - a.stepN)) {
    await db.update(projectStepDeadlines).set({ stepN: d.stepN + SHIFT }).where(eq(projectStepDeadlines.id, d.id))
  }
  console.log(`  shifted ${allDeadlines.length} project_step_deadlines row(s)`)

  // ── 6. Shift project_step_completions.stepN >= boundary by +SHIFT (audit only) ──
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
