/**
 * One-time, idempotent, transactional-in-spirit live migration (quick task
 * 260714-qe4 — workflow graph restructure batch 2, see
 * .planning/notes/2026-07-14-workflow-restructure-batch2.md, the
 * ambiguity-resolved authoritative spec). Un-merges the old "Invoice &
 * Delivery Timeline" step into two ownership-correct steps, converts the
 * old ops_design_confirmation into a Head-of-Projects site-PM assignment,
 * relocates the site confirmation checklist, removes installation_readiness,
 * folds sorting+close_out into one Installation Process checklist, and
 * converts sign_off into a site_pm upload step. Live graph: 22 -> 21 steps.
 *
 * Mirrors the id-preserving in-place style of
 * scripts/migrate-insert-payment-confirmation-step.ts — every SURVIVING step
 * definition keeps its id (only orderIndex/role/label/kind/etc. change in
 * place); only genuinely new/removed steps are inserted/deleted. Real
 * projects already reference these ids via project_step_completions and
 * workflow_step_states, so re-creating a surviving definition would orphan
 * those rows.
 *
 * NOTE on "transactional": the neon-http driver's db.transaction() THROWS
 * ("No transactions support...") — see actions/positions.ts's identical
 * caveat. This script cannot wrap its writes in a real SQL transaction; it
 * follows the same sequential-but-carefully-ordered precedent as every other
 * live migration in this codebase (see migrate-insert-payment-confirmation-
 * step.ts, migrate-merge-readiness-dualroles.ts). Ordering is chosen so a
 * failure partway through leaves the graph in a recoverable state (edges are
 * fully rebuilt at the end from a freshly-read id map, not incrementally
 * patched), and the idempotency guard makes a full re-run after a partial
 * failure safe.
 *
 * Run via: npx tsx scripts/migrate-workflow-restructure-batch2.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, inArray } from 'drizzle-orm'
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
  positions,
} = schema

const GRAPH = 'live'

// The exact TARGET order (21 keys) — see 260714-qe4-PLAN.md's <interfaces>
// TARGET live graph. Index in this array (1-based) IS the new orderIndex.
const TARGET_ORDER = [
  'new_project',
  'assign_designer_brief',
  'brief_taking',
  'invoice_upload',
  'set_delivery_timeline',
  'design_initiation',
  'kickoff_meeting',
  'design_stage',
  'ops_design_confirmation',
  'confirmation',
  'confirmation_correction',
  'internal_approval',
  'send_for_production',
  'project_review_authorisation',
  'production_process',
  'factory_manager_readiness',
  'materials_readiness',
  'delivery_project_check',
  'approval_installation',
  'installation_process',
  'sign_off',
] as const

// Keys removed outright (no successor row keeps their id).
const DELETED_KEYS = new Set(['installation_readiness', 'close_out'])
// The split boundary — landing here is refused per the plan's explicit
// pre-flight rule, even though the key itself survives at the same
// orderIndex (4), because the step's OWNERSHIP/label/kind change underneath
// an in-flight actor.
const SPLIT_BOUNDARY_KEY = 'invoice_upload'
async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'set_delivery_timeline')))
    .limit(1)
  if (existing) {
    console.log('set_delivery_timeline already exists in graph=live — nothing to do (idempotent no-op).')
    return
  }

  // ── Load current definitions ────────────────────────────────────────
  const allSteps = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
    .orderBy(workflowStepDefinitions.orderIndex)

  const byKey = new Map(allSteps.map((s) => [s.stepKey, s]))
  const oldOrderToKey = new Map(allSteps.map((s) => [s.orderIndex, s.stepKey]))
  const oldLastOrderIndex = allSteps.length ? Math.max(...allSteps.map((s) => s.orderIndex)) : 0

  const requiredOldKeys = [
    'new_project',
    'assign_designer_brief',
    'brief_taking',
    'invoice_upload',
    'design_initiation',
    'kickoff_meeting',
    'design_stage',
    'ops_design_confirmation',
    'confirmation_correction',
    'internal_approval',
    'send_for_production',
    'project_review_authorisation',
    'production_process',
    'confirmation',
    'factory_manager_readiness',
    'materials_readiness',
    'delivery_project_check',
    'approval_installation',
    'installation_readiness',
    'sorting',
    'close_out',
    'sign_off',
  ]
  const missing = requiredOldKeys.filter((k) => !byKey.has(k))
  if (missing.length > 0) {
    console.error(`REFUSING TO RUN: expected pre-restructure keys missing from graph=live: ${missing.join(', ')}`)
    process.exit(1)
  }

  // Build the OLD-key -> NEW-orderIndex map for every surviving key
  // (deleted keys are intentionally absent).
  const keyToNewOrder = new Map<string, number>()
  TARGET_ORDER.forEach((key, i) => keyToNewOrder.set(key, i + 1))
  // 'sorting' is the pre-migration key that becomes 'installation_process'.
  keyToNewOrder.set('sorting', keyToNewOrder.get('installation_process')!)

  const oldStepNToNewStepN = new Map<number, number>()
  for (const [orderIndex, key] of oldOrderToKey.entries()) {
    if (DELETED_KEYS.has(key)) continue // left as-is, audit trail
    const newN = keyToNewOrder.get(key)
    if (newN) oldStepNToNewStepN.set(orderIndex, newN)
  }

  // ── Pre-flight remap safety guard (CRITICAL) ────────────────────────
  const allProjects = await db.select({ id: projects.id, name: projects.name, currentStep: projects.currentStep }).from(projects)
  const unsafe: string[] = []
  for (const p of allProjects) {
    if (p.currentStep > oldLastOrderIndex) continue // already past the old graph (delivered) — sentinel handled below, always safe
    const oldKey = oldOrderToKey.get(p.currentStep)
    if (!oldKey) continue // no live step at this index (shouldn't happen given the guard above, but never unsafe if unresolvable-to-nothing)
    if (DELETED_KEYS.has(oldKey) || oldKey === SPLIT_BOUNDARY_KEY) {
      unsafe.push(`In-flight project ${p.id} ("${p.name}") sits on step "${oldKey}" (currentStep=${p.currentStep}), which cannot be safely remapped; finish or reset it, then re-run.`)
    }
  }
  if (unsafe.length > 0) {
    console.error('REFUSING TO RUN — pre-flight abort guard fired:')
    for (const msg of unsafe) console.error(`  ${msg}`)
    process.exit(1)
  }
  console.log(`Pre-flight OK — ${allProjects.length} project(s) checked, all remap cleanly (or are already delivered).`)

  // ── 1. Seed positions: head_of_projects ─────────────────────────────
  await db.insert(positions).values({ slug: 'head_of_projects', label: 'Head of Projects' }).onConflictDoNothing()
  console.log('  positions: head_of_projects / "Head of Projects" present (seeded if missing)')

  // ── 2. Delete all live edges (rebuilt as a strict linear chain at the end) ──
  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  console.log('  cleared all graph=live workflow_step_edges (will be rebuilt as a linear TARGET chain)')

  // ── 3. Remove installation_readiness + close_out (id-destroying) ────
  // NULL out any completions' stepDefId that reference these ids FIRST — the
  // FK is onDelete:'cascade', so leaving stepDefId set would silently
  // destroy the audit trail on delete (T-qe4-04 requires it survive,
  // matching the stepDefId=null precedent from Phase 17-01).
  for (const key of DELETED_KEYS) {
    const def = byKey.get(key)!
    const nulled = await db
      .update(projectStepCompletions)
      .set({ stepDefId: null })
      .where(eq(projectStepCompletions.stepDefId, def.id))
      .returning({ id: projectStepCompletions.id })
    if (nulled.length) console.log(`  nulled stepDefId on ${nulled.length} project_step_completions row(s) for removed "${key}" (audit trail preserved via stepKey/stepN)`)
    await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, def.id))
    console.log(`  deleted step definition "${key}"`)
  }

  // ── 4. Step 4 invoice_upload -> customer_care "Invoicing" ───────────
  const invoiceUpload = byKey.get('invoice_upload')!
  await db
    .update(workflowStepDefinitions)
    .set({ role: 'customer_care', label: 'Invoicing', additionalKinds: ['payment_confirmation'], updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, invoiceUpload.id))
  console.log('  updated "invoice_upload": role -> customer_care, label -> "Invoicing", additionalKinds [timeline_setting] -> [payment_confirmation] (2/2 client-paid phase REQUIRED for completion)')

  // ── 5. Insert new set_delivery_timeline step ─────────────────────────
  // fulfillmentKind='timeline_setting' — the exact kind the old merged
  // invoice_upload row used as its part-2 additionalKind; investigated live
  // (see invoice_upload.additionalKinds above) to match. requiredPosition
  // left null per the note (role=operations, no position narrowing).
  const [insertedTimeline] = await db
    .insert(workflowStepDefinitions)
    .values({
      graph: GRAPH,
      stepKey: 'set_delivery_timeline',
      label: 'Set Delivery Timeline',
      role: 'operations',
      fulfillmentKind: 'timeline_setting',
      isOptional: false,
      orderIndex: keyToNewOrder.get('set_delivery_timeline')!,
    })
    .returning({ id: workflowStepDefinitions.id })
  console.log(`  + inserted "set_delivery_timeline" (${insertedTimeline.id})`)

  // ── 6. ops_design_confirmation -> Assign Site PM for Site Confirmation ──
  const opsDesignConfirmation = byKey.get('ops_design_confirmation')!
  await db
    .update(workflowStepDefinitions)
    .set({
      role: 'super_admin',
      requiredPosition: 'head_of_projects',
      fulfillmentKind: 'assignment',
      targetRoles: ['site_pm'],
      label: 'Assign Site PM for Site Confirmation',
      additionalKinds: null,
      updatedAt: new Date(),
    })
    .where(eq(workflowStepDefinitions.id, opsDesignConfirmation.id))
  console.log('  updated "ops_design_confirmation": role -> super_admin, requiredPosition -> head_of_projects, kind -> assignment, targetRoles -> [site_pm]')

  // ── 7. confirmation MOVES (id preserved — orderIndex handled in the ────
  //      final normalize pass below; no field change needed here).

  // ── 8. sorting + close_out -> ONE "Installation Process" step ───────
  // close_out was already deleted (step 3 above). Rename the surviving
  // 'sorting' row in place (id preserved).
  const sortingRow = byKey.get('sorting')!
  await db
    .update(workflowStepDefinitions)
    .set({ stepKey: 'installation_process', label: 'Installation Process', checklistSlug: 'installation_process', updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, sortingRow.id))
  console.log('  renamed "sorting" -> "installation_process" (id preserved; close_out removed, merged into this checklist)')

  // ── 9. sign_off -> site_pm yes_no_upload (was super_admin ack) ──────
  const signOff = byKey.get('sign_off')!
  await db
    .update(workflowStepDefinitions)
    .set({ role: 'site_pm', fulfillmentKind: 'yes_no_upload', requiredPosition: null, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, signOff.id))
  console.log('  updated "sign_off": role -> site_pm, kind -> yes_no_upload (was super_admin ack)')

  // ── 10. Normalise orderIndex to contiguous 1..21 in TARGET order ────
  // orderIndex carries no unique constraint (see migrate-insert-payment-
  // confirmation-step.ts's comment) — direct assignment per key is safe,
  // no intermediate collisions possible.
  for (let i = 0; i < TARGET_ORDER.length; i++) {
    const key = TARGET_ORDER[i]
    await db
      .update(workflowStepDefinitions)
      .set({ orderIndex: i + 1, updatedAt: new Date() })
      .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, key)))
  }
  console.log(`  normalised orderIndex 1..${TARGET_ORDER.length} for the TARGET key order`)

  // ── 11. Rebuild edges as a strict linear chain over the TARGET order ─
  const finalSteps = await db
    .select({ id: workflowStepDefinitions.id, stepKey: workflowStepDefinitions.stepKey, orderIndex: workflowStepDefinitions.orderIndex })
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
    .orderBy(workflowStepDefinitions.orderIndex)
  if (finalSteps.length !== TARGET_ORDER.length) {
    console.error(`REFUSING TO CONTINUE: expected ${TARGET_ORDER.length} live steps after restructure, found ${finalSteps.length}.`)
    process.exit(1)
  }
  for (let i = 0; i < finalSteps.length - 1; i++) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: finalSteps[i].id, toStepId: finalSteps[i + 1].id })
  }
  console.log(`  rebuilt ${finalSteps.length - 1} edges as a strict linear chain: ${finalSteps.map((s) => s.stepKey).join(' -> ')}`)

  // Assert exactly one first step (no incoming edge) and one last step (no outgoing edge).
  const edgeRows = await db.select({ fromStepId: workflowStepEdges.fromStepId, toStepId: workflowStepEdges.toStepId }).from(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  const hasIncoming = new Set(edgeRows.map((e) => e.toStepId))
  const hasOutgoing = new Set(edgeRows.map((e) => e.fromStepId))
  const firstSteps = finalSteps.filter((s) => !hasIncoming.has(s.id))
  const lastSteps = finalSteps.filter((s) => !hasOutgoing.has(s.id))
  if (firstSteps.length !== 1 || lastSteps.length !== 1) {
    console.error(`REFUSING TO CONTINUE: expected exactly one first/last step, found first=${firstSteps.length} last=${lastSteps.length}.`)
    process.exit(1)
  }
  console.log(`  verified: exactly one first step ("${firstSteps[0].stepKey}") and one last step ("${lastSteps[0].stepKey}")`)

  // ── 12. In-flight remap: projects.currentStep ────────────────────────
  const NEW_LAST = TARGET_ORDER.length // 21
  for (const p of allProjects) {
    let newStep: number | undefined
    if (p.currentStep > oldLastOrderIndex) {
      // Already past the old graph (delivered sentinel, was 23) — shift the
      // sentinel down by 1 to stay "> NEW_LAST" (delivered) under the new count.
      newStep = p.currentStep - (oldLastOrderIndex + 1 - NEW_LAST)
    } else {
      newStep = oldStepNToNewStepN.get(p.currentStep)
    }
    if (newStep !== undefined && newStep !== p.currentStep) {
      await db.update(projects).set({ currentStep: newStep, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${newStep}`)
    }
  }

  // ── 13. Remap project_step_deadlines.stepN + project_step_completions.stepN ──
  // Temp-offset technique (shift to +10000 first, then to final) avoids any
  // transient collision with a (projectId, stepN) unique constraint, since
  // this is a genuine permutation (confirmation moves EARLIER), not a
  // uniform shift.
  //
  // FIRST: permanently relocate any rows still sitting at a DELETED key's
  // OLD stepN (installation_readiness=19, close_out=21) out of the live
  // 1..21 range — these are audit-trail rows left "as-is" (T-qe4-04), but
  // "as-is" collides with the TARGET graph's real steps 19 (approval_
  // installation) and 21 (sign_off), which now legitimately need those same
  // integers. A permanent +100000 offset keeps stepN as a stable historical
  // marker (still resolvable via stepKey text) without ever colliding with
  // a live step number again. Safe on both a fresh run (every row at 19/21
  // pre-migration IS, by definition, one of these two deleted keys) and a
  // resumed/partial run (no legitimate row ever targets 100000+).
  const PERMANENT_AUDIT_OFFSET = 100000
  for (const staleN of [19, 21]) {
    const staleDeadlines = await db.select().from(projectStepDeadlines).where(eq(projectStepDeadlines.stepN, staleN))
    for (const d of staleDeadlines) {
      await db.update(projectStepDeadlines).set({ stepN: staleN + PERMANENT_AUDIT_OFFSET }).where(eq(projectStepDeadlines.id, d.id))
    }
    const staleCompletions = await db.select().from(projectStepCompletions).where(eq(projectStepCompletions.stepN, staleN))
    for (const c of staleCompletions) {
      await db.update(projectStepCompletions).set({ stepN: staleN + PERMANENT_AUDIT_OFFSET }).where(eq(projectStepCompletions.id, c.id))
    }
    if (staleDeadlines.length || staleCompletions.length) {
      console.log(`  permanently relocated ${staleDeadlines.length} deadline(s) + ${staleCompletions.length} completion(s) off deleted-key stepN=${staleN} (audit trail preserved, now stepN=${staleN + PERMANENT_AUDIT_OFFSET})`)
    }
  }

  const TEMP_OFFSET = 10000
  const affectedOldStepNs = [...oldStepNToNewStepN.keys()]

  const deadlineRows = await db.select().from(projectStepDeadlines).where(inArray(projectStepDeadlines.stepN, affectedOldStepNs))
  for (const d of deadlineRows) {
    await db.update(projectStepDeadlines).set({ stepN: d.stepN + TEMP_OFFSET }).where(eq(projectStepDeadlines.id, d.id))
  }
  for (const d of deadlineRows) {
    const newN = oldStepNToNewStepN.get(d.stepN)!
    await db.update(projectStepDeadlines).set({ stepN: newN }).where(eq(projectStepDeadlines.id, d.id))
  }
  console.log(`  remapped ${deadlineRows.length} project_step_deadlines row(s)`)

  const completionRows = await db.select().from(projectStepCompletions).where(inArray(projectStepCompletions.stepN, affectedOldStepNs))
  for (const c of completionRows) {
    await db.update(projectStepCompletions).set({ stepN: c.stepN + TEMP_OFFSET }).where(eq(projectStepCompletions.id, c.id))
  }
  for (const c of completionRows) {
    const newN = oldStepNToNewStepN.get(c.stepN)!
    await db.update(projectStepCompletions).set({ stepN: newN }).where(eq(projectStepCompletions.id, c.id))
  }
  console.log(`  remapped ${completionRows.length} project_step_completions row(s)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
