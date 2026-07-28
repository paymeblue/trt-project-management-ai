import 'server-only';
import { StreamClient } from '@stream-io/node-sdk';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { videoCalls, videoCallParticipants, users } from '@/db/schema';
import { notifyUser, VIDEO_CALL_REMINDER_NOTIFICATION_TYPE } from '@/lib/notifications';
import { toTitleCase } from '@/lib/text-case';
import { getOrCreateChatChannel, addChatChannelMembers } from '@/lib/video-chat';
import { emailVideoCallScheduled } from '@/lib/notify-video-call-email';
import { evaluateCallForSweep, type SweepCandidate } from '@/lib/call-sweep';

// ── GetStream-backed video calls ────────────────────────────────────────────
// trt-pm's own record of who a call is FOR — GetStream owns the actual
// media/signaling and its own call-membership list, but we need our own
// participant rows to (a) fan out in-app notifications when a call starts or
// gains a member, and (b) show "calls involving me" without a round trip to
// GetStream. A video_calls.id doubles as the GetStream call id; every call
// uses GetStream's built-in 'default' call type.
const CALL_TYPE = 'default';
// Short-lived: minted fresh every time a call room page is rendered
// (force-dynamic), so there is no stale-token/refresh problem to solve.
const TOKEN_TTL_SECONDS = 60 * 60;

