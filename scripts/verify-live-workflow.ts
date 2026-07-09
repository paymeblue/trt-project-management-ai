/**
 * CLI verification harness (Phase 17 Plan 01, WF-06): proves the two claims
 * this migration's entire risk profile rests on, against the REAL 'live'
 * graph (not a synthetic test graph) — no mocks:
 *
 * - PARITY: getLiveWorkflowSteps() (lib/workflow-graph.ts) deep-equals the
 *   legacy WORKFLOW_STEPS array (lib/workflow.ts) on n/key/label/role/kind/
 *   slug, for all 11 steps, in order. This is the proof that the DB is a
 *   faithful copy of the hardcoded array before ANY caller is cut over to it.
 * - JOIN: the live graph's delivery_readiness + delivery_project ->
 *   project_check_report parallel/join (seeded in Task 2 of this plan)
 *   resolves correctly through getActionableSteps in BOTH completion orders.
 *
 * Run via: npm run verify:live-workflow
 *
 * Exits 0 iff every assertion passes; exits 1 on the first structural error
 * or after printing a full report if one or more assertions failed.
 *
 * Operates on graph='live' STEP DEFINITIONS (read-only) and two uniquely-
 * named throwaway PROJECTS — never modifies a real project row (currentStep
 * 3/5/12 projects are untouched) and never touches graph='test'. Cleans up
 * its own rows in a finally block (cascade delete via projects.id FK).
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only shim ──────────────────────────────────────────────────────
// lib/workflow-graph.ts and db/index.ts both start with `import 'server-only'`
// — correct for app code, but the `server-only` package throws unconditionally
// when required outside of Next's webpack build. This harness IS a trusted
// server-side CLI entrypoint, so we short-circuit that one package before
// requiring the engine. Must be a plain `require()` (not a static `import`):
// tsx's ESM->CJS transform hoists static imports above other top-level
// statements, which would run the throwing require before any patch could
// apply (mirrors scripts/verify-workflow-engine.ts, Phase 16 Plan 04).
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
import { WORKFLOW_STEPS } from '../lib/workflow'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

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

function assertIncludes(label: string, steps: { key: string }[], key: string) {
  if (steps.some((s) => s.key === key)) recordPass(label)
  else recordFail(`${label} (expected "${key}" in actionable set, got [${steps.map((s) => s.key).join(', ')}])`)
}

function assertExcludes(label: string, steps: { key: string }[], key: string) {
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
      email: `live-workflow-verify-${role}-${Date.now()}@example.com`,
      name: `Live Verify ${role}`,
      role,
    })
    .returning({ id: schema.users.id })
  createdUserIds.push(created.id)
  return { id: created.id, role }
}

async function createTestProject(createdBy: string, suffix: string): Promise<string> {
  const [project] = await db
    .insert(schema.projects)
    .values({ name: `LIVE-VERIFY-${Date.now()}-${suffix}`, createdBy })
    .returning({ id: schema.projects.id })
  return project.id
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []

  try {
    // ── PARITY: adapter deep-equals the legacy WORKFLOW_STEPS array ───────
    startGroup('PARITY: getLiveWorkflowSteps() == WORKFLOW_STEPS')
    const liveSteps = await wg.getLiveWorkflowSteps()

    if (liveSteps.length !== WORKFLOW_STEPS.length) {
      recordFail(
        `step count mismatch (expected ${WORKFLOW_STEPS.length}, got ${liveSteps.length})`,
      )
    } else {
      recordPass(`step count matches (${liveSteps.length})`)
    }

    const compareLen = Math.min(liveSteps.length, WORKFLOW_STEPS.length)
    for (let i = 0; i < compareLen; i++) {
      const expected = WORKFLOW_STEPS[i]
      const actual = liveSteps[i]
      const fields: (keyof typeof expected)[] = ['n', 'key', 'label', 'role', 'kind', 'slug']
      const mismatches = fields.filter((f) => actual[f] !== expected[f])
      if (mismatches.length === 0) {
        recordPass(`step ${expected.n} ("${expected.key}") matches on n/key/label/role/kind/slug`)
      } else {
        recordFail(
          `step index ${i} mismatch on [${mismatches.join(', ')}]`,
          { expected, actual },
        )
      }
    }
    endGroup()

    // ── Resolve actors + step ids for the join tests ───────────────────────
    const ops = await resolveActor('operations', createdUserIds)
    const sitePm = await resolveActor('site_pm', createdUserIds)
    const factoryPm = await resolveActor('factory_pm', createdUserIds)

    const deliveryReadiness = await wg.getStepByKey('live', 'delivery_readiness')
    const deliveryProject = await wg.getStepByKey('live', 'delivery_project')
    if (!deliveryReadiness || !deliveryProject) {
      throw new Error(
        'Missing "delivery_readiness" or "delivery_project" in graph=\'live\' — run npm run db:seed-workflow-graph first',
      )
    }

    // ── JOIN order A: delivery_readiness then delivery_project ────────────
    startGroup('JOIN order A: delivery_readiness -> delivery_project -> project_check_report')
    const projectA = await createTestProject(ops.id, 'join-order-a')
    createdProjectIds.push(projectA)

    await assertOk('complete delivery_readiness (site_pm)', () =>
      wg.completeGraphStep({ projectId: projectA, stepDefId: deliveryReadiness.id, actorId: sitePm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(projectA, 'live')
      assertExcludes('project_check_report NOT actionable with only delivery_readiness complete', actionable, 'project_check_report')
    }
    await assertOk('complete delivery_project (factory_pm)', () =>
      wg.completeGraphStep({ projectId: projectA, stepDefId: deliveryProject.id, actorId: factoryPm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(projectA, 'live')
      assertIncludes('project_check_report actionable once both branches complete', actionable, 'project_check_report')
    }
    endGroup()

    // ── JOIN order B: delivery_project then delivery_readiness (reverse) ──
    startGroup('JOIN order B: delivery_project -> delivery_readiness -> project_check_report (reverse order)')
    const projectB = await createTestProject(ops.id, 'join-order-b')
    createdProjectIds.push(projectB)

    await assertOk('complete delivery_project first (factory_pm)', () =>
      wg.completeGraphStep({ projectId: projectB, stepDefId: deliveryProject.id, actorId: factoryPm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(projectB, 'live')
      assertExcludes('project_check_report NOT actionable with only delivery_project complete', actionable, 'project_check_report')
    }
    await assertOk('complete delivery_readiness second (site_pm)', () =>
      wg.completeGraphStep({ projectId: projectB, stepDefId: deliveryReadiness.id, actorId: sitePm.id }),
    )
    {
      const actionable = await wg.getActionableSteps(projectB, 'live')
      assertIncludes('project_check_report actionable once both branches complete (order-independent)', actionable, 'project_check_report')
    }
    endGroup()
  } catch (err) {
    console.error('\nUNEXPECTED HARNESS ERROR:', err)
    totalFail++
    failures.push(`[harness] unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // Cleanup — delete throwaway projects (cascades project_step_completions
    // and workflow_step_states via onDelete: 'cascade') and any throwaway
    // users this run created. Never touches any real project or graph='test'.
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
  console.log('RESULT: PASS — PARITY and both JOIN orders verified against the live graph.')
  process.exit(0)
}

main()
