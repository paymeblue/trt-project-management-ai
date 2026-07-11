/**
 * One-time, additive migration (v2.0 Phase 22e, ad hoc, 2026-07-11): merges
 * the live graph's only parallel branch/join —
 *
 *   factory_manager_readiness
 *     |- materials_readiness  (factory_pm, readiness, slug=null)
 *     |- delivery_readiness   (site_pm, checklist, slug=delivery_site_readiness)
 *     both -> delivery_project_check
 *
 * — into ONE dual-confirmation step:
 *
 *   factory_manager_readiness -> materials_readiness -> delivery_project_check
 *
 * SURVIVOR: `materials_readiness` (id preserved). Set dualRoles=[factory_pm,
 * site_pm] and checklistSlug='delivery_site_readiness' on it — this matches
 * stepHref() in lib/workflow.ts: a dualRoles 'readiness' step routes
 * factory_pm to the rich /factory-pm/readiness form and any OTHER dualRole
 * (site_pm) to /checklists/<slug>. Both roles must independently confirm via
 * confirmDualRoleStep (actions/workflow.ts) before the step advances.
 *
 * REMOVED: `delivery_readiness` — its site_pm branch now lives ON the
 * survivor via dualRoles, not as a separate step. Any project_step_completions
 * rows keyed to its stepDefId are reattributed to the survivor's id BEFORE
 * deletion so no audit row is orphaned (none existed as of the pre-flight
 * re-inspection this script ran against, but this is handled generally in
 * case the live data has changed by the time this runs again elsewhere).
 *
 * receiverRole — FLAGGED, deliberately NOT touched by this migration. A
 * live re-inspection immediately before writing this script confirmed the
 * ONLY approval-kind step in the live graph is still `send_for_production`
 * (operations sends, requiredPosition=head_of_operations,
 * receiverRequiredPosition=chief_production_officer) — there is no
 * factory_pm-sends/site_pm-receives approval step to attach a receiverRole
 * to. receiverRole ships via the Configurator UI only (see
 * app/_components/workflow-configurator-shared.tsx +
 * actions/workflow-config.ts), for future use once such a step exists.
 *
 * Every step after the removed delivery_readiness shifts orderIndex down by
 * 1 (delivery_project_check 19->18, approval_installation 20->19,
 * installation_readiness 21->20, sorting 22->21, close_out 23->22,
 * sign_off 24->23), same-ids throughout — never a delete+recreate reseed.
 * projects.currentStep / project_step_deadlines.stepN /
 * project_step_completions.stepN are remapped accordingly (old raw integer
 * -> stepKey -> new orderIndex, same pattern as
 * scripts/migrate-v2-production-pipeline.ts, including its 2-phase
 * negative-temp-offset trick for the deadlines unique constraint). Any
 * project/deadline/completion that was sitting AT delivery_readiness's old
 * orderIndex remaps onto materials_readiness's (unchanged) orderIndex 17,
 * since that's the step that now covers both roles.
 *
 * Idempotent: if materials_readiness's dualRoles already includes 'site_pm'
 * (i.e. the merge already ran), exits without making any changes.
 *
 * Run via: npx tsx scripts/migrate-merge-readiness-dualroles.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq } from 'drizzle-orm'
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
const SURVIVOR_KEY = 'materials_readiness'
const REMOVED_KEY = 'delivery_readiness'
const REMOVED_SLUG = 'delivery_site_readiness'

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const [survivorCheck] = await db
    .select({ id: workflowStepDefinitions.id, dualRoles: workflowStepDefinitions.dualRoles })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, SURVIVOR_KEY)))
    .limit(1)
  if (survivorCheck?.dualRoles?.includes('site_pm')) {
    console.log(`"${SURVIVOR_KEY}" already has dualRoles including site_pm — already migrated, nothing to do.`)
    return
  }

  // ── Pre-flight: re-verify the live shape matches what this script expects ──
  const allSteps = await db
    .select()
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
    .orderBy(workflowStepDefinitions.orderIndex)
  const byKey = new Map(allSteps.map((s) => [s.stepKey, s]))

  const survivor = byKey.get(SURVIVOR_KEY)
  const removed = byKey.get(REMOVED_KEY)
  if (!survivor || !removed) {
    console.error(
      `REFUSING TO RUN: expected both "${SURVIVOR_KEY}" and "${REMOVED_KEY}" in graph=live — found survivor=${!!survivor}, removed=${!!removed}. Live graph shape differs from what this migration expects; reconcile before proceeding.`,
    )
    process.exit(1)
  }
  if (removed.orderIndex !== survivor.orderIndex + 1) {
    console.error(
      `REFUSING TO RUN: expected "${REMOVED_KEY}" (orderIndex ${removed.orderIndex}) to immediately follow "${SURVIVOR_KEY}" (orderIndex ${survivor.orderIndex}) — live graph shape differs from planning. Reconcile before proceeding.`,
    )
    process.exit(1)
  }

  // Confirm the fan-out/join edges this migration expects to rewire exist.
  const allEdges = await db.select().from(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  const findEdge = (fromId: string, toId: string) => allEdges.find((e) => e.fromStepId === fromId && e.toStepId === toId)

  const predecessorEdges = allEdges.filter((e) => e.toStepId === survivor.id || e.toStepId === removed.id)
  const commonPredecessors = [...new Set(predecessorEdges.map((e) => e.fromStepId))]
  if (commonPredecessors.length !== 1) {
    console.error(
      `REFUSING TO RUN: expected exactly 1 common predecessor feeding both "${SURVIVOR_KEY}" and "${REMOVED_KEY}", found ${commonPredecessors.length}. Reconcile before proceeding.`,
    )
    process.exit(1)
  }
  const predecessorId = commonPredecessors[0]

  const successorEdgesSurvivor = allEdges.filter((e) => e.fromStepId === survivor.id)
  const successorEdgesRemoved = allEdges.filter((e) => e.fromStepId === removed.id)
  if (successorEdgesSurvivor.length !== 1 || successorEdgesRemoved.length !== 1 || successorEdgesSurvivor[0].toStepId !== successorEdgesRemoved[0].toStepId) {
    console.error(
      `REFUSING TO RUN: expected both "${SURVIVOR_KEY}" and "${REMOVED_KEY}" to join on exactly one common successor. Reconcile before proceeding.`,
    )
    process.exit(1)
  }
  const successorId = successorEdgesSurvivor[0].toStepId

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── 1. Reattribute any project_step_completions keyed to the removed
  //      step's stepDefId to the survivor's id BEFORE deleting it, so no
  //      audit row is orphaned. ───────────────────────────────────────────
  const reattributed = await db
    .update(projectStepCompletions)
    .set({ stepDefId: survivor.id })
    .where(eq(projectStepCompletions.stepDefId, removed.id))
    .returning({ id: projectStepCompletions.id })
  console.log(`  reattributed ${reattributed.length} project_step_completions row(s) from "${REMOVED_KEY}" to "${SURVIVOR_KEY}"`)

  // ── 2. Set dualRoles + checklistSlug on the survivor (same id) ───────
  await db
    .update(workflowStepDefinitions)
    .set({ dualRoles: ['factory_pm', 'site_pm'], checklistSlug: REMOVED_SLUG, updatedAt: new Date() })
    .where(eq(workflowStepDefinitions.id, survivor.id))
  console.log(`  set dualRoles=[factory_pm, site_pm] + checklistSlug='${REMOVED_SLUG}' on "${SURVIVOR_KEY}"`)

  // ── 3. Rewire edges into a linear chain: predecessor -> survivor -> successor ──
  const deletedEdges = await db
    .delete(workflowStepEdges)
    .where(and(eq(workflowStepEdges.graph, GRAPH), eq(workflowStepEdges.toStepId, removed.id)))
    .returning({ id: workflowStepEdges.id })
  console.log(`  deleted ${deletedEdges.length} edge(s) into "${REMOVED_KEY}"`)

  const deletedRemovedOutEdges = await db
    .delete(workflowStepEdges)
    .where(and(eq(workflowStepEdges.graph, GRAPH), eq(workflowStepEdges.fromStepId, removed.id)))
    .returning({ id: workflowStepEdges.id })
  console.log(`  deleted ${deletedRemovedOutEdges.length} edge(s) out of "${REMOVED_KEY}"`)

  if (!findEdge(predecessorId, survivor.id)) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: predecessorId, toStepId: survivor.id })
    console.log(`  ensured edge predecessor -> "${SURVIVOR_KEY}"`)
  } else {
    console.log(`  edge predecessor -> "${SURVIVOR_KEY}" already present`)
  }
  if (!findEdge(survivor.id, successorId)) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: survivor.id, toStepId: successorId })
    console.log(`  ensured edge "${SURVIVOR_KEY}" -> successor`)
  } else {
    console.log(`  edge "${SURVIVOR_KEY}" -> successor already present`)
  }

  // ── 4. Delete the removed step definition (same-ids everywhere else) ──
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.id, removed.id))
  console.log(`  deleted step definition "${REMOVED_KEY}"`)

  // ── 5. Shift orderIndex of every step after the removed one down by 1 ──
  const toShift = allSteps
    .filter((s) => s.id !== removed.id && s.orderIndex > removed.orderIndex)
    .sort((a, b) => a.orderIndex - b.orderIndex)
  for (const s of toShift) {
    await db
      .update(workflowStepDefinitions)
      .set({ orderIndex: s.orderIndex - 1, updatedAt: new Date() })
      .where(eq(workflowStepDefinitions.id, s.id))
    console.log(`  shifted "${s.stepKey}": orderIndex ${s.orderIndex} -> ${s.orderIndex - 1}`)
  }

  // Build the canonical old-orderIndex -> new-orderIndex remap, including the
  // degenerate case of a project/deadline/completion sitting exactly at the
  // removed step's old orderIndex (site_pm's half of the merged step) — those
  // land on the survivor's (unchanged) orderIndex.
  const oldLast = allSteps.length ? Math.max(...allSteps.map((s) => s.orderIndex)) : 0
  const newOrderForOld = (oldOrder: number): number | undefined => {
    if (oldOrder === removed.orderIndex) return survivor.orderIndex
    if (oldOrder < removed.orderIndex) return oldOrder
    if (oldOrder > removed.orderIndex && oldOrder <= oldLast) return oldOrder - 1
    return undefined // beyond the last step (e.g. "project complete" sentinel) — left unchanged below
  }

  // ── 6. Remap projects.currentStep ─────────────────────────────────────
  const allProjects = await db.select().from(projects)
  for (const p of allProjects) {
    if (p.currentStep > oldLast) continue // sentinel "beyond last step" — unaffected by a mid-graph merge
    const newStep = newOrderForOld(p.currentStep)
    if (newStep !== undefined && newStep !== p.currentStep) {
      await db.update(projects).set({ currentStep: newStep, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${newStep}`)
    }
  }

  // ── 7. Remap project_step_deadlines.stepN — 2-phase negative-temp-offset
  //      to dodge the (projectId, stepN) unique constraint during transition ──
  const allDeadlines = await db.select().from(projectStepDeadlines)
  const deadlinesToFix = allDeadlines
    .map((d) => ({ row: d, newStepN: newOrderForOld(d.stepN) }))
    .filter((x): x is { row: typeof allDeadlines[number]; newStepN: number } => x.newStepN !== undefined && x.newStepN !== x.row.stepN)
  for (const { row } of deadlinesToFix) {
    await db.update(projectStepDeadlines).set({ stepN: -row.stepN }).where(eq(projectStepDeadlines.id, row.id))
  }
  for (const { row, newStepN } of deadlinesToFix) {
    await db.update(projectStepDeadlines).set({ stepN: newStepN }).where(eq(projectStepDeadlines.id, row.id))
  }
  console.log(`  remapped ${deadlinesToFix.length} project_step_deadlines row(s)`)

  // ── 8. Remap project_step_completions.stepN (audit trail, best-effort) ──
  const allCompletions = await db.select().from(projectStepCompletions)
  let completionsRemapped = 0
  for (const c of allCompletions) {
    const newStepN = newOrderForOld(c.stepN)
    if (newStepN !== undefined && newStepN !== c.stepN) {
      await db.update(projectStepCompletions).set({ stepN: newStepN }).where(eq(projectStepCompletions.id, c.id))
      completionsRemapped++
    }
  }
  console.log(`  remapped ${completionsRemapped} project_step_completions row(s)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
