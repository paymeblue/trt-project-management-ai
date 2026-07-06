import { NextRequest } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { conversationParticipants } from '@/db/schema'
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

// Cheap typing heartbeat — stamps lastTypingAt for the caller in this conversation.
export async function POST(req: NextRequest) {
  const { userId } = await verifySession()
  const { conversationId } = await req.json()
  if (!conversationId) return Response.json({ error: 'Missing conversation' }, { status: 400 })
  if (!(await isParticipant(conversationId, userId)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  await db
    .update(conversationParticipants)
    // DB clock, not new Date(): JS-side timestamps land skewed by the server's
    // UTC offset in this naive-timestamp column, breaking the freshness window.
    .set({ lastTypingAt: sql`now()` })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )

  return Response.json({ ok: true })
}