export function requiredEnv(name: string): string {
  // .trim() defends against the single most common way this breaks in a
  // hosting provider's env-var UI (Netlify, Vercel, etc.): a pasted value
  // picking up a trailing newline or wrapping quotes. An untrimmed secret
  // still "exists" (so this wouldn't throw below) but produces a JWT whose
  // signature GetStream then rejects outright — surfacing downstream as a
  // cryptic "Token signature is invalid" rather than a clear config error.
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is not configured — video calls are unavailable.`);
  return value;
}

// Constructed lazily (not at module load) so importing this file never
// throws in an environment where GetStream isn't configured yet; the error
// only surfaces when a video-call feature is actually used.
let cachedClient: StreamClient | null = null;
function streamClient(): StreamClient {
  if (!cachedClient) {
    const apiKey = requiredEnv('GETSTREAM_APIKEY');
    const secret = requiredEnv('GETSTREAM_SECRET');
    cachedClient = new StreamClient(apiKey, secret);
  }
  return cachedClient;
}

// GetStream requires a user to exist on ITS side (via upsertUsers) before
// that user can be referenced as a call member — referencing an unknown id
// in getOrCreate/updateCallMembers fails outright ("GetOrCreateCall failed:
// the following users ... don't exist ... create users server-side").
// Called before every place this file adds someone to a call's membership.
async function upsertVideoCallUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  await streamClient().upsertUsers(
    rows.map((r) => ({ id: r.id, name: toTitleCase(r.name ?? r.id) })),
  );
}

export type VideoCallToken = { apiKey: string; token: string; callId: string };

/** Mints a fresh GetStream user token for the given user — never expose GETSTREAM_SECRET to the client. */
export function mintVideoToken(userId: string, callId: string): VideoCallToken {
  const token = streamClient().generateUserToken({
    user_id: userId,
    validity_in_seconds: TOKEN_TTL_SECONDS,
  });
  return { apiKey: requiredEnv('GETSTREAM_APIKEY'), token, callId };
}

export type VideoCallRow = {
  id: string;
  title: string | null;
  createdBy: string;
  status: string;
  createdAt: Date;
  endedAt: Date | null;
  scheduledFor: Date | null;
};

export async function getCall(
  callId: string,
): Promise<VideoCallRow | undefined> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(eq(videoCalls.id, callId))
    .limit(1);
  return row;
}

export type CallParticipant = { userId: string; name: string; role: string };

export async function getCallParticipants(
  callId: string,
): Promise<CallParticipant[]> {
  const rows = await db
    .select({
      userId: videoCallParticipants.userId,
      name: users.name,
      role: users.role,
    })
    .from(videoCallParticipants)
    .innerJoin(users, eq(users.id, videoCallParticipants.userId))
    .where(eq(videoCallParticipants.callId, callId))
    .orderBy(users.name);
  return rows.map((r) => ({ ...r, name: toTitleCase(r.name) }));
}

/**
 * Creates a call in both our DB and on GetStream with the creator +
 * given participants as initial members, then notifies every invited
 * participant (never the creator — mirrors notifyUser's own self-exclusion,
 * but checked here too since the creator is always in memberIds).
 */
export async function createVideoCall(opts: {
  creatorId: string;
  creatorName: string;
  title?: string | null;
  participantUserIds: string[];
  scheduledFor?: Date | null;
}): Promise<{ id: string }> {
  const memberIds = Array.from(
    new Set([opts.creatorId, ...opts.participantUserIds]),
  );
  const title = opts.title?.trim() || null;
  const scheduledFor = opts.scheduledFor ?? null;

  const [row] = await db
    .insert(videoCalls)
    .values({ title, createdBy: opts.creatorId, scheduledFor })
    .returning({ id: videoCalls.id });

  await db.insert(videoCallParticipants).values(
    memberIds.map((userId) => ({
      callId: row.id,
      userId,
      invitedBy: userId === opts.creatorId ? null : opts.creatorId,
    })),
  );

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
    await upsertVideoCallUsers(memberIds);
    const call = streamClient().video.call(CALL_TYPE, row.id);
    await call.getOrCreate({
      data: {
        created_by_id: opts.creatorId,
        members: memberIds.map((user_id) => ({ user_id })),
        custom: title ? { title } : undefined,
      },
    });
    await getOrCreateChatChannel(row.id, memberIds);
  } catch (err) {
    await db.delete(videoCalls).where(eq(videoCalls.id, row.id));
    throw err;
  }

  const notificationTitle = scheduledFor
    ? `${opts.creatorName} scheduled a video call for ${scheduledFor.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
    : `${opts.creatorName} started a video call`;

  const invitees = memberIds.filter((id) => id !== opts.creatorId);
  await Promise.all(
    invitees.map((recipientId) =>
      notifyUser({
        recipientId,
        actorId: opts.creatorId,
        type: 'video_call',
        title: notificationTitle,
        body: title,
        callId: row.id,
      }),
    ),
  );

  // Best-effort email counterpart to the in-app notification above, gated on
  // `scheduledFor`: an instant call's email would arrive after the call is
  // already over, so the in-app notification and the GetStream ring already
  // cover that case on their own. `invitees` already excludes the creator by
  // construction (see filter above), so the scheduler can never receive a
  // copy addressed as if someone else invited them. Placed after the
  // GetStream try/catch that deletes-and-rethrows on failure, so an email
  // only ever describes a call that fully exists.
  if (scheduledFor) {
    await emailVideoCallScheduled({
      callId: row.id,
      title,
      scheduledFor,
      schedulerName: opts.creatorName,
      inviteeIds: invitees,
    });
  }

  return { id: row.id };
}

/**
 * Adds one or more users to an existing call — both our participant rows and
 * GetStream's own call membership — and notifies only the NEWLY added users
 * (re-adding an existing participant is a harmless no-op, not a re-notify).
 */
export async function addVideoCallParticipants(opts: {
  callId: string;
  actorId: string;
  actorName: string;
  userIds: string[];
}): Promise<{ added: string[] }> {
  const existing = await db
    .select({ userId: videoCallParticipants.userId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.callId, opts.callId));
  const existingIds = new Set(existing.map((r) => r.userId));
  const newIds = [...new Set(opts.userIds)].filter(
    (id) => !existingIds.has(id),
  );
  if (newIds.length === 0) return { added: [] };

  await db.insert(videoCallParticipants).values(
    newIds.map((userId) => ({
      callId: opts.callId,
      userId,
      invitedBy: opts.actorId,
    })),
  );

  await upsertVideoCallUsers(newIds);

  const call = streamClient().video.call(CALL_TYPE, opts.callId);
  await call.updateCallMembers({
    update_members: newIds.map((user_id) => ({ user_id })),
  });
  await addChatChannelMembers(opts.callId, newIds);

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
  );

  return { added: newIds };
}

/**
 * Quick task 260728-vce: stamps presence on (callId, userId) — `joinedAt =
 * now(), leftAt = null` — using Postgres' own clock (see the naive-timestamp
 * rationale in sendDueCallReminders' comment; same convention). Called from
 * ensureCallParticipant on EVERY join, including a rejoin of an
 * already-invited row, because a fresh `joinedAt` alone is what
 * re-establishes presence without ever needing to clear `leftAt` back to
 * null (see db/schema.ts's "currently present" comment).
 */
