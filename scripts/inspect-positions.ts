/**
 * Read-only inspection (v2.0 Phase 19, Task 1): enumerates every distinct
 * non-null value currently stored in `users.position`,
 * `workflow_step_definitions.required_position`, and
 * `workflow_step_definitions.receiver_required_position`, with row counts,
 * and prints the proposed authoritative `POSITION_VALUES` set — the union of
 * the three baseline machine-gating values (head_of_operations,
 * head_designer, chief_production_officer) plus every distinct live value
 * found above, verbatim. Flags any value that looks like a junk/placeholder
 * string (contains a space and isn't a recognizable title, or is the literal
 * profile placeholder "e.g. Senior Site Manager") as a BACKFILL-TO-NULL
 * candidate for human review at the Task 3 checkpoint.
 *
 * NO WRITES. This script performs SELECT only.
 *
 * Run via: npx tsx scripts/inspect-positions.ts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { isNotNull, sql } from 'drizzle-orm'
import * as schema from '../db/schema'

config({ path: '.env.local' })

const db_url = process.env.DATABASE_URL!
const sqlClient = neon(db_url)
const db = drizzle(sqlClient, { schema })

const { users, workflowStepDefinitions } = schema

const BASELINE_MACHINE_VALUES = ['head_of_operations', 'head_designer', 'chief_production_officer']

const PLACEHOLDER_LITERAL = 'e.g. Senior Site Manager'

function looksLikeJunk(value: string): boolean {
  if (value === PLACEHOLDER_LITERAL) return true
  // Contains a space AND is not a recognizable snake_case machine value —
  // real titles typed as free text (e.g. "Head of Projects", "MD") also
  // contain spaces, so this heuristic only flags the literal placeholder
  // plus anything containing the placeholder's "e.g." prefix pattern.
  if (value.toLowerCase().startsWith('e.g.')) return true
  return false
}

type DistinctRow = { value: string; count: number }

async function distinctNonNull(
  table: 'users_position' | 'required_position' | 'receiver_required_position',
): Promise<DistinctRow[]> {
  if (table === 'users_position') {
    const rows = await db
      .select({ value: users.position, count: sql<number>`count(*)::int` })
      .from(users)
      .where(isNotNull(users.position))
      .groupBy(users.position)
    return rows
      .filter((r): r is { value: string; count: number } => r.value !== null)
      .map((r) => ({ value: r.value, count: r.count }))
  }
  if (table === 'required_position') {
    const rows = await db
      .select({ value: workflowStepDefinitions.requiredPosition, count: sql<number>`count(*)::int` })
      .from(workflowStepDefinitions)
      .where(isNotNull(workflowStepDefinitions.requiredPosition))
      .groupBy(workflowStepDefinitions.requiredPosition)
    return rows
      .filter((r): r is { value: string; count: number } => r.value !== null)
      .map((r) => ({ value: r.value, count: r.count }))
  }
  const rows = await db
    .select({ value: workflowStepDefinitions.receiverRequiredPosition, count: sql<number>`count(*)::int` })
    .from(workflowStepDefinitions)
    .where(isNotNull(workflowStepDefinitions.receiverRequiredPosition))
    .groupBy(workflowStepDefinitions.receiverRequiredPosition)
  return rows
    .filter((r): r is { value: string; count: number } => r.value !== null)
    .map((r) => ({ value: r.value, count: r.count }))
}

function printSection(title: string, rows: DistinctRow[]) {
  console.log(`\n=== ${title} ===`)
  if (rows.length === 0) {
    console.log('  (no non-null values found)')
    return
  }
  for (const r of rows.sort((a, b) => a.value.localeCompare(b.value))) {
    console.log(`  "${r.value}" — ${r.count} row(s)`)
  }
}

async function main() {
  const usersPositions = await distinctNonNull('users_position')
  const requiredPositions = await distinctNonNull('required_position')
  const receiverRequiredPositions = await distinctNonNull('receiver_required_position')

  printSection('(a) users.position — distinct non-null values', usersPositions)
  printSection('(b) workflow_step_definitions.required_position — distinct non-null values', requiredPositions)
  printSection(
    '(c) workflow_step_definitions.receiver_required_position — distinct non-null values',
    receiverRequiredPositions,
  )

  const allLiveValues = new Set<string>([
    ...usersPositions.map((r) => r.value),
    ...requiredPositions.map((r) => r.value),
    ...receiverRequiredPositions.map((r) => r.value),
  ])

  const junkCandidates = [...allLiveValues].filter(looksLikeJunk)
  const keptLiveValues = [...allLiveValues].filter((v) => !looksLikeJunk(v))

  const proposedSet = [...new Set([...BASELINE_MACHINE_VALUES, ...keptLiveValues])]

  console.log('\n=== Proposed POSITION_VALUES (baseline machine values + retained live values) ===')
  console.log(`  [${proposedSet.map((v) => `'${v}'`).join(', ')}]`)

  if (junkCandidates.length > 0) {
    console.log('\n=== BACKFILL-TO-NULL candidates (flagged as junk/placeholder — require human approval) ===')
    for (const v of junkCandidates) {
      console.log(`  "${v}"`)
    }
  } else {
    console.log('\n=== BACKFILL-TO-NULL candidates ===')
    console.log('  (none flagged)')
  }

  console.log('\nDone. This script performed NO writes.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
