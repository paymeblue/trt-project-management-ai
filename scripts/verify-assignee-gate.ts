/**
 * CLI verification harness (quick task 260713-ekr, security-critical
 * authorization fix): proves the server-side assignee gate against the REAL
 * live DB — no mocks. This script is STRICTLY READ-ONLY (SELECT statements
 * only, via getGraphSteps/getStepByKey/getStepAssigneeGate, none of which
 * ever write) — it runs against the live production database.
 *
 * Checks:
 * (1) Re-confirms the governance mapping against the ACTUAL live
 *     `workflow_step_definitions` rows (not just the seed file):
 *     `assign_designer_brief` immediately precedes `brief_taking`, and
 *     `design_initiation` immediately precedes `kickoff_meeting` which
 *     immediately precedes `design_stage`, with no other step between each
 *     pair. If the live order differs from ASSIGNEE_GATED_STEPS
 *     (lib/workflow-graph.ts), this is a FATAL mismatch — the script stops
 *     and reports rather than proceeding to verify a stale mapping.
 * (2) Finds a real project to check the gate against: prefers an in-flight
 *     project currently sitting at brief_taking/kickoff_meeting/design_stage;
 *     falls back to any project with a completed assignment row for
 *     assign_designer_brief or design_initiation. Confirms
 *     getStepAssigneeGate('live', projectId, stepKey) resolves to the SAME
 *     assignedUserId already recorded on the governing assignment step's
 *     workflow_step_states row.
 * (3) Confirms getStepAssigneeGate returns null for a non-gated step key
 *     ('invoice_upload') — the gate is a no-op outside the 3 mapped keys.
 *
 * Run via: npx tsx scripts/verify-assignee-gate.ts
 *
 * Exits 0 iff every assertion passes; exits 1 on any mismatch/failure.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

// ── server-only shim ────────────────────────────────────────────────────
// lib/workflow-graph.ts (and db/index.ts, which it imports) start with
// `import 'server-only'` — correct for app code, but the `server-only`
// package throws unconditionally when required outside of Next's webpack
// build. This harness IS a trusted server-side CLI entrypoint, so the throw
// is short-circuited before requiring the engine. Must be a plain
// `require()` (not a static `import`): tsx's ESM->CJS transform hoists
// static imports above other top-level statements, which would run the
// throwing require before this patch could apply (mirrors
// scripts/verify-live-workflow.ts / scripts/verify-role-assignment.ts).
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
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

// ── assertion bookkeeping (mirrors verify-live-workflow.ts / verify-role-assignment.ts) ──
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

const GOVERNANCE = [
  { governing: 'assign_designer_brief', governed: 'brief_taking' },
  { governing: 'design_initiation', governed: 'kickoff_meeting' },
] as const
// design_stage is also governed by design_initiation, but not immediately
// adjacent to it (kickoff_meeting sits between them) — checked separately
// against ASSIGNEE_GATED_STEPS via assigneeGoverningStepKey, not adjacency.

async function main() {
  try {
    // ── (1) Re-confirm governance mapping against the ACTUAL live DB ──────
    startGroup('Governance mapping matches live workflow_step_definitions order')
    const liveSteps = await wg.getGraphSteps('live')
    const byKey = new Map(liveSteps.map((s, i) => [s.key, i]))

    let fatalMismatch = false
    for (const { governing, governed } of GOVERNANCE) {
      const gIdx = byKey.get(governing)
      const dIdx = byKey.get(governed)
      if (gIdx === undefined || dIdx === undefined) {
        recordFail(`could not find "${governing}" and/or "${governed}" in graph='live'`, {
          governingFound: gIdx !== undefined,
          governedFound: dIdx !== undefined,
        })
        fatalMismatch = true
        continue
      }
      if (dIdx === gIdx + 1) {
        recordPass(`"${governing}" (orderIndex ${liveSteps[gIdx].orderIndex}) immediately precedes "${governed}" (orderIndex ${liveSteps[dIdx].orderIndex})`)
      } else {
        recordFail(
          `"${governing}" does NOT immediately precede "${governed}" in the live graph`,
          { governingIndex: gIdx, governedIndex: dIdx, between: liveSteps.slice(gIdx + 1, dIdx).map((s) => s.key) },
        )
        fatalMismatch = true
      }
    }

    // design_stage: must be immediately after kickoff_meeting (design_initiation -> kickoff_meeting -> design_stage)
    const kickoffIdx = byKey.get('kickoff_meeting')
    const designStageIdx = byKey.get('design_stage')
    if (kickoffIdx === undefined || designStageIdx === undefined) {
      recordFail('could not find "kickoff_meeting" and/or "design_stage" in graph=\'live\'')
      fatalMismatch = true
    } else if (designStageIdx === kickoffIdx + 1) {
      recordPass(`"kickoff_meeting" immediately precedes "design_stage" (both governed by design_initiation)`)
    } else {
      recordFail('"kickoff_meeting" does NOT immediately precede "design_stage" in the live graph', {
        kickoffIdx,
        designStageIdx,
      })
      fatalMismatch = true
    }
    endGroup()

    if (fatalMismatch) {
      console.log('\nFATAL: live step order differs from ASSIGNEE_GATED_STEPS (lib/workflow-graph.ts). Stopping — refusing to verify a stale mapping.')
      process.exit(1)
    }

    // ── (2) Real project: gate resolves to the recorded assignee ──────────
    startGroup('getStepAssigneeGate resolves to the real recorded assignedUserId')

    const gatedStepDefs = new Map(liveSteps.filter((s) => ['brief_taking', 'kickoff_meeting', 'design_stage'].includes(s.key)).map((s) => [s.key, s]))
    const governingStepDefs = new Map(liveSteps.filter((s) => ['assign_designer_brief', 'design_initiation'].includes(s.key)).map((s) => [s.key, s]))

    let checkedProjectId: string | null = null

    // Prefer a real in-flight project sitting exactly at one of the 3 gated steps.
    for (const [key, def] of gatedStepDefs) {
      const [inFlight] = await db
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(eq(schema.projects.currentStep, def.orderIndex))
        .limit(1)
      if (inFlight) {
        const governingKey = wg.assigneeGoverningStepKey(key)!
        const governingDef = governingStepDefs.get(governingKey)
        if (!governingDef) continue
        const [state] = await db
          .select({ assignedUserId: schema.workflowStepStates.assignedUserId })
          .from(schema.workflowStepStates)
          .where(
            and(
              eq(schema.workflowStepStates.projectId, inFlight.id),
              eq(schema.workflowStepStates.stepDefId, governingDef.id),
            ),
          )
          .limit(1)
        const recorded = state?.assignedUserId ?? null
        const resolved = await wg.getStepAssigneeGate('live', inFlight.id, key)
        if (resolved === recorded) {
          recordPass(
            `in-flight project "${inFlight.name}" at "${key}": getStepAssigneeGate = ${resolved ?? 'null'}, matches recorded assignedUserId (${recorded ?? 'null'})`,
          )
        } else {
          recordFail(`in-flight project "${inFlight.name}" at "${key}": getStepAssigneeGate (${resolved}) != recorded assignedUserId (${recorded})`)
        }
        checkedProjectId = inFlight.id
        break
      }
    }

    // Fallback: any project with a completed assignment row for either governing step.
    if (!checkedProjectId) {
      for (const [governingKey, governingDef] of governingStepDefs) {
        const [assignedState] = await db
          .select({ projectId: schema.workflowStepStates.projectId, assignedUserId: schema.workflowStepStates.assignedUserId })
          .from(schema.workflowStepStates)
          .where(
            and(
              eq(schema.workflowStepStates.stepDefId, governingDef.id),
              eq(schema.workflowStepStates.status, 'complete'),
            ),
          )
          .limit(1)
        if (assignedState?.assignedUserId) {
          const governedKey = governingKey === 'assign_designer_brief' ? 'brief_taking' : 'kickoff_meeting'
          const resolved = await wg.getStepAssigneeGate('live', assignedState.projectId, governedKey)
          if (resolved === assignedState.assignedUserId) {
            recordPass(
              `fallback: project (via completed "${governingKey}" assignment) getStepAssigneeGate('${governedKey}') = ${resolved}, matches recorded assignedUserId`,
            )
          } else {
            recordFail(`fallback: getStepAssigneeGate('${governedKey}') (${resolved}) != recorded assignedUserId (${assignedState.assignedUserId})`)
          }
          checkedProjectId = assignedState.projectId
          break
        }
      }
    }

    if (!checkedProjectId) {
      recordFail('no in-flight project at a gated step AND no project with a completed governing assignment could be found to verify against — cannot confirm getStepAssigneeGate against real data')
    }
    endGroup()

    // ── (3) Non-gated step key resolves to null ────────────────────────────
    startGroup('getStepAssigneeGate returns null for a non-gated step key')
    const anyProjectId = checkedProjectId ?? (await db.select({ id: schema.projects.id }).from(schema.projects).limit(1))[0]?.id
    if (!anyProjectId) {
      recordFail('no project row exists at all to check the non-gated case against')
    } else {
      const resolved = await wg.getStepAssigneeGate('live', anyProjectId, 'invoice_upload')
      if (resolved === null) {
        recordPass(`getStepAssigneeGate('live', <project>, 'invoice_upload') = null (non-gated step is unaffected)`)
      } else {
        recordFail(`getStepAssigneeGate('live', <project>, 'invoice_upload') expected null, got ${resolved}`)
      }
    }
    endGroup()
  } catch (err) {
    console.error('\nUNEXPECTED HARNESS ERROR:', err)
    totalFail++
    failures.push(`[harness] unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log(`\n${'='.repeat(60)}`)
  if (totalFail > 0) {
    console.log(`RESULT: FAIL (${totalFail} assertion(s) failed)`)
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  console.log('RESULT: PASS — assignee gate confirmed against real shipped code and live data.')
  process.exit(0)
}

main()
