import { NextRequest } from 'next/server'
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { conversations, conversationParticipants, messages, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

// List my conversations with the other participant, last message preview, and
// unread count (messages from others newer than my lastReadAt).
export async function GET() {
  const { userId } = await verifySession()

  const mine = await db
    .select({ conversationId: conversationParticipants.conversationId, lastReadAt: conversationParticipants.lastReadAt })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId))

  const result = []
  for (const c of mine) {
    const [other] = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(
        and(
          eq(conversationParticipants.conversationId, c.conversationId),
          ne(conversationParticipants.userId, userId),
        ),
      )
      .limit(1)
    if (!other) continue

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

    result.push({
      conversationId: c.conversationId,
      other,
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

// Find or create a 1:1 conversation with another user.
export async function POST(req: NextRequest) {
  const { userId } = await verifySession()
  const { userId: otherId } = await req.json()
  if (!otherId || otherId === userId) return Response.json({ error: 'Invalid user' }, { status: 400 })

  // A conversation where both are participants = intersection of their conv ids.
  const mineIds = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId))
  const otherIds = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, otherId))
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
