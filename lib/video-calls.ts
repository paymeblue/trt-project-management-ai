import 'server-only'
import { StreamClient } from '@stream-io/node-sdk'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { videoCalls, videoCallParticipants, users } from '@/db/schema'
import { notifyUser } from '@/lib/notifications'

// ── GetStream-backed video calls ────────────────────────────────────────────
// trt-pm's own record of who a call is FOR — GetStream owns the actual
// media/signaling and its own call-membership list, but we need our own
// participant rows to (a) fan out in-app notifications when a call starts or
// gains a member, and (b) show "calls involving me" without a round trip to
// GetStream. A video_calls.id doubles as the GetStream call id; every call
// uses GetStream's built-in 'default' call type.
const CALL_TYPE = 'default'
// Short-lived: minted fresh every time a call room page is rendered
// (force-dynamic), so there is no stale-token/refresh problem to solve.
const TOKEN_TTL_SECONDS = 60 * 60

function requiredEnv(name: string): string {
  // .trim() defends against the single most common way this breaks in a
  // hosting provider's env-var UI (Netlify, Vercel, etc.): a pasted value
  // picking up a trailing newline or wrapping quotes. An untrimmed secret
  // still "exists" (so this wouldn't throw below) but produces a JWT whose
  // signature GetStream then rejects outright — surfacing downstream as a
  // cryptic "Token signature is invalid" rather than a clear config error.
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured — video calls are unavailable.`)
  return value
}

// Constructed lazily (not at module load) so importing this file never
// throws in an environment where GetStream isn't configured yet; the error
// only surfaces when a video-call feature is actually used.
let cachedClient: StreamClient | null = null
function streamClient(): StreamClient {
  if (!cachedClient) {
    const apiKey = requiredEnv('GETSTREAM_APIKEY')
    const secret = requiredEnv('GETSTREAM_SECRET')
    // TEMPORARY diagnostic for the "Token signature is invalid" issue on
    // Netlify — never logs the secret itself, only lengths + edge
    // characters, enough to compare against the GetStream dashboard without
    // exposing the credential in function logs. Remove once resolved.
    console.log('[video-calls] GetStream credential check', {
      apiKeyLength: apiKey.length,
      apiKeyPreview: `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}`,
      secretLength: secret.length,
      secretPreview: `${secret.slice(0, 3)}...${secret.slice(-3)}`,
    })
    cachedClient = new StreamClient(apiKey, secret)
  }
  return cachedClient
}

// GetStream requires a user to exist on ITS side (via upsertUsers) before
// that user can be referenced as a call member — referencing an unknown id
// in getOrCreate/updateCallMembers fails outright ("GetOrCreateCall failed:
// the following users ... don't exist ... create users server-side").
// Called before every place this file adds someone to a call's membership.
async function upsertVideoCallUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
  await streamClient().upsertUsers(rows.map((r) => ({ id: r.id, name: r.name ?? r.id })))
}

export type VideoCallToken = { apiKey: string; token: string; callId: string }

/** Mints a fresh GetStream user token for the given user — never expose GETSTREAM_SECRET to the client. */
export function mintVideoToken(userId: string, callId: string): VideoCallToken {
  const token = streamClient().generateUserToken({ user_id: userId, validity_in_seconds: TOKEN_TTL_SECONDS })
  return { apiKey: requiredEnv('GETSTREAM_APIKEY'), token, callId }
}

export type VideoCallRow = {
  id: string
  title: string | null
  createdBy: string
  status: string
  createdAt: Date
  endedAt: Date | null
}

export async function getCall(callId: string): Promise<VideoCallRow | undefined> {
  const [row] = await db.select().from(videoCalls).where(eq(videoCalls.id, callId)).limit(1)
  return row
}

export type CallParticipant = { userId: string; name: string; role: string }

export async function getCallParticipants(callId: string): Promise<CallParticipant[]> {
  return db
    .select({ userId: videoCallParticipants.userId, name: users.name, role: users.role })
    .from(videoCallParticipants)
    .innerJoin(users, eq(users.id, videoCallParticipants.userId))
    .where(eq(videoCallParticipants.callId, callId))
    .orderBy(users.name)
}

/**
 * Creates a call in both our DB and on GetStream with the creator +
 * given participants as initial members, then notifies every invited
 * participant (never the creator — mirrors notifyUser's own self-exclusion,
 * but checked here too since the creator is always in memberIds).
 */
export async function createVideoCall(opts: {
  creatorId: string
  creatorName: string
  title?: string | null
  participantUserIds: string[]
}): Promise<{ id: string }> {
  const memberIds = Array.from(new Set([opts.creatorId, ...opts.participantUserIds]))
  const title = opts.title?.trim() || null

  const [row] = await db.insert(videoCalls).values({ title, createdBy: opts.creatorId }).returning({ id: videoCalls.id })

  await db.insert(videoCallParticipants).values(
    memberIds.map((userId) => ({
      callId: row.id,
      userId,
      invitedBy: userId === opts.creatorId ? null : opts.creatorId,
    })),
  )

  // Neon's HTTP driver can't wrap the inserts above and this GetStream call
  // in one transaction (see prior art in actions/positions.ts for the same
  // driver limitation), so a GetStream failure here would otherwise leave a
  // permanently broken row behind: it shows up in "My Calls" but can never
  // actually be joined. Delete what was just inserted and re-throw instead —
  // the caller (actions/video-calls.ts) already surfaces the error and never
  // treats a throw as success, so there's nothing left half-done for a user
  // to stumble into. FK cascade on video_call_participants.callId handles
  // the participants row cleanup.
  try {
    await upsertVideoCallUsers(memberIds)
    const call = streamClient().video.call(CALL_TYPE, row.id)
    await call.getOrCreate({
      data: {
        created_by_id: opts.creatorId,
        members: memberIds.map((user_id) => ({ user_id })),
        custom: title ? { title } : undefined,
      },
    })
  } catch (err) {
    await db.delete(videoCalls).where(eq(videoCalls.id, row.id))
    throw err
  }

  const invitees = memberIds.filter((id) => id !== opts.creatorId)
  await Promise.all(
    invitees.map((recipientId) =>
      notifyUser({
        recipientId,
        actorId: opts.creatorId,
        type: 'video_call',
        title: `${opts.creatorName} started a video call`,
        body: title,
        callId: row.id,
      }),
    ),
  )

  return { id: row.id }
}

/**
 * Adds one or more users to an existing call — both our participant rows and
 * GetStream's own call membership — and notifies only the NEWLY added users
 * (re-adding an existing participant is a harmless no-op, not a re-notify).
 */
export async function addVideoCallParticipants(opts: {
  callId: string
  actorId: string
  actorName: string
  userIds: string[]
}): Promise<{ added: string[] }> {
  const existing = await db
    .select({ userId: videoCallParticipants.userId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.callId, opts.callId))
  const existingIds = new Set(existing.map((r) => r.userId))
  const newIds = [...new Set(opts.userIds)].filter((id) => !existingIds.has(id))
  if (newIds.length === 0) return { added: [] }

  await db
    .insert(videoCallParticipants)
    .values(newIds.map((userId) => ({ callId: opts.callId, userId, invitedBy: opts.actorId })))

  await upsertVideoCallUsers(newIds)

  const call = streamClient().video.call(CALL_TYPE, opts.callId)
  await call.updateCallMembers({ update_members: newIds.map((user_id) => ({ user_id })) })

  await Promise.all(
    newIds.map((recipientId) =>
      notifyUser({
        recipientId,
        actorId: opts.actorId,
        type: 'video_call',
        title: `${opts.actorName} added you to a video call`,
        body: null,
        callId: opts.callId,
      }),
    ),
  )

  return { added: newIds }
}

/**
 * Idempotently records `userId` as a participant when they open a call room
 * via a shared link rather than an explicit invite (no notification — they're
 * already looking at the page). Also adds them as a GetStream call member so
 * they can actually connect; a no-op if they're already a member either way.
 */
export async function ensureCallParticipant(callId: string, userId: string): Promise<void> {
  const [existing] = await db
    .select({ id: videoCallParticipants.id })
    .from(videoCallParticipants)
    .where(and(eq(videoCallParticipants.callId, callId), eq(videoCallParticipants.userId, userId)))
    .limit(1)
  if (existing) return

  await db
    .insert(videoCallParticipants)
    .values({ callId, userId, invitedBy: null })
    .onConflictDoNothing()

  await upsertVideoCallUsers([userId])

  const call = streamClient().video.call(CALL_TYPE, callId)
  await call.updateCallMembers({ update_members: [{ user_id: userId }] })
}

export async function endVideoCall(callId: string): Promise<void> {
  await db.update(videoCalls).set({ status: 'ended', endedAt: new Date() }).where(eq(videoCalls.id, callId))
  try {
    await streamClient().video.call(CALL_TYPE, callId).end()
  } catch {
    // GetStream may already consider the call over (e.g. everyone already
    // left) — our own status update above is the source of truth every page
    // in this app actually reads from, so a failure here is non-fatal.
  }
}

export type MyCallSummary = VideoCallRow & { participants: CallParticipant[] }

/** Calls this user is part of, most recently created first. */
export async function getMyCalls(userId: string): Promise<MyCallSummary[]> {
  const callIds = await db
    .select({ callId: videoCallParticipants.callId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.userId, userId))
  if (callIds.length === 0) return []

  const ids = callIds.map((r) => r.callId)
  const calls = await db
    .select()
    .from(videoCalls)
    .where(inArray(videoCalls.id, ids))
    .orderBy(desc(videoCalls.createdAt))
    .limit(30)

  const participantsByCall = await Promise.all(calls.map((c) => getCallParticipants(c.id)))
  return calls.map((c, i) => ({ ...c, participants: participantsByCall[i] }))
}
