/**
 * CLI verification harness (Phase 16 Plan 04): proves WF-03, WF-04, and WF-05
 * against the isolated `graph='test'` seed (db/seed-workflow-test-graph.ts) by
 * driving the real read/write engine in lib/workflow-graph.ts — no mocks.
 *
 * - WF-03: each of the 4 fulfillment kinds gates completeGraphStep correctly
 *   (yes_no_upload, two-party approval, role-checked assignment; checklist
 *   already covered by the legacy trust boundary).
 * - WF-04: an optional step's skip succeeds; a required step's skip is
 *   rejected server-side.
 * - WF-05: the join step (test_join, 2 incoming edges) is not actionable
 *   until BOTH test_branch_a and test_branch_b are complete, regardless of
 *   completion order.
 *
 * Run via: npm run verify:workflow-engine
 *
 * Exits 0 iff every assertion passes; exits 1 on the first structural error
 * or after printing a full report if one or more assertions failed.
 *
 * Operates ONLY on graph='test' and a uniquely-named throwaway project (per
 * run) — never touches the 'live' graph. Cleans up its own rows at the end
 * (T-16-09).
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only shim ──────────────────────────────────────────────────────
// lib/workflow-graph.ts and db/index.ts both start with `import 'server-only'`
// — correct for app code (prevents accidental client-bundle inclusion), but
// the `server-only` package throws unconditionally when required outside of
// Next's webpack build (which normally aliases it to an empty module on the
// server). This harness IS a trusted server-side CLI entrypoint, so we
// short-circuit that one package before requiring the engine. Must be a
// plain `require()` (not a static `import`), and must run before any
// require of a module that transitively requires 'server-only' — static
// imports are hoisted by tsx's ESM->CJS transform, but require() calls
// execute in the exact order written.
type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must run before the static import below; see comment above
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

const GRAPH = 'test'
const STEP_KEYS = [
  'test_start',
  'test_yesno',
  'test_optional',
  'test_approval',
  'test_assign',
  'test_branch_a',
  'test_branch_b',
  'test_join',
] as const
type StepKey = (typeof STEP_KEYS)[number]

type RoleName = 'operations' | 'site_pm' | 'factory_pm' | 'super_admin'
type Actor = { id: string; role: RoleName }

// ── assertion bookkeeping ──────────────────────────────────────────────────
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

async function assertThrows(label: string, fn: () => Promise<unknown>, expectedMessage: string) {
  try {
    await fn()
    recordFail(`${label} (expected throw "${expectedMessage}", got success)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg === expectedMessage) {
      recordPass(`${label} (threw "${msg}")`)
    } else {
      recordFail(`${label} (expected "${expectedMessage}", got "${msg}")`)
    }
  }
}

async function assertIncludes(label: string, steps: { key: string }[], key: string) {
  if (steps.some((s) => s.key === key)) recordPass(label)
  else recordFail(`${label} (expected "${key}" in actionable set, got [${steps.map((s) => s.key).join(', ')}])`)
}

async function assertExcludes(label: string, steps: { key: string }[], key: string) {
  if (!steps.some((s) => s.key === key)) recordPass(label)
  else recordFail(`${label} (expected "${key}" NOT in actionable set, got [${steps.map((s) => s.key).join(', ')}])`)
}

// ── setup helpers ──────────────────────────────────────────────────────────
async function resolveActor(role: RoleName, createdUserIds: string[]): Promise<Actor> {
  const [existing] = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role))
    .limit(1)
  if (existing) return { id: existing.id, role }

  const [created] = await db
    .insert(schema.users)
    .values({
      email: `engine-test-${role}-${Date.now()}@example.com`,
      name: `Engine Test ${role}`,
      role,
    })
    .returning({ id: schema.users.id })
  createdUserIds.push(created.id)
  return { id: created.id, role }
}

async function createTestProject(createdBy: string, suffix: string): Promise<string> {
  const [project] = await db
    .insert(schema.projects)
    .values({ name: `ENGINE-TEST-${Date.now()}-${suffix}`, createdBy })
    .returning({ id: schema.projects.id })
  return project.id
}

/** Drives a project from test_start through test_assign via the happy path (no assertions — used for the order-independence project, whose negative paths are already covered by the primary project). */
async function advanceToBranchPoint(
  projectId: string,
  stepIds: Record<StepKey, string>,
  actors: { ops: Actor; sitePm: Actor; factoryPm: Actor },
) {
  await wg.completeGraphStep({ projectId, stepDefId: stepIds.test_start, actorId: actors.ops.id })
  await wg.submitYesNoUpload({ projectId, stepDefId: stepIds.test_yesno, actorId: actors.sitePm.id, answer: 'yes' })
  await wg.completeGraphStep({ projectId, stepDefId: stepIds.test_yesno, actorId: actors.sitePm.id })
  await wg.completeGraphStep({ projectId, stepDefId: stepIds.test_optional, actorId: actors.sitePm.id, skip: true })
  await wg.sendApproval({ projectId, stepDefId: stepIds.test_approval, actorId: actors.ops.id })
  await wg.receiveApproval({ projectId, stepDefId: stepIds.test_approval, actorId: actors.sitePm.id })
  await wg.completeGraphStep({ projectId, stepDefId: stepIds.test_approval, actorId: actors.ops.id })
  await wg.assignUser({
    projectId,
    stepDefId: stepIds.test_assign,
    actorId: actors.ops.id,
    assignedUserId: actors.factoryPm.id,
  })
  await wg.completeGraphStep({ projectId, stepDefId: stepIds.test_assign, actorId: actors.ops.id })
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []

  try {
    // Resolve actors.
    const ops = await resolveActor('operations', createdUserIds)
    const sitePm = await resolveActor('site_pm', createdUserIds)
    const factoryPm = await resolveActor('factory_pm', createdUserIds)
    const superAdmin = await resolveActor('super_admin', createdUserIds)

    // Resolve the 8 test-graph step ids by key.
    const stepIds = {} as Record<StepKey, string>
    for (const key of STEP_KEYS) {
      const step = await wg.getStepByKey(GRAPH, key)
      if (!step) throw new Error(`Missing test-graph step "${key}" — run npm run db:seed-workflow-test-graph first`)
      stepIds[key] = step.id
    }

    const mainProjectId = await createTestProject(ops.id, 'main')
    createdProjectIds.push(mainProjectId)

    // ── WF-04 (part 1): required-step skip is rejected before anything else runs ──
    startGroup('WF-04: optional skip vs required reject')
    await assertThrows(
      'skip:true on required test_start is rejected',
      () => wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_start, actorId: ops.id, skip: true }),
      'required-step-cannot-be-skipped',
    )
    endGroup()

    // ── WF-03: creation kind + entry-step actionability ──────────────────
    startGroup('WF-03: fulfillment kinds gate advancement')
    await assertOk('complete test_start (creation, ungated)', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_start, actorId: ops.id }),
    )
    {
      const actionable = await wg.getActionableSteps(mainProjectId, GRAPH)
      await assertIncludes('test_yesno becomes actionable after test_start', actionable, 'test_yesno')
    }

    await assertThrows(
      'completeGraphStep(test_yesno) before submission is rejected',
      () => wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_yesno, actorId: sitePm.id }),
      'step-not-fulfilled',
    )
    await assertOk('submitYesNoUpload fulfills test_yesno', () =>
      wg.submitYesNoUpload({ projectId: mainProjectId, stepDefId: stepIds.test_yesno, actorId: sitePm.id, answer: 'yes' }),
    )
    await assertOk('complete test_yesno after fulfillment', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_yesno, actorId: sitePm.id }),
    )
    endGroup()

    // ── WF-04 (part 2): optional skip succeeds ───────────────────────────
    startGroup('WF-04: optional skip vs required reject (cont.)')
    await assertOk('skip:true on optional test_optional succeeds', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_optional, actorId: sitePm.id, skip: true }),
    )
    endGroup()

    // ── WF-03: two-party approval ─────────────────────────────────────────
    startGroup('WF-03: fulfillment kinds gate advancement (approval)')
    await assertOk('sendApproval records sender', () =>
      wg.sendApproval({ projectId: mainProjectId, stepDefId: stepIds.test_approval, actorId: ops.id }),
    )
    await assertThrows(
      'receiveApproval by the same user as sender is rejected',
      () => wg.receiveApproval({ projectId: mainProjectId, stepDefId: stepIds.test_approval, actorId: ops.id }),
      'approval-requires-two-parties',
    )
    await assertOk('receiveApproval by a different user succeeds', () =>
      wg.receiveApproval({ projectId: mainProjectId, stepDefId: stepIds.test_approval, actorId: sitePm.id }),
    )
    await assertOk('complete test_approval after two-party fulfillment', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_approval, actorId: ops.id }),
    )
    endGroup()

    // ── WF-03: role-checked assignment ────────────────────────────────────
    startGroup('WF-03: fulfillment kinds gate advancement (assignment)')
    await assertThrows(
      'assignUser rejects an assignee whose role does not match targetRole',
      () =>
        wg.assignUser({
          projectId: mainProjectId,
          stepDefId: stepIds.test_assign,
          actorId: ops.id,
          assignedUserId: sitePm.id,
        }),
      'assignee-role-mismatch',
    )
    await assertOk('assignUser succeeds for the correct targetRole (factory_pm)', () =>
      wg.assignUser({
        projectId: mainProjectId,
        stepDefId: stepIds.test_assign,
        actorId: ops.id,
        assignedUserId: factoryPm.id,
      }),
    )
    await assertOk('complete test_assign after correct assignment', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_assign, actorId: ops.id }),
    )
    {
      const actionable = await wg.getActionableSteps(mainProjectId, GRAPH)
      await assertIncludes('test_branch_a actionable after fan-out from test_assign', actionable, 'test_branch_a')
      await assertIncludes('test_branch_b actionable after fan-out from test_assign', actionable, 'test_branch_b')
    }
    endGroup()

    // ── WF-05: join not actionable until BOTH branches complete (branch_a then branch_b) ──
    startGroup('WF-05: join actionable only after both branches (a then b)')
    await assertOk('complete test_branch_a (checklist kind, ungated)', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_branch_a, actorId: sitePm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(mainProjectId, GRAPH)
      await assertExcludes('test_join NOT actionable with only branch_a complete', actionable, 'test_join')
    }
    await assertOk('complete test_branch_b (readiness kind, ungated)', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_branch_b, actorId: factoryPm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(mainProjectId, GRAPH)
      await assertIncludes('test_join actionable once both branches complete', actionable, 'test_join')
    }
    await assertOk('complete test_join', () =>
      wg.completeGraphStep({ projectId: mainProjectId, stepDefId: stepIds.test_join, actorId: superAdmin.id }),
    )
    endGroup()

    // ── WF-05: order-independence (branch_b then branch_a, on a fresh project) ──
    startGroup('WF-05: join actionable only after both branches (b then a, order-independence)')
    const secondProjectId = await createTestProject(ops.id, 'order-independence')
    createdProjectIds.push(secondProjectId)
    await advanceToBranchPoint(secondProjectId, stepIds, { ops, sitePm, factoryPm })

    await assertOk('complete test_branch_b first (reverse order)', () =>
      wg.completeGraphStep({ projectId: secondProjectId, stepDefId: stepIds.test_branch_b, actorId: factoryPm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(secondProjectId, GRAPH)
      await assertExcludes('test_join NOT actionable with only branch_b complete', actionable, 'test_join')
    }
    await assertOk('complete test_branch_a second (reverse order)', () =>
      wg.completeGraphStep({ projectId: secondProjectId, stepDefId: stepIds.test_branch_a, actorId: sitePm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(secondProjectId, GRAPH)
      await assertIncludes('test_join actionable once both branches complete (order-independent)', actionable, 'test_join')
    }
    endGroup()
  } catch (err) {
    console.error('\nUNEXPECTED HARNESS ERROR:', err)
    totalFail++
    failures.push(`[harness] unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // Cleanup — delete test projects (cascades project_step_completions and
    // workflow_step_states via onDelete: 'cascade') and any throwaway users
    // this run created. Never touches pre-existing users or the 'live' graph.
    for (const projectId of createdProjectIds) {
      await db.delete(schema.projects).where(eq(schema.projects.id, projectId))
    }
    for (const userId of createdUserIds) {
      await db.delete(schema.users).where(eq(schema.users.id, userId))
    }
    console.log(`\nCleaned up ${createdProjectIds.length} test project(s) and ${createdUserIds.length} throwaway user(s).`)
  }

  console.log(`\n${'='.repeat(60)}`)
  if (totalFail > 0) {
    console.log(`RESULT: FAIL (${totalFail} assertion(s) failed)`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('RESULT: PASS — WF-03, WF-04, WF-05 all verified against the test graph.')
  process.exit(0)
}

main()
