/**
 * Structural seed: copy the canonical 21 live steps (db/workflow-live-steps.ts)
 * 1:1 into the workflow_step_definitions / workflow_step_edges tables under
 * graph='live'.
 *
 * Edges: an explicit edge list, by step key, rather than a positional n->n+1
 * loop (Phase 17 Plan 01, WF-06/D-03) — historically this encoded a
 * parallel/join around the delivery cluster, but that branch/join collapsed
 * to linear in Phase 22e when the two readiness steps were merged into one
 * dual-confirmation step (see db/workflow-live-steps.ts's header comments
 * for the full history). The live graph today is a single linear
 * chain across all 21 keys, confirmed by read-only inspection of the live DB
 * before this edit. This is a STRUCTURAL/behavioral seed only — it mirrors
 * the existing steps' shape and gating so the read engine
 * (lib/workflow-graph.ts) has real data to query, proven byte-identical to
 * LIVE_WORKFLOW_STEPS by scripts/verify-live-workflow.ts.
 *
 * Run via: npm run db:seed-workflow-graph
 *
 * Idempotent: deletes existing graph='live' edges and definitions first
 * (edges before definitions, to respect the edges->definitions FK), then
 * re-inserts fresh.
 *
 * DESTRUCTIVE — NOT idempotent-by-default against a populated live graph:
 * main() now guards this. A bare run against a `graph='live'` that already
 * has step definitions aborts before deleting anything; re-seeding
 * destructively requires an explicit `--force` argv flag. This seeder is
 * bootstrap-only (first-ever seed of an empty graph) — running it bare
 * against the real live graph would delete every step definition, every
 * edge, and (via FK cascade) every project's workflow_step_states. See the
 * guard at the top of main() below.
 *
 * quick task 260727-dps (2026-07-27): re-synced from a read-only live-DB
 * dump. The file was stale — its header claimed 22 steps (live has 21), its
 * EDGES list referenced 3 removed step keys (installation_readiness, sorting,
 * close_out), omitted set_delivery_timeline and installation_process, and
 * mis-positioned confirmation — all left behind by quick task 260714-qe4's
 * graph restructure, which updated db/workflow-live-steps.ts and the live DB
 * but never updated this file. EDGES below is the exact 20-edge chain dumped
 * from graph='live' on 2026-07-27 (see
 * .planning/quick/260727-dps-sync-workflow-canonical-array-seeder-and/live-edges-actual.txt).
 * ASSIGNMENT_STEP_CONFIG and ADDITIONAL_KINDS_CONFIG were also re-synced from
 * a read-only live-DB query (no write/DDL was issued against live to do
 * this) — see the comments on those two maps below for what is, and is not,
 * covered.
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq, count } from 'drizzle-orm'
import * as schema from './schema'
import { LIVE_WORKFLOW_STEPS } from './workflow-live-steps'

config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const { workflowStepDefinitions, workflowStepEdges } = schema

const GRAPH = 'live'

async function main() {
  // quick task 260727-dps: FAIL-LOUD SAFETY GUARD — must run BEFORE either
  // db.delete(...) call below. This seeder is bootstrap-only (meant to seed
  // an EMPTY graph='live' the first time); a bare re-run against a graph
  // that already has step definitions is NOT idempotence, it's data loss —
  // the two deletes below cascade (via FK) to workflow_step_edges AND to
  // every real project's workflow_step_states, wiping in-flight project
  // progress for every project on the live graph. Requiring an explicit
  // --force argv flag means a stray `npm run db:seed-workflow-graph` (or an
  // accidental re-run of this script) can never silently destroy the live
  // graph — it has to be a deliberate, named action.
  const [{ existingLiveCount }] = await db
    .select({ existingLiveCount: count() })
    .from(workflowStepDefinitions)
    .where(eq(workflowStepDefinitions.graph, GRAPH))
  const force = process.argv.includes('--force')
  if (existingLiveCount > 0 && !force) {
    console.error(
      `ABORTED: graph="${GRAPH}" already has ${existingLiveCount} step definition(s).\n` +
        `Re-seeding deletes ALL of them, ALL of their edges, and — via FK cascade — every ` +
        `project's workflow_step_states (i.e. every in-flight project's recorded progress on ` +
        `this graph). This is data loss, not idempotence.\n` +
        `If you really intend to wipe and rebuild the live graph, re-run with --force:\n` +
        `  npx tsx db/seed-workflow-graph.ts --force`,
    )
    process.exit(1)
  }

  console.log(`Seeding workflow graph "${GRAPH}" from LIVE_WORKFLOW_STEPS...`)

  // Delete existing rows for this graph first (edges before definitions to
  // respect the FK), so re-running the seed is idempotent.
  await db.delete(workflowStepEdges).where(eq(workflowStepEdges.graph, GRAPH))
  await db.delete(workflowStepDefinitions).where(eq(workflowStepDefinitions.graph, GRAPH))
  console.log(`  Cleared existing "${GRAPH}" graph rows.`)

  // quick task 260727-dps: re-synced from a read-only query of graph='live'
  // (2026-07-27) so a --force re-seed reproduces the real graph, not a stale
  // one. Originally only the 2 assignment-kind steps carried a
  // requiredPosition; this map's scope has since widened (live data now has
  // requiredPosition set on several non-assignment steps too — Operations
  // approval/checklist gates added ad hoc after this file was first
  // written) — targetRoles is therefore now optional here. NOT covered by
  // this map or by the WorkflowStep type: materials_readiness's
  // dualRoles=[factory_pm, site_pm] on the live row — that field has no
  // config map in this file at all (out of this quick task's stated scope,
  // which named only ASSIGNMENT_STEP_CONFIG + ADDITIONAL_KINDS_CONFIG); a
  // --force re-seed today would NOT restore materials_readiness's dual-role
  // gating, and would need one added if this seeder is ever actually run
  // against a real graph rebuild.
  const ASSIGNMENT_STEP_CONFIG: Record<
    string,
    { targetRoles?: ('design' | 'architect' | 'site_pm')[]; requiredPosition?: string }
  > = {
    assign_designer_brief: { targetRoles: ['design', 'architect'], requiredPosition: 'head_of_design' },
    design_initiation: { targetRoles: ['design', 'architect'], requiredPosition: 'head_of_design' },
    ops_design_confirmation: { targetRoles: ['site_pm'], requiredPosition: 'head_of_projects' },
    set_delivery_timeline: { requiredPosition: 'operations_manager_admin' },
    internal_approval: { requiredPosition: 'operations_manager_admin' },
    send_for_production: { requiredPosition: 'operations_manager_admin' },
    project_review_authorisation: { requiredPosition: 'chief_production_officer' },
    approval_installation: { requiredPosition: 'operations_manager_admin' },
  }

  // quick task 260713-rb2 (updated 260727-dps): additionalKinds seeded per
  // stepKey — WorkflowStep itself doesn't carry this field. Re-synced from
  // the live read-only query: invoice_upload keeps ['payment_confirmation']
  // (drives the 2-part invoice -> payment wizard on /workflow/step);
  // confirmation_correction now also carries ['checklist'] (its live row
  // additionally requires a linked-checklist fulfillment — see
  // db/workflow-live-steps.ts's why-comment on that entry).
  const ADDITIONAL_KINDS_CONFIG: Record<
    string,
    ('yes_no_upload' | 'approval' | 'assignment' | 'timeline_setting' | 'payment_confirmation' | 'checklist')[]
  > = {
    invoice_upload: ['payment_confirmation'],
    confirmation_correction: ['checklist'],
  }

  // Insert the 21 step definitions as a 1:1 structural copy of LIVE_WORKFLOW_STEPS.
  const idByStepN = new Map<number, string>()
  for (const step of LIVE_WORKFLOW_STEPS) {
    const assignmentConfig = ASSIGNMENT_STEP_CONFIG[step.key]
    const [inserted] = await db
      .insert(workflowStepDefinitions)
      .values({
        graph: GRAPH,
        stepKey: step.key,
        label: step.label,
        role: step.role,
        fulfillmentKind: step.kind,
        additionalKinds: ADDITIONAL_KINDS_CONFIG[step.key] ?? null,
        checklistSlug: step.slug ?? null,
        targetRoles: assignmentConfig?.targetRoles ?? null,
        requiredPosition: assignmentConfig?.requiredPosition ?? null,
        isOptional: false,
        orderIndex: step.n,
      })
      .returning({ id: workflowStepDefinitions.id })
    idByStepN.set(step.n, inserted.id)
    console.log(`  + step ${step.n}: "${step.key}" (${inserted.id})`)
  }

  // Explicit edge list by step key, over the current 21-step live graph.
  // Confirmed via read-only inspection of the live DB (workflow_step_definitions
  // + workflow_step_edges for graph='live') that the graph is a single linear
  // chain with no fan-out/join: the one parallel/join that used to exist around
  // the delivery cluster collapsed to linear in Phase 22e when the two
  // readiness steps were merged into one dual-confirmation step, and again
  // in Phase 22d when the two delivery-checklist steps were merged into
  // delivery_project_check, and again in quick task 260713-rb2 when
  // invoice_upload + invoice_timeline were merged into one Operations step
  // (see db/workflow-live-steps.ts for the full history).
  const idByKey = new Map<string, string>()
  for (const step of LIVE_WORKFLOW_STEPS) {
    idByKey.set(step.key, idByStepN.get(step.n)!)
  }

  // quick task 260727-dps: replaced with the exact 20-edge chain dumped
  // read-only from graph='live' on 2026-07-27 (see live-edges-actual.txt,
  // referenced in the header above). The previous EDGES list here predated
  // quick task 260714-qe4's restructure batch 2 and still referenced 3
  // removed step keys (installation_readiness, sorting, close_out), omitted
  // set_delivery_timeline and installation_process entirely, and
  // mis-positioned confirmation — a bare run of this file would have deleted
  // the live graph, then thrown on the first missing key.
  const EDGES: [string, string][] = [
    ['new_project', 'assign_designer_brief'],
    ['assign_designer_brief', 'brief_taking'],
    ['brief_taking', 'invoice_upload'],
    ['invoice_upload', 'set_delivery_timeline'],
    ['set_delivery_timeline', 'design_initiation'],
    ['design_initiation', 'kickoff_meeting'],
    ['kickoff_meeting', 'design_stage'],
    ['design_stage', 'ops_design_confirmation'],
    ['ops_design_confirmation', 'confirmation'],
    ['confirmation', 'confirmation_correction'],
    ['confirmation_correction', 'internal_approval'],
    ['internal_approval', 'send_for_production'],
    ['send_for_production', 'project_review_authorisation'],
    ['project_review_authorisation', 'production_process'],
    ['production_process', 'factory_manager_readiness'],
    ['factory_manager_readiness', 'materials_readiness'],
    ['materials_readiness', 'delivery_project_check'],
    ['delivery_project_check', 'approval_installation'],
    ['approval_installation', 'installation_process'],
    ['installation_process', 'sign_off'],
  ]

  let edgeCount = 0
  for (const [fromKey, toKey] of EDGES) {
    const fromId = idByKey.get(fromKey)!
    const toId = idByKey.get(toKey)!
    await db.insert(workflowStepEdges).values({ graph: GRAPH, fromStepId: fromId, toStepId: toId })
    edgeCount++
  }
  console.log(`  + ${edgeCount} edges (fully linear chain, new_project -> ... -> sign_off, no fan-out/join)`)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
