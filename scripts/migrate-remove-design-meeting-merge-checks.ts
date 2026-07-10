/**
 * One-time migration (v2.0 Phase 22d, 2026-07-10): two structural edits in
 * one pass:
 *
 * 1. Remove 'design_meeting' (was step 8) entirely — kickoff_meeting ->
 *    design_stage directly. Design Stage (was 9) becomes step 8, everything
 *    after shifts down by 1.
 *
 * 2. Merge 'delivery_project' (factory_pm checklist, was step 20) and
 *    'project_check_report' (factory_pm checklist, was step 21) into ONE
 *    new step 'delivery_project_check' with a combined checklist (all 9
 *    items from both, in two sections). Predecessors become
 *    materials_readiness AND delivery_readiness (inherits
 *    project_check_report's join requirement); successor stays
 *    approval_installation.
 *
 * Both are applied as a single before->after orderIndex remap (existing
 * steps go straight to their final position; no intermediate state), same
 * pattern as scripts/migrate-v2-production-pipeline.ts.
 *
 * Idempotent: if 'design_meeting' no longer exists AND
 * 'delivery_project_check' already exists in graph='live', exits without
 * making any changes.
 *
 * Run via: npx tsx scripts/migrate-remove-design-meeting-merge-checks.ts
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
  workflowStepDefinitions, workflowStepEdges, projects, projectStepDeadlines,
  projectStepCompletions, checklistDefinitions, checklistTemplateItems, checklists,
} = schema

const GRAPH = 'live'

const MERGED_SLUG = 'delivery_project_check'
const MERGED_NAME = 'Delivery & Project Check'

type Item = { section: string; label: string; type: 'radio' | 'text'; responseOptions: 'yes_no' | 'yes_no_na' }
const MERGED_ITEMS: Item[] = [
  { section: 'Factory Dispatch', label: 'Has the production order been fully completed and quality-checked?', type: 'radio', responseOptions: 'yes_no_na' },
  { section: 'Factory Dispatch', label: 'Are all furniture pieces labelled with the correct project reference?', type: 'radio', responseOptions: 'yes_no_na' },
  { section: 'Factory Dispatch', label: 'Is the delivery vehicle loaded and sealed per the packing list?', type: 'radio', responseOptions: 'yes_no' },
  { section: 'Factory Dispatch', label: 'Have all fragile items been wrapped and protected for transit?', type: 'radio', responseOptions: 'yes_no_na' },
  { section: 'Factory Dispatch', label: 'Additional notes on factory dispatch', type: 'text', responseOptions: 'yes_no' },
  { section: 'Project Check', label: 'Have all delivered items been checked against the packing list?', type: 'radio', responseOptions: 'yes_no_na' },
  { section: 'Project Check', label: 'Were any items found damaged or missing on arrival?', type: 'radio', responseOptions: 'yes_no' },
  { section: 'Project Check', label: 'Do the delivered units match the approved specification?', type: 'radio', responseOptions: 'yes_no_na' },
  { section: 'Project Check', label: 'Summary of the project check', type: 'text', responseOptions: 'yes_no' },
]

async function main() {
  const designMeeting = await db.select().from(workflowStepDefinitions).where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'design_meeting')))
  const alreadyMerged = await db.select().from(workflowStepDefinitions).where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, MERGED_SLUG)))
  if (designMeeting.length === 0 && alreadyMerged.length > 0) {
    console.log('Already migrated — nothing to do.')
    return
  }

  const before = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH)).orderBy(workflowStepDefinitions.orderIndex)
  const byKey = new Map(before.map((s) => [s.stepKey, s]))
  for (const k of ['design_meeting', 'kickoff_meeting', 'design_stage', 'delivery_project', 'project_check_report', 'materials_readiness', 'delivery_readiness', 'approval_installation']) {
    if (!byKey.has(k)) {
      console.error(`REFUSING TO CONTINUE: expected step "${k}" not found in graph=live.`)
      process.exit(1)
    }
  }

  // ── Safety check: no live checklist instances reference the 2 checklists
  //    we're about to delete (should be zero — projects were already wiped).
  const oldDefs = await db.select().from(checklistDefinitions).where(inArray(checklistDefinitions.slug, ['delivery_project', 'project_check_report']))
  const oldDefIds = oldDefs.map((d) => d.id)
  if (oldDefIds.length > 0) {
    const liveInstances = await db.select({ id: checklists.id }).from(checklists).where(inArray(checklists.definitionId, oldDefIds))
    if (liveInstances.length > 0) {
      console.error(`REFUSING TO CONTINUE: ${liveInstances.length} checklist instance(s) still reference delivery_project/project_check_report — cannot delete those definitions.`)
      process.exit(1)
    }
  }

  // ── Build the FINAL step list, in order, from the current list minus the
  //    2 removed + 1 merged. ─────────────────────────────────────────────
  const finalKeys: string[] = []
  for (const s of before) {
    if (s.stepKey === 'design_meeting') continue
    if (s.stepKey === 'delivery_project') { finalKeys.push(MERGED_SLUG); continue }
    if (s.stepKey === 'project_check_report') continue // absorbed into MERGED_SLUG above
    finalKeys.push(s.stepKey)
  }
  const finalOrder = new Map(finalKeys.map((k, i) => [k, i + 1]))
  const oldOrderToKey = new Map(before.map((s) => [s.orderIndex, s.stepKey]))
  const oldLast = before.length ? Math.max(...before.map((s) => s.orderIndex)) : 0

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── 1. Move every SURVIVING existing step straight to its final orderIndex ──
  for (const s of before) {
    if (s.stepKey === 'design_meeting' || s.stepKey === 'delivery_project' || s.stepKey === 'project_check_report') continue
    const fo = finalOrder.get(s.stepKey)!
    if (s.orderIndex !== fo) {
      await db.update(workflowStepDefinitions).set({ orderIndex: fo, updatedAt: new Date() }).where(eq(workflowStepDefinitions.id, s.id))
    }
  }
  console.log('  repositioned surviving steps')

  // ── 2. Insert the merged step ────────────────────────────────────────
  const [merged] = await db
    .insert(workflowStepDefinitions)
    .values({
      graph: GRAPH,
      stepKey: MERGED_SLUG,
      label: MERGED_NAME,
      role: 'factory_pm',
      fulfillmentKind: 'checklist',
      checklistSlug: MERGED_SLUG,
      isOptional: false,
      orderIndex: finalOrder.get(MERGED_SLUG)!,
    })
    .returning({ id: workflowStepDefinitions.id })
  console.log(`  + inserted "${MERGED_SLUG}" at orderIndex ${finalOrder.get(MERGED_SLUG)}`)

  // ── 3. Delete the 2 removed step definitions (cascades their
  //      project_step_completions rows — fine, all projects were wiped) ──
  const designMeetingId = byKey.get('design_meeting')!.id
  const deliveryProjectId = byKey.get('delivery_project')!.id
  const projectCheckReportId = byKey.get('project_check_report')!.id
  await db.delete(workflowStepDefinitions).where(inArray(workflowStepDefinitions.id, [designMeetingId, deliveryProjectId, projectCheckReportId]))
  console.log('  deleted design_meeting, delivery_project, project_check_report')

  // ── 4. Rebuild ALL edges from scratch for correctness (small graph, cheap) ──
  const survivingIdByKey = new Map<string, string>()
  for (const s of before) {
    if (s.stepKey === 'design_meeting' || s.stepKey === 'delivery_project' || s.stepKey === 'project_check_report') continue
    survivingIdByKey.set(s.stepKey, s.id)
  }
  survivingIdByKey.set(MERGED_SLUG, merged.id)

  const finalStepsInOrder = [...finalOrder.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k)
  const branchKeys = new Set(['materials_readiness', 'delivery_readiness', MERGED_SLUG])
  const linearKeys = finalStepsInOrder.filter((k) => !branchKeys.has(k))

  const edgePairs: [string, string][] = []
  for (let i = 0; i < linearKeys.length; i++) {
    const from = linearKeys[i]
    if (from === 'factory_manager_readiness') break
    edgePairs.push([from, linearKeys[i + 1]])
  }
  edgePairs.push(['factory_manager_readiness', 'materials_readiness'])
  edgePairs.push(['factory_manager_readiness', 'delivery_readiness'])
  edgePairs.push(['materials_readiness', MERGED_SLUG])
  edgePairs.push(['delivery_readiness', MERGED_SLUG])
  edgePairs.push([MERGED_SLUG, 'approval_installation'])
  const tailStart = linearKeys.indexOf('approval_installation')
  for (let i = tailStart; i < linearKeys.length - 1; i++) edgePairs.push([linearKeys[i], linearKeys[i + 1]])

  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  for (const [from, to] of edgePairs) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: survivingIdByKey.get(from)!, toStepId: survivingIdByKey.get(to)! })
  }
  console.log(`  rebuilt ${edgePairs.length} edges`)

  // ── 5. Remap projects.currentStep, deadlines, completions (all should be
  //      empty right now since projects were wiped, but handle generically) ──
  const allProjects = await db.select({ id: projects.id, name: projects.name, currentStep: projects.currentStep }).from(projects)
  for (const p of allProjects) {
    let newStep: number
    if (p.currentStep > oldLast) {
      newStep = finalStepsInOrder.length + 1
    } else {
      const key = oldOrderToKey.get(p.currentStep)
      if (!key || key === 'design_meeting') {
        newStep = finalOrder.get('design_stage')! // design_meeting's successor
      } else if (key === 'delivery_project' || key === 'project_check_report') {
        newStep = finalOrder.get(MERGED_SLUG)!
      } else if (key) {
        newStep = finalOrder.get(key)!
      } else {
        continue
      }
    }
    if (newStep !== p.currentStep) {
      await db.update(projects).set({ currentStep: newStep, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${newStep}`)
    }
  }

  const allDeadlines = await db.select().from(projectStepDeadlines)
  for (const d of allDeadlines) {
    const key = oldOrderToKey.get(d.stepN)
    if (!key) continue
    const newStepN = key === 'design_meeting' ? finalOrder.get('design_stage')! : key === 'delivery_project' || key === 'project_check_report' ? finalOrder.get(MERGED_SLUG)! : finalOrder.get(key)
    if (newStepN !== undefined && newStepN !== d.stepN) {
      await db.update(projectStepDeadlines).set({ stepN: newStepN }).where(eq(projectStepDeadlines.id, d.id))
    }
  }

  const allCompletions = await db.select().from(projectStepCompletions)
  for (const c of allCompletions) {
    const key = oldOrderToKey.get(c.stepN)
    if (!key) continue
    const newStepN = key === 'design_meeting' ? finalOrder.get('design_stage')! : key === 'delivery_project' || key === 'project_check_report' ? finalOrder.get(MERGED_SLUG)! : finalOrder.get(key)
    if (newStepN !== undefined && newStepN !== c.stepN) {
      await db.update(projectStepCompletions).set({ stepN: newStepN }).where(eq(projectStepCompletions.id, c.id))
    }
  }
  console.log('  remapped projects/deadlines/completions (should be no-ops on a wiped DB)')

  // ── 6. Delete the 2 old checklist definitions (items first, no cascade) ──
  if (oldDefIds.length > 0) {
    await db.delete(checklistTemplateItems).where(inArray(checklistTemplateItems.definitionId, oldDefIds))
    await db.delete(checklistDefinitions).where(inArray(checklistDefinitions.id, oldDefIds))
    console.log('  removed old delivery_project/project_check_report checklist definitions')
  }

  // ── 7. Seed the merged checklist ────────────────────────────────────────
  const [def] = await db.insert(checklistDefinitions).values({ slug: MERGED_SLUG, name: MERGED_NAME, targetRole: 'factory_pm', isActive: true }).returning({ id: checklistDefinitions.id })
  for (let i = 0; i < MERGED_ITEMS.length; i++) {
    const item = MERGED_ITEMS[i]
    await db.insert(checklistTemplateItems).values({
      definitionId: def.id,
      step: 1,
      sectionTitle: item.section,
      sortOrder: i + 1,
      label: item.label,
      itemType: item.type,
      responseOptions: item.responseOptions,
      isPhotoAllowed: true,
      isPhotoRequired: false,
      isActive: true,
    })
  }
  console.log(`  seeded merged checklist "${MERGED_NAME}" (${MERGED_SLUG}) — ${MERGED_ITEMS.length} items`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
