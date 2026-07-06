import { NextRequest } from 'next/server'
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { conversations, conversationParticipants, messages, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

// List my conversations with the other participant(s), last message preview, and
// unread count (messages from others newer than my lastReadAt).
export async function GET() {
  const { userId } = await verifySession()

  const mine = await db
    .select({
      conversationId: conversationParticipants.conversationId,
      lastReadAt: conversationParticipants.lastReadAt,
      isGroup: conversations.isGroup,
      title: conversations.title,
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .where(eq(conversationParticipants.userId, userId))

  const result = []
  for (const c of mine) {
    const others = await db
      .select({ id: users.id, name: users.name, role: users.role, email: users.email })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(
        and(
          eq(conversationParticipants.conversationId, c.conversationId),
          ne(conversationParticipants.userId, userId),
        ),
      )
    if (others.length === 0) continue
    const other = others[0]

    const [last] = await db
      .select({ body: messages.body, attachmentName: messages.attachmentName, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, c.conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, c.conversationId),
          ne(messages.senderId, userId),
          c.lastReadAt ? gt(messages.createdAt, c.lastReadAt) : sql`true`,
        ),
      )

    const name = c.title?.trim()
      ? c.title.trim()
      : c.isGroup
        ? others.map((o) => o.name).join(', ')
        : other.name

    result.push({
      conversationId: c.conversationId,
      other,
      others,
      isGroup: c.isGroup,
      title: c.title,
      name,
      lastMessage: last
        ? { preview: last.body || (last.attachmentName ? `📎 ${last.attachmentName}` : ''), at: last.createdAt }
        : null,
      unread: count ?? 0,
    })
  }

  result.sort((a, b) => {
    const at = a.lastMessage?.at ? new Date(a.lastMessage.at).getTime() : 0
    const bt = b.lastMessage?.at ? new Date(b.lastMessage.at).getTime() : 0
    return bt - at
  })

  const totalUnread = result.reduce((s, r) => s + r.unread, 0)
  return Response.json({ conversations: result, totalUnread })
}

// Find or create a 1:1 conversation with another user, OR create a new group
// conversation when `userIds` (length >= 2) is provided.
export async function POST(req: NextRequest) {
  const { userId } = await verifySession()
  const body = await req.json()

  if (Array.isArray(body.userIds) && body.userIds.length >= 2) {
    const title: string | null = typeof body.title === 'string' ? body.title.trim() || null : null
    const otherIds = Array.from(
      new Set((body.userIds as unknown[]).filter((id): id is string => typeof id === 'string' && id !== userId)),
    )

    const [conv] = await db
      .insert(conversations)
      .values({ createdBy: userId, isGroup: true, title })
      .returning({ id: conversations.id })

    const participantIds = Array.from(new Set([userId, ...otherIds]))
    await db
      .insert(conversationParticipants)
      .values(participantIds.map((id) => ({ conversationId: conv.id, userId: id })))

    return Response.json({ conversationId: conv.id })
  }

  const { userId: otherId } = body
  if (!otherId || otherId === userId) return Response.json({ error: 'Invalid user' }, { status: 400 })

  // A 1:1 conversation where both are participants = intersection of their conv
  // ids, restricted to non-group conversations (groups must never be reused here).
  const mineIds = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .where(and(eq(conversationParticipants.userId, userId), eq(conversations.isGroup, false)))
  const otherIds = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .where(and(eq(conversationParticipants.userId, otherId), eq(conversations.isGroup, false)))
  const otherSet = new Set(otherIds.map((r) => r.id))
  const shared = mineIds.find((r) => otherSet.has(r.id))
  if (shared) return Response.json({ conversationId: shared.id })

  const [conv] = await db
    .insert(conversations)
    .values({ createdBy: userId })
    .returning({ id: conversations.id })
  await db.insert(conversationParticipants).values([
    { conversationId: conv.id, userId },
    { conversationId: conv.id, userId: otherId },
  ])

  return Response.json({ conversationId: conv.id })
}