export async function markCallParticipantJoined(
  callId: string,
  userId: string,
): Promise<void> {
  await db
    .update(videoCallParticipants)
    .set({ joinedAt: sql`now()`, leftAt: null })
    .where(
      and(
        eq(videoCallParticipants.callId, callId),
        eq(videoCallParticipants.userId, userId),
      ),
    );
}

/**
 * Idempotently records `userId` as a participant when they open a call room
 * via a shared link rather than an explicit invite (no notification — they're
 * already looking at the page). Also adds them as a GetStream call member so
 * they can actually connect; a no-op if they're already a member either way.
 *
 * The existing-row early return skips only the insert + upsertUsers +
 * updateCallMembers + addChatChannelMembers work — this function ALWAYS
 * stamps presence on the way out via markCallParticipantJoined, because the
 * room page is the single join site and a rejoin must re-establish presence
 * even though the invite row already exists.
 */
export async function ensureCallParticipant(
  callId: string,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: videoCallParticipants.id })
    .from(videoCallParticipants)
    .where(
      and(
        eq(videoCallParticipants.callId, callId),
        eq(videoCallParticipants.userId, userId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db
      .insert(videoCallParticipants)
      .values({ callId, userId, invitedBy: null })
      .onConflictDoNothing();

    await upsertVideoCallUsers([userId]);

    const call = streamClient().video.call(CALL_TYPE, callId);
    await call.updateCallMembers({ update_members: [{ user_id: userId }] });
    await addChatChannelMembers(callId, [userId]);
  }

  await markCallParticipantJoined(callId, userId);
}

/**
 * Removes a single participant from an active call — deletes our own
 * video_call_participants row (this app's source of truth) and asks
 * GetStream to drop them from call membership too. Mirrors endVideoCall's
 * try/catch: a GetStream-side failure here is non-fatal — the DB row
 * deletion already reflects reality for every page in this app.
 */
export async function removeCallParticipant(
  callId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(videoCallParticipants)
    .where(
      and(
        eq(videoCallParticipants.callId, callId),
        eq(videoCallParticipants.userId, userId),
      ),
    );
  try {
    await streamClient()
      .video.call(CALL_TYPE, callId)
      .updateCallMembers({ remove_members: [userId] });
  } catch {
    // See comment above — our own row deletion is the source of truth.
  }
}

// Quick task 260728-vce: the single "currently present" predicate over
// video_call_participants, reused by markCallParticipantLeft's own-call
// check and sweepStaleCalls' presence aggregation below — expressed once so
// the two consumers in this file can never disagree. See db/schema.ts's
// column comment for the `leftAt < joinedAt` half's rationale (it's what
// lets rejoining work without ever clearing leftAt back to null).
const PRESENT_PREDICATE = sql`(${videoCallParticipants.joinedAt} is not null and (${videoCallParticipants.leftAt} is null or ${videoCallParticipants.leftAt} < ${videoCallParticipants.joinedAt}))`;

/**
 * Stamps `leftAt = now()` for (callId, userId), then — if this was the LAST
 * present participant on a still-active call — ends the call via the exact
 * same endVideoCall() the "End for everyone" button uses (never forked), so
 * the two ways a call can end can never diverge in status/endedAt/GetStream
 * behavior.
 *
 * Idempotent by construction: re-reading the call's status after stamping
 * leftAt means a second fire (unmount AND pagehide both racing, or a retried
 * beacon) on an already-ended call is a safe no-op that returns
 * `{ callEnded: false }` rather than calling endVideoCall twice.
 */
export async function markCallParticipantLeft(
  callId: string,
  userId: string,
): Promise<{ callEnded: boolean }> {
  await db
    .update(videoCallParticipants)
    .set({ leftAt: sql`now()` })
    .where(
      and(
        eq(videoCallParticipants.callId, callId),
        eq(videoCallParticipants.userId, userId),
      ),
    );

  const call = await getCall(callId);
  if (!call || call.status !== 'active') return { callEnded: false };

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(videoCallParticipants)
    .where(and(eq(videoCallParticipants.callId, callId), PRESENT_PREDICATE));
  const presentCount = Number(row?.count ?? 0);

  if (presentCount === 0) {
    await endVideoCall(callId);
    return { callEnded: true };
  }
  return { callEnded: false };
}

export async function endVideoCall(callId: string): Promise<void> {
  await db
    .update(videoCalls)
    .set({ status: 'ended', endedAt: new Date() })
    .where(eq(videoCalls.id, callId));
  try {
    await streamClient().video.call(CALL_TYPE, callId).end();
  } catch {
    // GetStream may already consider the call over (e.g. everyone already
    // left) — our own status update above is the source of truth every page
    // in this app actually reads from, so a failure here is non-fatal.
  }
}

export type MyCallSummary = VideoCallRow & { participants: CallParticipant[] };

/** Calls this user is part of, most recently created first. */
export async function getMyCalls(userId: string): Promise<MyCallSummary[]> {
  const callIds = await db
    .select({ callId: videoCallParticipants.callId })
    .from(videoCallParticipants)
    .where(eq(videoCallParticipants.userId, userId));
  if (callIds.length === 0) return [];

  const ids = callIds.map((r) => r.callId);
  const calls = await db
    .select()
    .from(videoCalls)
    .where(inArray(videoCalls.id, ids))
    .orderBy(desc(videoCalls.createdAt))
    .limit(30);

  const participantsByCall = await Promise.all(
    calls.map((c) => getCallParticipants(c.id)),
  );
  return calls.map((c, i) => ({ ...c, participants: participantsByCall[i] }));
}

/**
 * REM-01/REM-02 (quick task 260726-dw4): notifies invitees of every scheduled
 * call starting within the next hour, exactly once each. Called by the
 * CRON_SECRET-protected internal route (app/api/cron/call-reminders/route.ts)
 * on a 5-minute Netlify Scheduled Function trigger — never invoked directly
 * by any user-facing action.
 *
 * The due-call window comparison uses Postgres' own `now()` (via drizzle's
 * `sql` template), not a JS `new Date()` bind parameter — this repo has a
 * documented prior incident (quick task 260706-bpg) where a JS-side
 * timestamp compared against a naive (no-timezone) `timestamp` column landed
 * skewed by the app server's own UTC offset, silently breaking a freshness
 * window. Both the read (gt/lte below) and the write (reminderSentAt) follow
 * that same DB-clock convention.
 */
export async function sendDueCallReminders(): Promise<{ remindedCallIds: string[] }> {
  const dueCalls = await db
    .select()
    .from(videoCalls)
    .where(
      and(
        eq(videoCalls.status, 'active'),
        isNotNull(videoCalls.scheduledFor),
        gt(videoCalls.scheduledFor, sql`now()`),
        lte(videoCalls.scheduledFor, sql`now() + interval '1 hour'`),
        isNull(videoCalls.reminderSentAt),
      ),
    );

  const remindedCallIds: string[] = [];

  for (const call of dueCalls) {
    const participants = await db
      .select({ userId: videoCallParticipants.userId })
      .from(videoCallParticipants)
      .where(eq(videoCallParticipants.callId, call.id));
    const invitees = participants
      .map((p) => p.userId)
      .filter((id) => id !== call.createdBy);

    await Promise.all(
      invitees.map((recipientId) =>
        notifyUser({
          recipientId,
          actorId: call.createdBy,
          type: VIDEO_CALL_REMINDER_NOTIFICATION_TYPE,
          title: `${call.title ?? 'Video call'} starts in 1 hour`,
          body: null,
          callId: call.id,
        }),
      ),
    );

    await db
      .update(videoCalls)
      .set({ reminderSentAt: sql`now()` })
      .where(eq(videoCalls.id, call.id));

    remindedCallIds.push(call.id);
  }

  return { remindedCallIds };
}

export type SweepResult = {
  examined: number;
  endedCallIds: string[];
  skipped: { callId: string; reason: string }[];
};

/**
 * Quick task 260728-vce (T-vce-02): the authoritative backstop that ends
 * calls nobody could still be in — the event-driven leave path
 * (markCallParticipantLeft) is best-effort and can be dropped by a hard tab
 * kill, crash, or offline device, so this is what actually guarantees a
 * call doesn't stay ACTIVE forever. Called only by the CRON_SECRET-protected
 * route (app/api/cron/end-stale-calls/route.ts) on a 10-minute Netlify
 * Scheduled Function trigger — never invoked directly by any user-facing
 * action.
 *
 * Every end/skip decision is delegated to evaluateCallForSweep (the pure,
 * exhaustively-tested predicate in lib/call-sweep.ts) — this function's own
 * job is only to gather each candidate's shape and act on the verdict, never
 * to re-implement the thresholds itself.
 */
export async function sweepStaleCalls(): Promise<SweepResult> {
  // DB clock, not `new Date()` — same naive-timestamp rationale as
  // sendDueCallReminders above (quick task 260706-bpg's incident).
  const nowResult = await db.execute<{ now: Date | string }>(sql`select now() as now`);
  const now = new Date(nowResult.rows[0]?.now ?? Date.now());

  const candidates = await db
    .select({
      id: videoCalls.id,
      createdAt: videoCalls.createdAt,
      scheduledFor: videoCalls.scheduledFor,
    })
    .from(videoCalls)
    .where(and(eq(videoCalls.status, 'active'), isNull(videoCalls.endedAt)));

  if (candidates.length === 0) {
    return { examined: 0, endedCallIds: [], skipped: [] };
  }

  const callIds = candidates.map((c) => c.id);

  // One grouped query over video_call_participants for every candidate call
  // at once, rather than one query per call — presentCount/everJoined/
  // lastLeftAt per call, using the exact same PRESENT_PREDICATE
  // markCallParticipantLeft uses above, so the two can never disagree on
  // what "present" means.
  const presenceRows = await db
    .select({
      callId: videoCallParticipants.callId,
      presentCount: sql<number>`count(*) filter (where ${PRESENT_PREDICATE})`,
      everJoined: sql<boolean>`bool_or(${videoCallParticipants.joinedAt} is not null)`,
      lastLeftAt: sql<Date | null>`max(${videoCallParticipants.leftAt})`,
    })
    .from(videoCallParticipants)
    .where(inArray(videoCallParticipants.callId, callIds))
    .groupBy(videoCallParticipants.callId);

  const presenceByCallId = new Map(
    presenceRows.map((r) => [
      r.callId,
      {
        presentCount: Number(r.presentCount ?? 0),
        everJoined: Boolean(r.everJoined),
        lastLeftAt: r.lastLeftAt ? new Date(r.lastLeftAt) : null,
      },
    ]),
  );

  const skipped: { callId: string; reason: string }[] = [];
  const survivors: string[] = [];

  for (const call of candidates) {
    const presence = presenceByCallId.get(call.id) ?? {
      presentCount: 0,
      everJoined: false,
      lastLeftAt: null,
    };
    const sweepCandidate: SweepCandidate = {
      callId: call.id,
      createdAt: call.createdAt,
      scheduledFor: call.scheduledFor,
      presentCount: presence.presentCount,
      everJoined: presence.everJoined,
      lastLeftAt: presence.lastLeftAt,
    };
    const decision = evaluateCallForSweep(sweepCandidate, now);
    if (!decision.sweep) {
      skipped.push({ callId: call.id, reason: decision.reason });
      continue;
    }
    survivors.push(call.id);
  }

  const endedCallIds: string[] = [];

  for (const callId of survivors) {
    // Deploy-time mitigation: every participant row that predates this task
    // has joined_at = NULL, so any call in progress at deploy that was
    // created over NEVER_JOINED_MINUTES ago looks "never joined" to the
    // predicate — the room page re-stamps joinedAt on render, but a tab that
    // is ALREADY open does not re-render. This best-effort GetStream
    // live-session check is the mitigation for exactly that one-time
    // window: if GetStream itself reports live participants, skip ending
    // the call even though our own DB thinks it's stale. Wrapped in
    // try/catch: a GetStream error (including "call not found", which must
    // count as NOT live) proceeds with the DB decision — the thresholds
    // are already conservative — never blocks our own DB update, same
    // contract as endVideoCall's own best-effort GetStream calls.
    let liveOnGetStream = false;
    try {
      const res = await streamClient().video.call(CALL_TYPE, callId).get();
      const liveParticipants = res.call.session?.participants ?? [];
      liveOnGetStream = liveParticipants.length > 0;
    } catch {
      liveOnGetStream = false;
    }

    if (liveOnGetStream) {
      skipped.push({ callId, reason: 'getstream-live-session-veto' });
      continue;
    }

    await endVideoCall(callId);
    endedCallIds.push(callId);
  }

  return { examined: candidates.length, endedCallIds, skipped };
}
