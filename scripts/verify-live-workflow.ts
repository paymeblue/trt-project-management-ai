/**
 * CLI verification harness (Phase 17 Plan 01, WF-06; updated v2.0 Phase 22e
 * ad hoc, 2026-07-11): proves the two claims this migration's entire risk
 * profile rests on, against the REAL 'live' graph (not a synthetic test
 * graph) — no mocks:
 *
 * - PARITY: getLiveWorkflowSteps() (lib/workflow-graph.ts) deep-equals the
 *   canonical LIVE_WORKFLOW_STEPS array (db/workflow-live-steps.ts) on n/key/label/role/kind/
 *   slug, for all 23 steps, in order. This is the proof that the DB is a
 *   faithful copy of the hardcoded array before ANY caller is cut over to it.
 * - DUAL-ROLE CONFIRMATION: the live graph's merged Materials/Delivery
 *   Readiness step (`materials_readiness`, dualRoles=[factory_pm, site_pm] —
 *   see scripts/migrate-merge-readiness-dualroles.ts, which collapsed the
 *   graph's former parallel branch/join into this single step) resolves
 *   correctly through confirmDualRoleStepAs (actions/workflow.ts) in BOTH
 *   confirmation orders: it must NOT advance after only one role confirms,
 *   and MUST advance once both have.
 *
 * Run via: npm run verify:live-workflow
 *
 * Exits 0 iff every assertion passes; exits 1 on the first structural error
 * or after printing a full report if one or more assertions failed.
 *
 * Operates on graph='live' STEP DEFINITIONS (read-only) and throwaway
 * PROJECTS uniquely named per run — never modifies a real project row and
 * never touches graph='test'. Cleans up its own rows in a finally block
 * (cascade delete via projects.id FK).
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only / next-cache shim ─────────────────────────────────────────
// lib/workflow-graph.ts and db/index.ts both start with `import 'server-only'`
// — correct for app code, but the `server-only` package throws unconditionally
// when required outside of Next's webpack build. actions/workflow.ts also
// calls `revalidatePath` (next/cache) at the end of confirmDualRoleStepAs,
// which throws/no-ops incorrectly outside a real Next request context. This
// harness IS a trusted server-side CLI entrypoint, so both are short-circuited
// before requiring the engine/actions. Must be a plain `require()` (not a
// static `import`): tsx's ESM->CJS transform hoists static imports above
// other top-level statements, which would run the throwing require before any
// patch could apply (mirrors scripts/verify-workflow-engine.ts, Phase 16 Plan 04).
type NodeModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown
// eslint-disable-next-line @typescript-eslint/no-require-imports -- must run before the static import below; see comment above
const NodeModule = require('node:module') as { _load: NodeModuleLoader }
const originalLoad = NodeModule._load
NodeModule._load = function (this: unknown, request: string, ...rest: [unknown, boolean]) {
  if (request === 'server-only') return {}
  if (request === 'next/cache') return { revalidatePath: () => {} }
  return originalLoad.apply(this, [request, ...rest])
} as NodeModuleLoader

// eslint-disable-next-line @typescript-eslint/no-require-imports
const wg = require('../lib/workflow-graph') as typeof import('../lib/workflow-graph')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wf = require('../actions/workflow') as typeof import('../actions/workflow')

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'
import { LIVE_WORKFLOW_STEPS } from '../db/workflow-live-steps'

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

function assertEqual<T>(label: string, actual: T, expected: T) {
  if (actual === expected) recordPass(label)
  else recordFail(`${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
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

async function createTestProject(createdBy: string, suffix: string, currentStep: number): Promise<string> {
  const [project] = await db
    .insert(schema.projects)
    .values({ name: `LIVE-VERIFY-${Date.now()}-${suffix}`, createdBy, currentStep })
    .returning({ id: schema.projects.id })
  return project.id
}

async function main() {
  const createdUserIds: string[] = []
  const createdProjectIds: string[] = []

  try {
    // ── PARITY: adapter deep-equals the canonical LIVE_WORKFLOW_STEPS array ─
    startGroup('PARITY: getLiveWorkflowSteps() == LIVE_WORKFLOW_STEPS')
    const liveSteps = await wg.getLiveWorkflowSteps()

    if (liveSteps.length !== LIVE_WORKFLOW_STEPS.length) {
      recordFail(
        `step count mismatch (expected ${LIVE_WORKFLOW_STEPS.length}, got ${liveSteps.length})`,
      )
    } else {
      recordPass(`step count matches (${liveSteps.length})`)
    }

    const compareLen = Math.min(liveSteps.length, LIVE_WORKFLOW_STEPS.length)
    for (let i = 0; i < compareLen; i++) {
      const expected = LIVE_WORKFLOW_STEPS[i]
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

    // ── Resolve actors ───────────────────────────────────────────────────
    const ops = await resolveActor('operations', createdUserIds)
    const sitePm = await resolveActor('site_pm', createdUserIds)
    const factoryPm = await resolveActor('factory_pm', createdUserIds)

    const materialsReadiness = await wg.getStepByKey('live', 'materials_readiness')
    if (!materialsReadiness) {
      throw new Error(
        'Missing "materials_readiness" in graph=\'live\' — run npm run db:seed-workflow-graph first',
      )
    }
    if (!materialsReadiness.dualRoles?.length) {
      throw new Error(
        '"materials_readiness" has no dualRoles set — run npx tsx scripts/migrate-merge-readiness-dualroles.ts first',
      )
    }
    const stepN = materialsReadiness.orderIndex

    // ── DUAL-ROLE order A: factory_pm confirms first, then site_pm ────────
    startGroup('DUAL-ROLE order A: factory_pm confirms -> site_pm confirms -> advances')
    const projectA = await createTestProject(ops.id, 'dualrole-order-a', stepN)
    createdProjectIds.push(projectA)

    const resA1 = await wf.confirmDualRoleStepAs({
      projectId: projectA,
      expectedStepN: stepN,
      userId: factoryPm.id,
      role: factoryPm.role,
    })
    assertEqual('factory_pm confirmation recorded (ok)', resA1.ok, true)
    assertEqual('factory_pm confirmation alone does NOT advance', resA1.advanced, false)
    {
      const [proj] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, projectA)).limit(1)
      assertEqual('project still sitting at materials_readiness after only factory_pm confirms', proj?.currentStep, stepN)
    }

    const resA2 = await wf.confirmDualRoleStepAs({
      projectId: projectA,
      expectedStepN: stepN,
      userId: sitePm.id,
      role: sitePm.role,
    })
    assertEqual('site_pm confirmation recorded (ok)', resA2.ok, true)
    assertEqual('site_pm confirmation (2nd role) DOES advance', resA2.advanced, true)
    {
      const [proj] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, projectA)).limit(1)
      assertEqual('project advanced past materials_readiness once both roles confirmed', proj?.currentStep, stepN + 1)
    }
    endGroup()

    // ── DUAL-ROLE order B: site_pm confirms first, then factory_pm (reverse) ──
    startGroup('DUAL-ROLE order B: site_pm confirms -> factory_pm confirms -> advances (order-independent)')
    const projectB = await createTestProject(ops.id, 'dualrole-order-b', stepN)
    createdProjectIds.push(projectB)

    const resB1 = await wf.confirmDualRoleStepAs({
      projectId: projectB,
      expectedStepN: stepN,
      userId: sitePm.id,
      role: sitePm.role,
    })
    assertEqual('site_pm confirmation recorded (ok)', resB1.ok, true)
    assertEqual('site_pm confirmation alone does NOT advance', resB1.advanced, false)
    {
      const [proj] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, projectB)).limit(1)
      assertEqual('project still sitting at materials_readiness after only site_pm confirms', proj?.currentStep, stepN)
    }

    const resB2 = await wf.confirmDualRoleStepAs({
      projectId: projectB,
      expectedStepN: stepN,
      userId: factoryPm.id,
      role: factoryPm.role,
    })
    assertEqual('factory_pm confirmation recorded (ok)', resB2.ok, true)
    assertEqual('factory_pm confirmation (2nd role) DOES advance', resB2.advanced, true)
    {
      const [proj] = await db.select({ currentStep: schema.projects.currentStep }).from(schema.projects).where(eq(schema.projects.id, projectB)).limit(1)
      assertEqual('project advanced past materials_readiness once both roles confirmed (order-independent)', proj?.currentStep, stepN + 1)
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
  console.log('RESULT: PASS — PARITY and both dualRoles confirmation orders verified against the live graph.')
  process.exit(0)
}

main()
