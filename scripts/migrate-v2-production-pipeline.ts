/**
 * One-time, additive migration (v2.0 Phase 22, 2026-07-10): two jobs in one
 * pass, in this order:
 *
 * 1. REPAIR — a prior Configurator drag left the live graph corrupted:
 *    payment_confirmation had drifted to orderIndex 4 (should always be 2 —
 *    several call sites hardcode this, e.g. actions/projects.ts
 *    confirmPaymentAndSetTimelineAction's `currentStep !== 2` guard), assign_designer_brief
 *    had ZERO incoming edges (wrongly a second entry point alongside
 *    new_project), and payment_confirmation was an edge dead-end (2 incoming,
 *    0 outgoing). This is the root cause of "confirm/assign clicked and
 *    nothing happened." This migration restores the canonical linear order
 *    and rebuilds a clean edge set, remapping every in-flight project's
 *    currentStep (+ project_step_deadlines/project_step_completions) so
 *    nobody's progress is lost.
 *
 *    The underlying bug (lib/workflow-graph.ts swapAdjacentSteps only
 *    rewiring the ONE edge between the two swapped steps, never their
 *    outside neighbors) is fixed separately in that file — this migration
 *    only repairs the data damage already done by it.
 *
 * 2. INSERT — 8 new production-pipeline steps (Invoice, Ops Design
 *    Confirmation, Confirmation Correction, Internal Approval, Send for
 *    Production, Project Review & Authorisation, Production Process,
 *    Factory Manager Readiness) plus 2 new checklist definitions.
 *
 * Both are folded into ONE remap (existing steps go straight to their FINAL
 * orderIndex; no intermediate state) so projects only ever get touched once.
 *
 * Idempotent: if 'invoice_upload' already exists in graph='live', exits
 * without making any changes.
 *
 * Run via: npx tsx scripts/migrate-v2-production-pipeline.ts
 *
 * NOTE (already executed 2026-07-10): this ran against the live DB in two
 * parts — the deadline-remap step hit a transient unique-constraint
 * collision on its first pass (fixed here with a 2-phase temp-offset
 * update) and was completed by a follow-up pass. Both the step/edge
 * migration and the deadline/completion/checklist follow-up are reflected
 * in the single script below; re-running it now is a no-op (idempotency
 * guard).
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
  checklistDefinitions,
  checklistTemplateItems,
} = schema

const GRAPH = 'live'

// ── Final canonical order (26 steps) ───────────────────────────────────────
type StepSpec = {
  stepKey: string
  label: string
  role: string
  fulfillmentKind: string
  checklistSlug?: string
  targetRoles?: string[]
  requiredPosition?: string
  receiverRequiredPosition?: string
  isNew: boolean
}

const FINAL_STEPS: StepSpec[] = [
  { stepKey: 'new_project', label: 'Project Intent', role: 'customer_care', fulfillmentKind: 'creation', isNew: false },
  { stepKey: 'payment_confirmation', label: 'Payment Confirmation & Timeline', role: 'operations', fulfillmentKind: 'payment_confirmation', isNew: false },
  { stepKey: 'assign_designer_brief', label: 'Assign Designer/Architect for Brief', role: 'design', fulfillmentKind: 'assignment', requiredPosition: 'head_designer', targetRoles: ['design', 'architect'], isNew: false },
  { stepKey: 'brief_taking', label: 'Brief Taking', role: 'design', fulfillmentKind: 'yes_no_upload', isNew: false },
  { stepKey: 'invoice_upload', label: 'Invoice (Upload the Invoice)', role: 'customer_care', fulfillmentKind: 'yes_no_upload', isNew: true },
  { stepKey: 'design_initiation', label: 'Design Initiation', role: 'design', fulfillmentKind: 'assignment', requiredPosition: 'head_designer', targetRoles: ['design', 'architect'], isNew: false },
  { stepKey: 'kickoff_meeting', label: 'Kickoff Meeting', role: 'design', fulfillmentKind: 'yes_no_upload', isNew: false },
  { stepKey: 'design_meeting', label: 'Design Meeting', role: 'design', fulfillmentKind: 'yes_no_upload', isNew: false },
  { stepKey: 'design_stage', label: 'Design Stage', role: 'design', fulfillmentKind: 'yes_no_upload', isNew: false },
  { stepKey: 'ops_design_confirmation', label: 'Operations Confirmation (Design Approved)', role: 'operations', fulfillmentKind: 'yes_no_upload', requiredPosition: 'head_of_operations', isNew: true },
  { stepKey: 'confirmation_correction', label: 'Confirmation Correction (Upload Drawing)', role: 'design', fulfillmentKind: 'yes_no_upload', isNew: true },
  { stepKey: 'internal_approval', label: 'Internal Approval (Upload Approved Drawing)', role: 'operations', fulfillmentKind: 'yes_no_upload', requiredPosition: 'head_of_operations', isNew: true },
  { stepKey: 'send_for_production', label: 'Send for Production', role: 'operations', fulfillmentKind: 'approval', requiredPosition: 'head_of_operations', receiverRequiredPosition: 'chief_production_officer', isNew: true },
  { stepKey: 'project_review_authorisation', label: 'Project Review & Authorisation', role: 'operations', fulfillmentKind: 'yes_no_upload', requiredPosition: 'chief_production_officer', isNew: true },
  { stepKey: 'production_process', label: 'Production Process', role: 'factory_operations', fulfillmentKind: 'checklist', checklistSlug: 'production_process', isNew: true },
  { stepKey: 'confirmation', label: 'Confirmation', role: 'site_pm', fulfillmentKind: 'checklist', checklistSlug: 'confirmation', isNew: false },
  { stepKey: 'factory_manager_readiness', label: 'Factory Manager Readiness Forms', role: 'factory_manager', fulfillmentKind: 'checklist', checklistSlug: 'factory_manager_readiness', isNew: true },
  { stepKey: 'materials_readiness', label: 'Materials / Accessories Readiness', role: 'factory_pm', fulfillmentKind: 'readiness', isNew: false },
  { stepKey: 'delivery_readiness', label: 'Delivery Readiness', role: 'site_pm', fulfillmentKind: 'checklist', checklistSlug: 'delivery_site_readiness', isNew: false },
  { stepKey: 'delivery_project', label: 'Delivery Project Checklist', role: 'factory_pm', fulfillmentKind: 'checklist', checklistSlug: 'delivery_project', isNew: false },
  { stepKey: 'project_check_report', label: 'Project Check Report', role: 'factory_pm', fulfillmentKind: 'checklist', checklistSlug: 'project_check_report', isNew: false },
  { stepKey: 'approval_installation', label: 'Approval to Commence Installation', role: 'operations', fulfillmentKind: 'checklist', checklistSlug: 'approval_to_commence_installation', isNew: false },
  { stepKey: 'installation_readiness', label: 'Installation Readiness', role: 'site_pm', fulfillmentKind: 'checklist', checklistSlug: 'installation_readiness', isNew: false },
  { stepKey: 'sorting', label: 'Sorting', role: 'site_pm', fulfillmentKind: 'checklist', checklistSlug: 'sorting', isNew: false },
  { stepKey: 'close_out', label: 'Close Out', role: 'site_pm', fulfillmentKind: 'checklist', checklistSlug: 'close_out', isNew: false },
  { stepKey: 'sign_off', label: 'Sign Off', role: 'super_admin', fulfillmentKind: 'ack', isNew: false },
]

// stepKey -> final 1-based orderIndex
const FINAL_ORDER = new Map(FINAL_STEPS.map((s, i) => [s.stepKey, i + 1]))
const LAST_ORDER = FINAL_STEPS.length

// Canonical edges: linear chain except the two known parallel branches.
const LINEAR_KEYS = FINAL_STEPS.map((s) => s.stepKey).filter(
  (k) => !['materials_readiness', 'delivery_readiness', 'delivery_project', 'project_check_report'].includes(k),
)

type EdgeSpec = [string, string]
const EDGES: EdgeSpec[] = []
for (let i = 0; i < LINEAR_KEYS.length; i++) {
  const from = LINEAR_KEYS[i]
  if (from === 'factory_manager_readiness') break
  EDGES.push([from, LINEAR_KEYS[i + 1]])
}
EDGES.push(['factory_manager_readiness', 'materials_readiness'])
EDGES.push(['factory_manager_readiness', 'delivery_readiness']) // parallel fan-out
EDGES.push(['materials_readiness', 'delivery_project'])
EDGES.push(['delivery_readiness', 'project_check_report'])
EDGES.push(['delivery_project', 'project_check_report']) // join
EDGES.push(['project_check_report', 'approval_installation'])
EDGES.push(['approval_installation', 'installation_readiness'])
EDGES.push(['installation_readiness', 'sorting'])
EDGES.push(['sorting', 'close_out'])
EDGES.push(['close_out', 'sign_off'])

// ── Checklist content for the 2 new checklist-kind steps ───────────────────
type Item = { label: string; type: 'radio' | 'text' }
const Y = (label: string): Item => ({ label, type: 'radio' })

const PRODUCTION_PROCESS_ITEMS: Item[] = [
  Y('Has optimisation been done? (upload the optimisation document)'),
  Y('Cutting process complete'),
  Y('Edging process complete'),
  Y('Drilling and grooving process complete'),
  Y('Spray process complete'),
  Y('Hardwood and upholstery process complete'),
  Y('Glass process complete'),
]

const FACTORY_MANAGER_READINESS_ITEMS: Item[] = [
  Y('Material control readiness form attached'),
  Y('Accessories readiness form attached'),
  Y('Upholstery readiness form attached'),
]

async function seedChecklist(slug: string, name: string, items: Item[]) {
  const existing = await db.select({ id: checklistDefinitions.id }).from(checklistDefinitions).where(eq(checklistDefinitions.slug, slug))
  if (existing.length > 0) {
    const ids = existing.map((e) => e.id)
    await db.delete(checklistTemplateItems).where(inArray(checklistTemplateItems.definitionId, ids))
    await db.delete(checklistDefinitions).where(inArray(checklistDefinitions.id, ids))
  }
  const [def] = await db.insert(checklistDefinitions).values({ slug, name, targetRole: 'factory_pm', isActive: true }).returning({ id: checklistDefinitions.id })
  for (let i = 0; i < items.length; i++) {
    await db.insert(checklistTemplateItems).values({
      definitionId: def.id,
      step: 1,
      sectionTitle: name,
      sortOrder: i + 1,
      label: items[i].label,
      itemType: items[i].type,
      responseOptions: 'yes_no',
      isPhotoAllowed: true,
      isPhotoRequired: false,
      isActive: true,
    })
  }
  console.log(`  seeded checklist "${name}" (${slug}) — ${items.length} items`)
}

async function main() {
  // ── Idempotency guard ────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: workflowStepDefinitions.id })
    .from(workflowStepDefinitions)
    .where(and(eq(workflowStepDefinitions.graph, GRAPH), eq(workflowStepDefinitions.stepKey, 'invoice_upload')))
    .limit(1)
  if (existing) {
    console.log('invoice_upload already exists in graph=live — nothing to do.')
    return
  }

  console.log('Pre-flight OK. Proceeding with migration...')

  // ── Snapshot current state BEFORE any writes ──────────────────────────
  const currentSteps = await db.select().from(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH))
  const byKey = new Map(currentSteps.map((s) => [s.stepKey, s]))
  // old orderIndex -> stepKey, for remapping projects/deadlines that only store a raw integer
  const oldOrderToKey = new Map(currentSteps.map((s) => [s.orderIndex, s.stepKey]))
  const oldLast = currentSteps.length ? Math.max(...currentSteps.map((s) => s.orderIndex)) : 0

  for (const spec of FINAL_STEPS) {
    if (spec.isNew) continue
    if (!byKey.has(spec.stepKey)) {
      console.error(`REFUSING TO CONTINUE: expected existing step "${spec.stepKey}" not found in graph=live.`)
      process.exit(1)
    }
  }

  // ── 1. Move every EXISTING step straight to its final orderIndex ──────
  for (const spec of FINAL_STEPS) {
    if (spec.isNew) continue
    const row = byKey.get(spec.stepKey)!
    const finalOrder = FINAL_ORDER.get(spec.stepKey)!
    if (row.orderIndex !== finalOrder) {
      await db.update(workflowStepDefinitions).set({ orderIndex: finalOrder, updatedAt: new Date() }).where(eq(workflowStepDefinitions.id, row.id))
      console.log(`  moved "${spec.stepKey}": orderIndex ${row.orderIndex} -> ${finalOrder}`)
    }
  }

  // ── 2. Insert new steps at their final orderIndex ──────────────────────
  const insertedIds = new Map<string, string>()
  for (const spec of FINAL_STEPS) {
    if (!spec.isNew) continue
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: spec.stepKey,
        label: spec.label,
        role: spec.role as (typeof schema.roleEnum.enumValues)[number],
        fulfillmentKind: spec.fulfillmentKind as (typeof schema.fulfillmentKindEnum.enumValues)[number],
        checklistSlug: spec.checklistSlug ?? null,
        targetRoles: (spec.targetRoles as (typeof schema.roleEnum.enumValues)[number][]) ?? null,
        requiredPosition: spec.requiredPosition ?? null,
        receiverRequiredPosition: spec.receiverRequiredPosition ?? null,
        isOptional: false,
        orderIndex: FINAL_ORDER.get(spec.stepKey)!,
      })
      .returning({ id: workflowStepDefinitions.id })
    insertedIds.set(spec.stepKey, inserted.id)
    console.log(`  + inserted "${spec.stepKey}" (${inserted.id}) at orderIndex ${FINAL_ORDER.get(spec.stepKey)}`)
  }

  // ── 3. Rebuild edges from scratch (clean slate — the prior graph was
  //      corrupted: orphaned/duplicate edges, a dead-end, a false 2nd entry
  //      point) ──────────────────────────────────────────────────────────
  const deletedEdges = await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH)).returning({ id: workflowStepEdges.id })
  console.log(`  cleared ${deletedEdges.length} old edge(s)`)

  const idByKey = new Map<string, string>()
  for (const spec of FINAL_STEPS) {
    idByKey.set(spec.stepKey, spec.isNew ? insertedIds.get(spec.stepKey)! : byKey.get(spec.stepKey)!.id)
  }
  for (const [fromKey, toKey] of EDGES) {
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: idByKey.get(fromKey)!, toStepId: idByKey.get(toKey)! })
  }
  console.log(`  inserted ${EDGES.length} clean edge(s)`)

  // ── 4. Remap projects.currentStep (old raw orderIndex -> stepKey -> new orderIndex) ──
  const allProjects = await db.select({ id: projects.id, name: projects.name, currentStep: projects.currentStep }).from(projects)
  for (const p of allProjects) {
    let newStep: number
    if (p.currentStep > oldLast) {
      // "beyond the last step" sentinel (project complete) — keep it beyond the NEW last step.
      newStep = LAST_ORDER + 1
    } else {
      const key = oldOrderToKey.get(p.currentStep)
      if (!key) {
        console.warn(`  WARNING: project "${p.name}" currentStep=${p.currentStep} matches no known step — leaving unchanged.`)
        continue
      }
      newStep = FINAL_ORDER.get(key)!
    }
    if (newStep !== p.currentStep) {
      await db.update(projects).set({ currentStep: newStep, updatedAt: new Date() }).where(eq(projects.id, p.id))
      console.log(`  project "${p.name}": currentStep ${p.currentStep} -> ${newStep}`)
    }
  }

  // ── 5. Remap project_step_deadlines.stepN the same way. 2-phase (negative
  //      temp offset, then final) to dodge the (projectId, stepN) unique
  //      constraint during the transition — a direct old->new update can
  //      collide with an as-yet-unprocessed row that already happens to sit
  //      at the target value. ─────────────────────────────────────────────
  const allDeadlines = await db.select().from(projectStepDeadlines)
  const deadlinesToFix = allDeadlines
    .map((d) => ({ row: d, newStepN: oldOrderToKey.has(d.stepN) ? FINAL_ORDER.get(oldOrderToKey.get(d.stepN)!)! : undefined }))
    .filter((x): x is { row: typeof allDeadlines[number]; newStepN: number } => x.newStepN !== undefined && x.newStepN !== x.row.stepN)
  for (const { row } of deadlinesToFix) {
    await db.update(projectStepDeadlines).set({ stepN: -row.stepN }).where(eq(projectStepDeadlines.id, row.id))
  }
  for (const { row, newStepN } of deadlinesToFix) {
    await db.update(projectStepDeadlines).set({ stepN: newStepN }).where(eq(projectStepDeadlines.id, row.id))
  }
  console.log(`  remapped ${deadlinesToFix.length} project_step_deadlines row(s)`)

  // ── 6. Remap project_step_completions.stepN — prefer stepDefId (stable FK) ──
  const allCompletions = await db.select().from(projectStepCompletions)
  let completionsRemapped = 0
  for (const c of allCompletions) {
    let newStepN: number | undefined
    if (c.stepDefId) {
      const spec = FINAL_STEPS.find((s) => idByKey.get(s.stepKey) === c.stepDefId)
      if (spec) newStepN = FINAL_ORDER.get(spec.stepKey)!
    }
    if (newStepN === undefined) {
      const key = oldOrderToKey.get(c.stepN)
      if (key) newStepN = FINAL_ORDER.get(key)!
    }
    if (newStepN !== undefined && newStepN !== c.stepN) {
      await db.update(projectStepCompletions).set({ stepN: newStepN }).where(eq(projectStepCompletions.id, c.id))
      completionsRemapped++
    }
  }
  console.log(`  remapped ${completionsRemapped} project_step_completions row(s)`)

  // ── 7. Seed the 2 new checklists ────────────────────────────────────────
  await seedChecklist('production_process', 'Production Process', PRODUCTION_PROCESS_ITEMS)
  await seedChecklist('factory_manager_readiness', 'Factory Manager Readiness Forms', FACTORY_MANAGER_READINESS_ITEMS)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
