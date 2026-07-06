import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { conversationParticipants, messageReactions, messages } from '@/db/schema'
import { verifySession } from '@/lib/dal'

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

// Toggle a reaction on a message (add if absent, remove if already present).
export async function POST(req: NextRequest) {
  const { userId } = await verifySession()
  const body = await req.json()
  const messageId: string = body.messageId ?? ''
  const emoji: string = (body.emoji ?? '').toString()
  if (!messageId || !emoji) return Response.json({ error: 'Missing messageId or emoji' }, { status: 400 })

  const [msg] = await db
    .select({ conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
  if (!msg) return Response.json({ error: 'Message not found' }, { status: 404 })
  if (!(await isParticipant(msg.conversationId, userId)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .limit(1)

  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id))
  } else {
    await db.insert(messageReactions).values({ messageId, userId, emoji })
  }

  return Response.json({ ok: true })
}
