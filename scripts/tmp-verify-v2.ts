import { config } from 'dotenv'
config({ path: '.env.local' })

type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NodeModule = require('node:module') as { _load: NodeModuleLoader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  return originalLoad.apply(this, [request, ...rest])
} as NodeModuleLoader

// eslint-disable-next-line @typescript-eslint/no-require-imports
const wg = require('../lib/workflow-graph') as typeof import('../lib/workflow-graph')

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

let pass = 0
let fail = 0
const failures: string[] = []
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { console.log(`  PASS: ${label}`); pass++ }
  else { console.log(`  FAIL: ${label}`, detail ?? ''); fail++; failures.push(label) }
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []

  try {
    // ══ 1. GRAPH STRUCTURAL SANITY ══════════════════════════════════════
    console.log('\n=== Graph structural sanity ===')
    const steps = await wg.getGraphSteps('live')
    const edges = await wg.getGraphEdges('live')
    ok(`26 steps present`, steps.length === 26, steps.length)
    ok(`26 edges present`, edges.length === 26, edges.length)

    const incoming = new Map<string, number>()
    const outgoing = new Map<string, number>()
    for (const e of edges) {
      incoming.set(e.toStepId, (incoming.get(e.toStepId) ?? 0) + 1)
      outgoing.set(e.fromStepId, (outgoing.get(e.fromStepId) ?? 0) + 1)
    }
    const noIncoming = steps.filter((s) => !incoming.has(s.id))
    const noOutgoing = steps.filter((s) => !outgoing.has(s.id))
    ok('exactly 1 entry step (no incoming edges)', noIncoming.length === 1 && noIncoming[0].key === 'new_project', noIncoming.map((s) => s.key))
    ok('exactly 1 terminal step (no outgoing edges)', noOutgoing.length === 1 && noOutgoing[0].key === 'sign_off', noOutgoing.map((s) => s.key))
    const branchSteps = ['materials_readiness', 'delivery_readiness', 'delivery_project', 'project_check_report']
    const nonBranch = steps.filter((s) => !branchSteps.includes(s.key) && s.key !== 'new_project')
    const multiIncoming = nonBranch.filter((s) => (incoming.get(s.id) ?? 0) > 1)
    ok('no unexpected multi-incoming steps outside the known join', multiIncoming.length === 0, multiIncoming.map((s) => s.key))

    // ══ 2. RESOLVE ACTORS (reuse real seeded users where they exist) ═══
    async function resolveActor(role: string, position?: string) {
      const conds = position ? [eq(schema.users.role, role as any), eq(schema.users.position, position)] : [eq(schema.users.role, role as any)]
      const [existing] = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(conds.length > 1 ? (await import('drizzle-orm')).and(...conds) : conds[0]).limit(1)
      if (existing) return existing
      const [created] = await db.insert(schema.users).values({
        email: `v2-verify-${role}-${position ?? 'x'}-${Date.now()}@example.com`,
        name: `V2 Verify ${role}`,
        role: role as any,
        position: position ?? null,
      }).returning({ id: schema.users.id, role: schema.users.role })
      createdUserIds.push(created.id)
      return created
    }

    const customerCare = await resolveActor('customer_care')
    const ops = await resolveActor('operations', 'head_of_operations')
    const headDesigner = await resolveActor('design', 'head_designer')
    await resolveActor('design') // ensure a 2nd design-pool candidate exists for auto-assign
    const chiefProdOfficer = await resolveActor('operations', 'chief_production_officer')
    const factoryOps = await resolveActor('factory_operations')
    const factoryMgr = await resolveActor('factory_manager')
    const factoryPm = await resolveActor('factory_pm')
    const sitePm = await resolveActor('site_pm')
    const superAdmin = await resolveActor('super_admin')

    // ══ 3. FULL WALK — every step 1..26 via the real engine ════════════
    console.log('\n=== Full walk: 26-step project via real engine calls ===')
    const [project] = await db.insert(schema.projects).values({ name: `V2-VERIFY-WALK-${Date.now()}`, createdBy: customerCare.id }).returning({ id: schema.projects.id })
    createdProjectIds.push(project.id)

    async function currentStepOf(): Promise<number> {
      const [p] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, project.id)).limit(1)
      return p.currentStep
    }
    async function stepDef(key: string) {
      const s = await wg.getStepByKey('live', key)
      if (!s) throw new Error(`step not found: ${key}`)
      return s
    }

    // step 1: new_project — normally auto-completed at creation; do it explicitly here.
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('new_project')).id, actorId: customerCare.id })
    await db.update(schema.projects).set({ currentStep: 2 }).where(eq(schema.projects.id, project.id))
    ok('after new_project, currentStep=2 (payment_confirmation)', (await currentStepOf()) === 2, await currentStepOf())

    // step 2: payment_confirmation — completing this should AUTO-ADVANCE THROUGH
    // step 3 (assign_designer_brief) via the new auto-assign hook, landing on 4 (brief_taking).
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('payment_confirmation')).id, actorId: ops.id })
    const afterPayment = await currentStepOf()
    ok('auto-assign fired: currentStep skipped straight to 4 (brief_taking)', afterPayment === 4, afterPayment)
    const assignState = await db.select().from(schema.workflowStepStates).where(eq(schema.workflowStepStates.stepDefId, (await stepDef('assign_designer_brief')).id))
    const myAssignRow = assignState.find((s) => s.projectId === project.id)
    ok('assign_designer_brief has an assignedUserId recorded for my test project', !!myAssignRow?.assignedUserId, myAssignRow)

    // step 4: brief_taking (yes_no_upload, 5-day-max but that's admin-form-side, not engine-gated)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('brief_taking')).id, actorId: headDesigner.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('brief_taking')).id, actorId: headDesigner.id })
    ok('after brief_taking, currentStep=5 (invoice_upload)', (await currentStepOf()) === 5, await currentStepOf())

    // step 5: invoice_upload (customer_care)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('invoice_upload')).id, actorId: customerCare.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('invoice_upload')).id, actorId: customerCare.id })
    ok('after invoice_upload, currentStep=6 (design_initiation)', (await currentStepOf()) === 6, await currentStepOf())

    // step 6: design_initiation (manual assignment — should NOT auto-assign)
    await wg.assignUser({ projectId: project.id, stepDefId: (await stepDef('design_initiation')).id, actorId: headDesigner.id, assignedUserId: headDesigner.id })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('design_initiation')).id, actorId: headDesigner.id })
    ok('after design_initiation, currentStep=7 (kickoff_meeting)', (await currentStepOf()) === 7, await currentStepOf())

    // steps 7,8,9: yes_no_upload chain
    for (const [key, next] of [['kickoff_meeting', 8], ['design_meeting', 9], ['design_stage', 10]] as const) {
      await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef(key)).id, actorId: headDesigner.id, answer: 'yes' })
      await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef(key)).id, actorId: headDesigner.id })
      ok(`after ${key}, currentStep=${next}`, (await currentStepOf()) === next, await currentStepOf())
    }

    // step 10: ops_design_confirmation (head_of_operations)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('ops_design_confirmation')).id, actorId: ops.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('ops_design_confirmation')).id, actorId: ops.id })
    ok('after ops_design_confirmation, currentStep=11', (await currentStepOf()) === 11, await currentStepOf())

    // step 11: confirmation_correction (design)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('confirmation_correction')).id, actorId: headDesigner.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('confirmation_correction')).id, actorId: headDesigner.id })
    ok('after confirmation_correction, currentStep=12', (await currentStepOf()) === 12, await currentStepOf())

    // step 12: internal_approval (head_of_operations)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('internal_approval')).id, actorId: ops.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('internal_approval')).id, actorId: ops.id })
    ok('after internal_approval, currentStep=13', (await currentStepOf()) === 13, await currentStepOf())

    // step 13: send_for_production (approval: send by head_of_operations, receive by chief_production_officer)
    const sfp = await stepDef('send_for_production')
    await wg.sendApproval({ projectId: project.id, stepDefId: sfp.id, actorId: ops.id })
    await wg.receiveApproval({ projectId: project.id, stepDefId: sfp.id, actorId: chiefProdOfficer.id })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: sfp.id, actorId: chiefProdOfficer.id })
    ok('after send_for_production (1/2+2/2), currentStep=14', (await currentStepOf()) === 14, await currentStepOf())

    // step 14: project_review_authorisation (chief_production_officer)
    await wg.submitYesNoUpload({ projectId: project.id, stepDefId: (await stepDef('project_review_authorisation')).id, actorId: chiefProdOfficer.id, answer: 'yes' })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('project_review_authorisation')).id, actorId: chiefProdOfficer.id })
    ok('after project_review_authorisation, currentStep=15', (await currentStepOf()) === 15, await currentStepOf())

    // step 15: production_process (checklist kind — graph-level completion only, form-filling is a separate subsystem)
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('production_process')).id, actorId: factoryOps.id })
    ok('after production_process, currentStep=16', (await currentStepOf()) === 16, await currentStepOf())

    // step 16: confirmation (site_pm, checklist)
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('confirmation')).id, actorId: sitePm.id })
    ok('after confirmation, currentStep=17', (await currentStepOf()) === 17, await currentStepOf())

    // step 17: factory_manager_readiness (checklist) — fans out to 18+19 in parallel
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('factory_manager_readiness')).id, actorId: factoryMgr.id })
    ok('after factory_manager_readiness, currentStep=18', (await currentStepOf()) === 18, await currentStepOf())
    {
      const actionable = await wg.getActionableSteps(project.id, 'live')
      const keys = actionable.map((s) => s.key)
      ok('materials_readiness AND delivery_readiness BOTH actionable simultaneously', keys.includes('materials_readiness') && keys.includes('delivery_readiness'), keys)
    }

    // steps 18/19/20 branch+join (mirrors verify-live-workflow.ts's join test, order A)
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('materials_readiness')).id, actorId: factoryPm.id })
    {
      const actionable = await wg.getActionableSteps(project.id, 'live')
      ok('project_check_report NOT actionable with only materials_readiness+delivery_readiness done (delivery_project still pending)', !actionable.some((s) => s.key === 'project_check_report'), actionable.map((s) => s.key))
    }
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('delivery_readiness')).id, actorId: sitePm.id })
    await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef('delivery_project')).id, actorId: factoryPm.id })
    {
      const actionable = await wg.getActionableSteps(project.id, 'live')
      ok('project_check_report actionable once both branches complete', actionable.some((s) => s.key === 'project_check_report'), actionable.map((s) => s.key))
    }

    // steps 21..26 — force currentStep to 21 (it will be lagging behind the
    // branch by design, same as the pre-existing materials/delivery/join
    // behavior) then walk the rest of the linear tail.
    await db.update(schema.projects).set({ currentStep: 21 }).where(eq(schema.projects.id, project.id))
    for (const [key, next] of [
      ['project_check_report', 22], ['approval_installation', 23], ['installation_readiness', 24],
      ['sorting', 25], ['close_out', 26], ['sign_off', 27],
    ] as const) {
      await wg.completeGraphStep({ projectId: project.id, stepDefId: (await stepDef(key)).id, actorId: key === 'sign_off' ? superAdmin.id : sitePm.id })
      ok(`after ${key}, currentStep=${next}`, (await currentStepOf()) === next, await currentStepOf())
    }
    const [finalProj] = await db.select({ status: schema.projects.status }).from(schema.projects).where(eq(schema.projects.id, project.id)).limit(1)
    ok('project marked delivered after sign_off', finalProj.status === 'delivered', finalProj.status)

    // ══ 4. CONFIGURATOR DRAG FIX — swap two adjacent simple steps mid-project,
    //       confirm currentStep follows, then swap back ══════════════════
    console.log('\n=== Configurator drag currentStep-remap fix ===')
    const [project2] = await db.insert(schema.projects).values({ name: `V2-VERIFY-DRAG-${Date.now()}`, createdBy: customerCare.id, currentStep: 7 }).returning({ id: schema.projects.id })
    createdProjectIds.push(project2.id)
    // project2 sits at 7 (kickoff_meeting). Swap kickoff_meeting(7) <-> design_meeting(8).
    const kickoff = await stepDef('kickoff_meeting')
    const moveRes = await wg.moveGraphStep({ graph: 'live', stepId: kickoff.id, direction: 'down' })
    ok('moveGraphStep succeeded', moveRes.ok, moveRes.message)
    const [p2After] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, project2.id)).limit(1)
    ok('currentStep followed the dragged step (7 -> 8, since kickoff_meeting moved to orderIndex 8)', p2After.currentStep === 8, p2After.currentStep)
    // swap back to restore the live graph exactly as it was
    const kickoffAfter = await wg.getStepByKey('live', 'kickoff_meeting')
    await wg.moveGraphStep({ graph: 'live', stepId: kickoffAfter!.id, direction: 'up' })
    const [p2Restored] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, project2.id)).limit(1)
    ok('currentStep restored after swapping back (8 -> 7)', p2Restored.currentStep === 7, p2Restored.currentStep)
    const restoredSteps = await wg.getGraphSteps('live')
    const kickoffFinal = restoredSteps.find((s) => s.key === 'kickoff_meeting')
    const designMeetingFinal = restoredSteps.find((s) => s.key === 'design_meeting')
    ok('graph orderIndex fully restored (kickoff_meeting=7, design_meeting=8)', kickoffFinal?.orderIndex === 7 && designMeetingFinal?.orderIndex === 8, { kickoffFinal, designMeetingFinal })

    // ══ 5. REAL PROJECTS — sanity check every currentStep resolves to a real step ══
    console.log('\n=== Real projects: currentStep resolves to a real step or "done" ===')
    const liveSteps = await wg.getGraphSteps('live')
    const maxOrder = Math.max(...liveSteps.map((s) => s.orderIndex))
    const realProjects = await db.select({ id: schema.projects.id, name: schema.projects.name, currentStep: schema.projects.currentStep, status: schema.projects.status }).from(schema.projects)
    for (const p of realProjects) {
      if (createdProjectIds.includes(p.id)) continue
      const resolves = p.currentStep > maxOrder || liveSteps.some((s) => s.orderIndex === p.currentStep)
      ok(`project "${p.name}" currentStep=${p.currentStep} resolves`, resolves)
    }
  } catch (err) {
    console.error('\nUNEXPECTED ERROR:', err)
    fail++
    failures.push(`unexpected: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const id of createdProjectIds) await db.delete(schema.projects).where(eq(schema.projects.id, id))
    for (const id of createdUserIds) await db.delete(schema.users).where(eq(schema.users.id, id))
    console.log(`\nCleaned up ${createdProjectIds.length} throwaway project(s), ${createdUserIds.length} throwaway user(s).`)
  }

  console.log(`\n${'='.repeat(60)}`)
  if (fail > 0) {
    console.log(`RESULT: FAIL (${fail} failure(s))`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log(`RESULT: PASS (${pass} assertions)`)
  process.exit(0)
}
main()
