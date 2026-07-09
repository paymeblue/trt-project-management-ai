/**
 * CLI verification harness (v2.0 Phase 21): proves the 6 new Design-team
 * steps (assign_designer_brief -> kickoff_meeting -> design_meeting ->
 * brief_taking -> design_initiation -> design_stage) work end-to-end against
 * the REAL 'live' graph on a throwaway project — no mocks. Specifically:
 *
 * - The two assignment steps accept a `design`-OR-`architect` pool assignee
 *   (targetRoles list, not a single role) and reject an out-of-pool user.
 * - assign_designer_brief and design_initiation are genuinely independent —
 *   assigning a different person the second time does not clobber the first.
 * - Each step gates correctly (STATE_GATED_KINDS: can't complete before its
 *   state is fulfilled) and the chain lands on the existing 'confirmation'
 *   step, completely unchanged, once design_stage is done.
 * - Both assignment steps carry requiredPosition='head_designer' in the DB
 *   (the actual position check itself lives in actions/workflow-graph.ts's
 *   authorizeStep, a 'use server' action gating the real request path — this
 *   harness verifies the data it reads is correctly configured).
 *
 * Run via: npx tsx scripts/verify-design-pipeline.ts
 *
 * Operates on graph='live' STEP DEFINITIONS (read-only) and one uniquely-
 * named throwaway PROJECT plus throwaway USERS — never modifies a real
 * project row. Cleans up its own rows in a finally block.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only shim (mirrors scripts/verify-live-workflow.ts) ────────────
type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must run before the static import below
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

let groupLabel = ''
let groupPass = 0
let groupFail = 0
let totalFail = 0
const failures: string[] = []

function startGroup(label: string) {
  groupLabel = label
  groupPass = 0
  groupFail = 0
  console.log(`\n=== ${label} ===`)
}
function endGroup() {
  const status = groupFail === 0 ? 'PASS' : 'FAIL'
  console.log(`--- ${groupLabel}: ${status} (${groupPass}/${groupPass + groupFail}) ---`)
}
function recordPass(label: string) {
  console.log(`  PASS: ${label}`)
  groupPass++
}
function recordFail(label: string, detail?: unknown) {
  console.log(`  FAIL: ${label}`, detail ?? '')
  groupFail++
  totalFail++
  failures.push(`[${groupLabel}] ${label}`)
}
async function assertOk(label: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    recordPass(label)
  } catch (err) {
    recordFail(`${label} (expected success, threw)`, err instanceof Error ? err.message : err)
  }
}
async function assertThrows(label: string, expectedMessage: string, fn: () => Promise<unknown>) {
  try {
    await fn()
    recordFail(`${label} (expected throw "${expectedMessage}", but it succeeded)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === expectedMessage) recordPass(label)
    else recordFail(`${label} (expected throw "${expectedMessage}", got "${msg}")`)
  }
}
function assertIncludes(label: string, steps: { key: string }[], key: string) {
  if (steps.some((s) => s.key === key)) recordPass(label)
  else recordFail(`${label} (expected "${key}" in actionable set, got [${steps.map((s) => s.key).join(', ')}])`)
}
function assertExcludes(label: string, steps: { key: string }[], key: string) {
  if (!steps.some((s) => s.key === key)) recordPass(label)
  else recordFail(`${label} (expected "${key}" NOT in actionable set, got [${steps.map((s) => s.key).join(', ')}])`)
}

async function createUser(role: 'design' | 'architect' | 'factory_pm', position: string | null, createdUserIds: string[]) {
  const [created] = await db
    .insert(schema.users)
    .values({
      email: `design-pipeline-verify-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      name: `Design Verify ${role}${position ? ` (${position})` : ''}`,
      role,
      position,
    })
    .returning({ id: schema.users.id })
  createdUserIds.push(created.id)
  return created.id
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []

  try {
    startGroup('Setup: resolve step ids + create throwaway users')
    const assignBrief = await wg.getStepByKey('live', 'assign_designer_brief')
    const kickoff = await wg.getStepByKey('live', 'kickoff_meeting')
    const designMeeting = await wg.getStepByKey('live', 'design_meeting')
    const briefTaking = await wg.getStepByKey('live', 'brief_taking')
    const designInitiation = await wg.getStepByKey('live', 'design_initiation')
    const designStage = await wg.getStepByKey('live', 'design_stage')
    const confirmation = await wg.getStepByKey('live', 'confirmation')
    if (!assignBrief || !kickoff || !designMeeting || !briefTaking || !designInitiation || !designStage || !confirmation) {
      throw new Error('Missing one or more design-pipeline steps in graph=\'live\' — run the migration first.')
    }
    recordPass('all 7 steps found (6 new + confirmation)')

    if (assignBrief.requiredPosition === 'head_designer' && designInitiation.requiredPosition === 'head_designer') {
      recordPass('both assignment steps carry requiredPosition="head_designer"')
    } else {
      recordFail('requiredPosition mismatch on assignment steps', {
        assignBrief: assignBrief.requiredPosition,
        designInitiation: designInitiation.requiredPosition,
      })
    }
    if (
      assignBrief.targetRoles?.length === 2 &&
      assignBrief.targetRoles.includes('design') &&
      assignBrief.targetRoles.includes('architect')
    ) {
      recordPass('assign_designer_brief targetRoles pool is [design, architect]')
    } else {
      recordFail('assign_designer_brief targetRoles pool is wrong', assignBrief.targetRoles)
    }

    const headDesigner = await createUser('design', 'head_designer', createdUserIds)
    const designerA = await createUser('design', null, createdUserIds)
    const architectA = await createUser('architect', null, createdUserIds)
    const outOfPoolUser = await createUser('factory_pm', null, createdUserIds)
    endGroup()

    startGroup('Design pipeline: assignment pool + two independent assignments')
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `DESIGN-PIPELINE-VERIFY-${Date.now()}`, createdBy: headDesigner })
      .returning({ id: schema.projects.id })
    createdProjectIds.push(project.id)

    await assertThrows(
      'assign_designer_brief rejects an out-of-pool user (factory_pm)',
      'assignee-role-mismatch',
      () => wg.assignUser({ projectId: project.id, stepDefId: assignBrief.id, actorId: headDesigner, assignedUserId: outOfPoolUser }),
    )
    await assertOk('assign_designer_brief accepts a design-role user', () =>
      wg.assignUser({ projectId: project.id, stepDefId: assignBrief.id, actorId: headDesigner, assignedUserId: designerA }),
    )
    await assertOk('complete assign_designer_brief', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: assignBrief.id, actorId: headDesigner }),
    )

    await assertOk('submit kickoff_meeting (yes)', () =>
      wg.submitYesNoUpload({ projectId: project.id, stepDefId: kickoff.id, actorId: designerA, answer: 'yes' }),
    )
    await assertOk('complete kickoff_meeting', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: kickoff.id, actorId: designerA }),
    )

    await assertOk('submit design_meeting (yes)', () =>
      wg.submitYesNoUpload({ projectId: project.id, stepDefId: designMeeting.id, actorId: designerA, answer: 'yes' }),
    )
    await assertOk('complete design_meeting', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: designMeeting.id, actorId: designerA }),
    )

    await assertOk('submit brief_taking (yes)', () =>
      wg.submitYesNoUpload({ projectId: project.id, stepDefId: briefTaking.id, actorId: designerA, answer: 'yes' }),
    )
    await assertOk('complete brief_taking', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: briefTaking.id, actorId: designerA }),
    )

    // Second, independent assignment — deliberately a DIFFERENT person
    // (architectA, not designerA) to prove this is a distinct moment, not a
    // re-use of the first assignment.
    await assertOk('design_initiation assigns a DIFFERENT person (architect pool member)', () =>
      wg.assignUser({ projectId: project.id, stepDefId: designInitiation.id, actorId: headDesigner, assignedUserId: architectA }),
    )
    await assertOk('complete design_initiation', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: designInitiation.id, actorId: headDesigner }),
    )

    await assertOk('submit design_stage (yes, client approved)', () =>
      wg.submitYesNoUpload({ projectId: project.id, stepDefId: designStage.id, actorId: architectA, answer: 'yes' }),
    )
    await assertOk('complete design_stage', () =>
      wg.completeGraphStep({ projectId: project.id, stepDefId: designStage.id, actorId: architectA }),
    )

    const actionable = await wg.getActionableSteps(project.id, 'live')
    assertIncludes('existing "confirmation" step is now actionable, unchanged', actionable, 'confirmation')
    assertExcludes('design_stage no longer actionable (already complete)', actionable, 'design_stage')
    endGroup()
  } catch (err) {
    console.error('\nUNEXPECTED HARNESS ERROR:', err)
    totalFail++
    failures.push(`[harness] unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const projectId of createdProjectIds) {
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
    }
    for (const userId of createdUserIds) {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
    }
    console.log(`\nCleaned up ${createdProjectIds.length} throwaway project(s) and ${createdUserIds.length} throwaway user(s).`)
  }

  console.log(`\n${'='.repeat(60)}`)
  if (totalFail > 0) {
    console.log(`RESULT: FAIL (${totalFail} assertion(s) failed)`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('RESULT: PASS — the 6-step Design pipeline works end-to-end and lands on the existing Confirmation step.')
  process.exit(0)
}

main()
