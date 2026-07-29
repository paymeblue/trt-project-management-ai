/**
 * One-off stale video-call cleanup (quick task 260728-vce).
 *
 * Root cause: `endVideoCall()` — the only thing that ever sets `ended_at` —
 * was wired to exactly one button ("End for everyone"). Calls abandoned
 * before this task shipped the auto-end-on-last-leave path and the
 * scheduled sweep have no way to ever end: they sit `status='active'`
 * forever, offering every past participant a stale Join button.
 *
 * This script performs the DB half ONLY (`status='ended', ended_at=now()`)
 * for every currently `active` call the shared `evaluateCallForSweep`
 * predicate (lib/call-sweep.ts) says is stale — the SAME pure predicate the
 * recurring cron sweep (lib/video-calls.ts's sweepStaleCalls) uses, so this
 * one-off and that recurring job can never disagree about what "stale"
 * means.
 *
 * It deliberately does NOT import lib/video-calls.ts and therefore does NOT
 * call GetStream's `.end()`: these are days-old abandoned sessions GetStream
 * has long since torn down on its own server-side, and requiring
 * GETSTREAM_SECRET here would make a cleanup script fail for a reason
 * entirely unrelated to its job. The DB half is the half every page in this
 * app actually reads (`getMyCalls`/`getCall`'s `status` field), so flipping
 * it alone is sufficient to stop offering a Join button for these rows.
 *
 * Usage:
 *   npx tsx scripts/end-stale-calls.ts            # dry run (default)
 *   npx tsx scripts/end-stale-calls.ts --apply     # perform updates
 */

import { config } from 'dotenv'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import * as schema from '../db/schema'
import { evaluateCallForSweep, type SweepCandidate } from '../lib/call-sweep'

config({ path: '.env.local' })

const db = drizzle(neon(process.env.DATABASE_URL!), { schema })

const { videoCalls, videoCallParticipants } = schema

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(APPLY ? 'APPLY — updating' : 'DRY RUN — no writes')
  console.log('')

  // DB clock, not `new Date()` — same naive-timestamp rationale as
  // lib/video-calls.ts's sendDueCallReminders/sweepStaleCalls (quick task
  // 260706-bpg's documented incident).
  const nowResult = await db.execute<{ now: Date | string }>(sql`select now() as now`)
  const now = new Date(nowResult.rows[0]?.now ?? Date.now())

  const candidates = await db
    .select({
      id: videoCalls.id,
      title: videoCalls.title,
      createdAt: videoCalls.createdAt,
      scheduledFor: videoCalls.scheduledFor,
    })
    .from(videoCalls)
    .where(and(eq(videoCalls.status, 'active'), isNull(videoCalls.endedAt)))

  if (candidates.length === 0) {
    console.log('No active calls found.')
    return
  }

  const callIds = candidates.map((c) => c.id)

  // Same presence aggregation sweepStaleCalls uses — one grouped query over
  // video_call_participants for every candidate call at once.
  const presenceRows = await db
    .select({
      callId: videoCallParticipants.callId,
      presentCount: sql<number>`count(*) filter (where (${videoCallParticipants.joinedAt} is not null and (${videoCallParticipants.leftAt} is null or ${videoCallParticipants.leftAt} < ${videoCallParticipants.joinedAt})))`,
      everJoined: sql<boolean>`bool_or(${videoCallParticipants.joinedAt} is not null)`,
      lastLeftAt: sql<Date | null>`max(${videoCallParticipants.leftAt})`,
    })
    .from(videoCallParticipants)
    .where(inArray(videoCallParticipants.callId, callIds))
    .groupBy(videoCallParticipants.callId)

  const presenceByCallId = new Map(
    presenceRows.map((r) => [
      r.callId,
      {
        presentCount: Number(r.presentCount ?? 0),
        everJoined: Boolean(r.everJoined),
        lastLeftAt: r.lastLeftAt ? new Date(r.lastLeftAt) : null,
      },
    ]),
  )

  let ended = 0
  let skipped = 0

  for (const call of candidates) {
    const presence = presenceByCallId.get(call.id) ?? {
      presentCount: 0,
      everJoined: false,
      lastLeftAt: null,
    }
    const candidateShape: SweepCandidate = {
      callId: call.id,
      createdAt: call.createdAt,
      scheduledFor: call.scheduledFor,
      presentCount: presence.presentCount,
      everJoined: presence.everJoined,
      lastLeftAt: presence.lastLeftAt,
    }
    const decision = evaluateCallForSweep(candidateShape, now)

    console.log(
      `${decision.sweep ? (APPLY ? 'END' : 'WOULD END') : 'SKIP'} [${call.id}] "${call.title ?? '(untitled)'}" ` +
        `createdAt=${call.createdAt.toISOString()} scheduledFor=${call.scheduledFor?.toISOString() ?? 'null'} ` +
        `presentCount=${presence.presentCount} everJoined=${presence.everJoined} lastLeftAt=${presence.lastLeftAt?.toISOString() ?? 'null'} ` +
        `-> { sweep: ${decision.sweep}, reason: '${decision.reason}' }`,
    )

    if (decision.sweep) {
      ended += 1
      if (APPLY) {
        await db
          .update(videoCalls)
          .set({ status: 'ended', endedAt: sql`now()` })
          .where(eq(videoCalls.id, call.id))
      }
    } else {
      skipped += 1
    }
  }

  console.log('')
  console.log('── Summary ──────────────────────────────────────────────')
  console.log(`Examined:                 ${candidates.length}`)
  console.log(`${APPLY ? 'Ended' : 'Would end'}:                  ${ended}`)
  console.log(`Skipped:                  ${skipped}`)

  if (APPLY) {
    const remaining = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM video_calls WHERE status = 'active'`,
    )
    console.log(`Remaining status='active' count: ${remaining.rows[0]?.count}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
