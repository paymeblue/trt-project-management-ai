/**
 * CLI verification harness (v2.0 Phase 19, plan 19-04): proves the
 * already-shipped ROLE-02 / ROLE-03 / ROLE-06 / ROLE-07 requirements against
 * REAL code and REAL live-DB state — not assumption. Per the plan's own
 * must_haves truths, a genuine gap found here must be surfaced as a FAIL, not
 * papered over.
 *
 * Checks:
 * (1) ROLE-07 — at least one live `workflow_step_definitions` row has a
 *     `targetRoles` array of length >= 2 (the design/architect pool), and the
 *     column is a real Postgres array type (not a comma-joined string).
 * (2) ROLE-02a — `assignUser` gates on pool membership: a user whose role IS
 *     in the step's targetRoles is accepted; a user whose role is NOT is
 *     rejected. Exercises the real `assign_designer_brief` step in graph=
 *     'live' against a throwaway project + throwaway users (same pattern as
 *     scripts/verify-design-pipeline.ts).
 * (2b) ROLE-02b — the assignee is notified: after a successful assignment,
 *     a row in `notifications` should exist for the assignee. This is a
 *     genuine functional check, not a rubber stamp — if no such row appears,
 *     this FAILS honestly (assignment recording != assignee notification).
 * (3) ROLE-03 — `roleEnum` values contain NONE of the super-admin title
 *     strings (those live only in `users.position`, never the role enum).
 * (4) ROLE-06 — `architect` is present in `roleEnum` AND
 *     app/(app)/architect/dashboard/page.tsx exists on disk.
 *
 * Run via: npx tsx scripts/verify-role-assignment.ts
 *
 * Read-only against real step definitions; creates and cleans up throwaway
 * users + one throwaway project (same discipline as verify-design-pipeline.ts)
 * — never touches a real project or user row.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { existsSync } from 'node:fs'
import { join } from 'node:path'

// ── server-only shim (mirrors scripts/verify-design-pipeline.ts) ─────────
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
import { eq, sql } from 'drizzle-orm'
import * as schema from '../db/schema'

const sqlClient = neon(process.env.DATABASE_URL!)
const db = drizzle(sqlClient, { schema })

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

const SUPER_ADMIN_TITLE_STRINGS = [
  'managing_director',
  'executive_director',
  'chief_operating_officer',
  'head_of_operations',
  'head_of_projects',
  'chief_production_officer',
]

async function createUser(role: 'design' | 'architect' | 'factory_pm', position: string | null, createdUserIds: string[]) {
  const [created] = await db
    .insert(schema.users)
    .values({
      email: `role-assign-verify-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      name: `Role Verify ${role}${position ? ` (${position})` : ''}`,
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
    // ── ROLE-07: targetRoles is a real multi-value array column ──────────
    startGroup('ROLE-07: workflow_step_definitions.target_role is a widened array')
    const colTypeRows = await db.execute(sql`
      select data_type from information_schema.columns
      where table_name = 'workflow_step_definitions' and column_name = 'target_role'
    `)
    const colType = (colTypeRows.rows[0] as { data_type?: string } | undefined)?.data_type
    if (colType === 'ARRAY') {
      recordPass('target_role column is a real Postgres ARRAY type (not free text)')
    } else {
      recordFail('target_role column is not an ARRAY type', colType)
    }

    const liveSteps = await wg.getGraphSteps('live')
    const multiRoleStep = liveSteps.find((s) => (s.targetRoles?.length ?? 0) >= 2)
    if (multiRoleStep) {
      recordPass(`found a live step with targetRoles.length >= 2 ("${multiRoleStep.key}": [${multiRoleStep.targetRoles?.join(', ')}])`)
    } else {
      recordFail('no live workflow_step_definitions row has a targetRoles array of length >= 2', liveSteps.map((s) => ({ key: s.key, targetRoles: s.targetRoles })))
    }
    endGroup()

    // ── ROLE-02: assignment pool membership + assignee notification ──────
    startGroup('ROLE-02: assignment pool membership gate + assignee notification')
    const assignBrief = await wg.getStepByKey('live', 'assign_designer_brief')
    if (!assignBrief) {
      recordFail('assign_designer_brief step not found in graph=\'live\' — cannot verify pool membership')
    } else {
      const headDesigner = await createUser('design', 'head_designer', createdUserIds)
      const designerA = await createUser('design', null, createdUserIds)
      const outOfPoolUser = await createUser('factory_pm', null, createdUserIds)

      const [project] = await db
        .insert(schema.projects)
        .values({ name: `ROLE-ASSIGN-VERIFY-${Date.now()}`, createdBy: headDesigner })
        .returning({ id: schema.projects.id })
      createdProjectIds.push(project.id)

      await assertThrows(
        'assign_designer_brief rejects an out-of-pool user (factory_pm)',
        'assignee-role-mismatch',
        () => wg.assignUser({ projectId: project.id, stepDefId: assignBrief.id, actorId: headDesigner, assignedUserId: outOfPoolUser }),
      )
      await assertOk('assign_designer_brief accepts an in-pool user (design)', () =>
        wg.assignUser({ projectId: project.id, stepDefId: assignBrief.id, actorId: headDesigner, assignedUserId: designerA }),
      )

      const notifRows = await db
        .select({ id: schema.notifications.id, type: schema.notifications.type })
        .from(schema.notifications)
        .where(eq(schema.notifications.recipientId, designerA))
      if (notifRows.length > 0) {
        recordPass('assignee received a notification row after being assigned')
      } else {
        recordFail(
          'assignee received NO notification row after being assigned — assignUser (lib/workflow-graph.ts) and assignUserAction (actions/workflow-graph.ts) record the assignment but do not fire any notification to the assignee; the "notifies that user they\'ve been assigned" half of ROLE-02 is not implemented',
        )
      }
    }
    endGroup()

    // ── ROLE-03: role enum excludes super-admin title strings ────────────
    startGroup('ROLE-03: roleEnum contains no super-admin title values')
    const roleEnumValues = schema.roleEnum.enumValues as readonly string[]
    const leaked = SUPER_ADMIN_TITLE_STRINGS.filter((title) => roleEnumValues.includes(title))
    if (leaked.length === 0) {
      recordPass(`roleEnum [${roleEnumValues.join(', ')}] excludes all 6 super-admin title strings`)
    } else {
      recordFail('roleEnum unexpectedly contains super-admin title value(s)', leaked)
    }
    endGroup()

    // ── ROLE-06: architect role + dashboard shell ─────────────────────────
    startGroup('ROLE-06: architect role + dashboard shell')
    if (roleEnumValues.includes('architect')) {
      recordPass('"architect" present in roleEnum')
    } else {
      recordFail('"architect" missing from roleEnum', roleEnumValues)
    }
    const dashboardPath = join(process.cwd(), 'app', '(app)', 'architect', 'dashboard', 'page.tsx')
    if (existsSync(dashboardPath)) {
      recordPass(`architect dashboard shell exists at ${dashboardPath}`)
    } else {
      recordFail(`architect dashboard shell NOT found at ${dashboardPath}`)
    }
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
  console.log('RESULT: PASS — ROLE-02/03/06/07 all confirmed against real shipped code and live data.')
  process.exit(0)
}

main()
