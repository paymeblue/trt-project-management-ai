import { NextRequest } from 'next/server'
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { conversationParticipants, messageReactions, messages, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

const MAX_ATTACH = 6_000_000 // ~4.4MB once base64-encoded
const TYPING_WINDOW_MS = 6_000

async function isParticipant(conversationId: string, userId: string) {
  const [p] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1)
  return !!p
}

// Load a thread (and mark it read for the current user).
export async function GET(req: NextRequest) {
  const { userId } = await verifySession()
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return Response.json({ messages: [], meId: userId, typers: [] })
  if (!(await isParticipant(conversationId, userId)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.name,
      body: messages.body,
      attachmentData: messages.attachmentData,
      attachmentName: messages.attachmentName,
      attachmentType: messages.attachmentType,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(500)

  const msgIds = rows.map((r) => r.id)
  const reactionsByMsg = new Map<string, Map<string, { count: number; mine: boolean }>>()
  if (msgIds.length > 0) {
    const reactionRows = await db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, msgIds))

    for (const r of reactionRows) {
      let byEmoji = reactionsByMsg.get(r.messageId)
      if (!byEmoji) {
        byEmoji = new Map()
        reactionsByMsg.set(r.messageId, byEmoji)
      }
      const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false }
      cur.count += 1
      if (r.userId === userId) cur.mine = true
      byEmoji.set(r.emoji, cur)
    }
  }

  const messagesWithReactions = rows.map((r) => ({
    ...r,
    reactions: Array.from(reactionsByMsg.get(r.id)?.entries() ?? []).map(([emoji, v]) => ({
      emoji,
      count: v.count,
      mine: v.mine,
    })),
  }))

  const typers = await db
    .select({ id: users.id, name: users.name })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, userId),
        // Compare against the DB clock — lastTypingAt is stamped with now() in
        // the typing route; a JS Date here would be skewed by the server's UTC offset.
        gt(conversationParticipants.lastTypingAt, sql`now() - interval '${sql.raw(String(TYPING_WINDOW_MS / 1000))} seconds'`),
      ),
    )

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )

  return Response.json({ messages: messagesWithReactions, meId: userId, typers })
}

// Send a message (optionally with an attachment).
export async function POST(req: NextRequest) {
  const { userId } = await verifySession()
  const body = await req.json()
  const conversationId: string = body.conversationId ?? ''
  const text: string = (body.body ?? '').toString()
  const attachmentData: string | null = body.attachmentData ?? null
  const attachmentName: string | null = body.attachmentName ?? null
  const attachmentType: string | null = body.attachmentType ?? null

  if (!conversationId) return Response.json({ error: 'Missing conversation' }, { status: 400 })
  if (!(await isParticipant(conversationId, userId)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!text.trim() && !attachmentData)
    return Response.json({ error: 'Empty message' }, { status: 400 })
  if (attachmentData && attachmentData.length > MAX_ATTACH)
    return Response.json({ error: 'Attachment too large (max ~4MB).' }, { status: 400 })

  const [msg] = await db
    .insert(messages)
    .values({ conversationId, senderId: userId, body: text, attachmentData, attachmentName, attachmentType })
    .returning({ id: messages.id })

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: sql`now()` })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )

  return Response.json({ ok: true, id: msg.id })
}
