/**
 * Legacy escalation backfill (quick task 260727-ibr).
 *
 * Root cause: escalations raised before quick task 260727-gow shipped wrote
 * NO `step_escalations` row — only `escalateChecklistAction`'s notification
 * fan-out (`notifications` rows, type='escalation', one row per recipient).
 * Those escalations are therefore invisible/unactionable on the dispute
 * page's amend panel (`loadEscalationPanelData` reads only `step_escalations`).
 * This script reconstructs the missing durable rows from that notification
 * history so the amend panel picks them up like any post-260727-gow
 * escalation.
 *
 * ADDITIVE ONLY — this script INSERTs, never UPDATEs or DELETEs anything.
 *
 * Every derivation is exact-match or SKIP, never a guess:
 *  - project name lookup by projectId
 *  - checklistLabel: the title substring after the FIRST ': ', with the
 *    exact trailing ' on <projectName>' suffix stripped (not regex-guessed —
 *    project names can themselves contain " on ")
 *  - checklistSlug: exact match against checklist_definitions.name, then a
 *    case-insensitive retry
 *  - stepN: the graph='live' workflow_step_definitions row for that slug;
 *    zero or more-than-one matches are both a skip (ambiguous prints
 *    candidates)
 *  - targetPosition: escalationTargetPosition(actor's role) — imported from
 *    lib/escalation.ts, never re-derived here, so the routing table can
 *    never drift between the live write path and this backfill
 *  - reason: the notification body, with the sentinel
 *    'No additional details provided.' (escalateChecklistAction's stand-in
 *    for an empty reason) mapped back to null so the backfilled row never
 *    asserts a reason the escalator never actually typed (T-ibr-05)
 *
 * Dedupe guard (T-ibr-04): a group is skipped if a step_escalations row
 * already exists for the same (projectId, createdBy) with createdAt within
 * +/-5 minutes of the notification's timestamp, OR an exact
 * (projectId, stepN, createdBy, reason) match exists. The time window exists
 * because the new write path (260727-gow) inserts the step_escalations row
 * and the notifications in the SAME request — their timestamps are
 * near-identical but not bit-identical. This guard is evaluated in BOTH dry
 * run and --apply so the dry-run printout is truthful, and makes re-runs
 * idempotent.
 *
 * Usage:
 *   npx tsx scripts/backfill-step-escalations.ts            # dry run (default)
 *   npx tsx scripts/backfill-step-escalations.ts --apply     # perform inserts
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { escalationTargetPosition } from '../lib/escalation'
import type { UserRole } from '../lib/workflow'

config({ path: '.env.local' })

const db = drizzle(neon(process.env.DATABASE_URL!), { schema })

const { notifications, projects, checklistDefinitions, workflowStepDefinitions, users, stepEscalations } = schema

const NO_DETAILS_SENTINEL = 'No additional details provided.'
const DEDUPE_WINDOW_MS = 5 * 60 * 1000 // +/-5 minutes

const APPLY = process.argv.includes('--apply')

type NotificationRow = {
  id: string
  title: string
  body: string | null
  projectId: string | null
  actorId: string | null
  createdAt: Date
}

type Group = {
  projectId: string
  actorId: string | null
  title: string
  body: string | null
  createdAt: Date // MIN(createdAt) across the fan-out
  count: number
}

function groupKey(n: NotificationRow) {
  return `${n.projectId}::${n.actorId}::${n.title}`
}

async function main() {
  console.log(APPLY ? 'APPLY — inserting' : 'DRY RUN — no writes')
  console.log('')

  const rows = (await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      projectId: notifications.projectId,
      actorId: notifications.actorId,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.type, 'escalation'), isNotNull(notifications.projectId)))) as NotificationRow[]

  // Fan-out collapse: the escalate action writes one identical-content
  // notification row per recipient — group by (projectId, actorId, title),
  // keep the MIN createdAt and the group's body (all fan-out rows share it).
  const groupsByKey = new Map<string, Group>()
  for (const n of rows) {
    if (!n.projectId) continue
    const key = groupKey(n)
    const existing = groupsByKey.get(key)
    if (!existing) {
      groupsByKey.set(key, {
        projectId: n.projectId,
        actorId: n.actorId,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        count: 1,
      })
    } else {
      existing.count += 1
      if (n.createdAt < existing.createdAt) existing.createdAt = n.createdAt
    }
  }

  const groups = [...groupsByKey.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  console.log(`Found ${groups.length} distinct escalation group(s) from ${rows.length} notification row(s).`)
  console.log('')

  let inserted = 0
  let skippedDedupe = 0
  let skippedDerivation = 0

  for (const group of groups) {
    const label = `[${group.projectId} / actor=${group.actorId ?? 'null'} / "${group.title}"]`

    // ── Derivation ───────────────────────────────────────────────────────
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, group.projectId))
      .limit(1)
    if (!project) {
      console.log(`SKIP ${label}: project not found.`)
      skippedDerivation += 1
      continue
    }

    const sepIdx = group.title.indexOf(': ')
    if (sepIdx === -1) {
      console.log(`SKIP ${label}: title has no ": " separator.`)
      skippedDerivation += 1
      continue
    }
    const afterColon = group.title.slice(sepIdx + 2)
    const suffix = ` on ${project.name}`
    if (!afterColon.endsWith(suffix)) {
      console.log(`SKIP ${label}: title does not end with " on ${project.name}".`)
      skippedDerivation += 1
      continue
    }
    const checklistLabel = afterColon.slice(0, afterColon.length - suffix.length)

    let [def] = await db
      .select({ id: checklistDefinitions.id, slug: checklistDefinitions.slug, name: checklistDefinitions.name })
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.name, checklistLabel))
      .limit(1)
    if (!def) {
      const candidates = await db
        .select({ id: checklistDefinitions.id, slug: checklistDefinitions.slug, name: checklistDefinitions.name })
        .from(checklistDefinitions)
        .where(sql`lower(${checklistDefinitions.name}) = lower(${checklistLabel})`)
      if (candidates.length === 1) def = candidates[0]
    }
    if (!def) {
      console.log(`SKIP ${label}: no checklist_definitions match for "${checklistLabel}".`)
      skippedDerivation += 1
      continue
    }

    const stepDefs = await db
      .select({ id: workflowStepDefinitions.id, orderIndex: workflowStepDefinitions.orderIndex, stepKey: workflowStepDefinitions.stepKey })
      .from(workflowStepDefinitions)
      .where(and(eq(workflowStepDefinitions.graph, 'live'), eq(workflowStepDefinitions.checklistSlug, def.slug)))
    if (stepDefs.length === 0) {
      console.log(`SKIP ${label}: no graph='live' workflow_step_definitions row for checklistSlug="${def.slug}".`)
      skippedDerivation += 1
      continue
    }
    if (stepDefs.length > 1) {
      console.log(
        `SKIP ${label}: ambiguous — ${stepDefs.length} graph='live' rows for checklistSlug="${def.slug}": ${stepDefs
          .map((s) => `${s.stepKey}(orderIndex=${s.orderIndex})`)
          .join(', ')}.`,
      )
      skippedDerivation += 1
      continue
    }
    const stepN = stepDefs[0].orderIndex

    if (!group.actorId) {
      console.log(`SKIP ${label}: null actor.`)
      skippedDerivation += 1
      continue
    }
    const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, group.actorId)).limit(1)
    if (!actor) {
      console.log(`SKIP ${label}: actor user not found.`)
      skippedDerivation += 1
      continue
    }
    const targetPosition = escalationTargetPosition(actor.role as UserRole)
    if (!targetPosition) {
      console.log(`SKIP ${label}: no escalation target position configured for role "${actor.role}".`)
      skippedDerivation += 1
      continue
    }

    const reason = group.body === NO_DETAILS_SENTINEL ? null : group.body

    // ── Dedupe guard ────────────────────────────────────────────────────
    const windowStart = new Date(group.createdAt.getTime() - DEDUPE_WINDOW_MS)
    const windowEnd = new Date(group.createdAt.getTime() + DEDUPE_WINDOW_MS)
    const existingByWindow = await db
      .select({ id: stepEscalations.id })
      .from(stepEscalations)
      .where(
        and(
          eq(stepEscalations.projectId, group.projectId),
          eq(stepEscalations.createdBy, group.actorId),
          sql`${stepEscalations.createdAt} BETWEEN ${windowStart} AND ${windowEnd}`,
        ),
      )
      .limit(1)
    const existingByExactMatch =
      existingByWindow.length > 0
        ? []
        : await db
            .select({ id: stepEscalations.id })
            .from(stepEscalations)
            .where(
              and(
                eq(stepEscalations.projectId, group.projectId),
                eq(stepEscalations.stepN, stepN),
                eq(stepEscalations.createdBy, group.actorId),
                reason === null ? sql`${stepEscalations.reason} IS NULL` : eq(stepEscalations.reason, reason),
              ),
            )
            .limit(1)

    if (existingByWindow.length > 0 || existingByExactMatch.length > 0) {
      console.log(
        `SKIP (dedupe) ${label}: an existing step_escalations row already covers this (checklistLabel="${checklistLabel}", stepN=${stepN}, createdAt=${group.createdAt.toISOString()}).`,
      )
      skippedDedupe += 1
      continue
    }

    console.log(
      `${APPLY ? 'INSERT' : 'WOULD INSERT'} ${label}: checklistLabel="${checklistLabel}", checklistSlug="${def.slug}", stepN=${stepN}, targetPosition="${targetPosition}", reason=${
        reason === null ? 'null' : JSON.stringify(reason)
      }, createdAt=${group.createdAt.toISOString()} (from ${group.count} fanned-out notification row(s)).`,
    )

    if (APPLY) {
      await db.insert(stepEscalations).values({
        projectId: group.projectId,
        stepN,
        checklistSlug: def.slug,
        checklistLabel,
        reason,
        targetPosition,
        createdBy: group.actorId,
        createdAt: group.createdAt, // preserve the escalation's real time, not the backfill's
      })
    }
    inserted += 1
  }

  console.log('')
  console.log('── Summary ──────────────────────────────────────────────')
  console.log(`Total groups:            ${groups.length}`)
  console.log(`${APPLY ? 'Inserted' : 'Would insert'}:               ${inserted}`)
  console.log(`Skipped (dedupe):         ${skippedDedupe}`)
  console.log(`Skipped (derivation):     ${skippedDerivation}`)

  if (APPLY) {
    const countResult = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM step_escalations`)
    console.log(`Post-apply step_escalations count: ${countResult.rows[0]?.count}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
