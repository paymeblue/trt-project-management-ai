import { NextRequest } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { conversationParticipants, messages, users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

const MAX_ATTACH = 6_000_000 // ~4.4MB once base64-encoded

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
  if (!conversationId) return Response.json({ messages: [] })
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

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )

  return Response.json({ messages: rows, meId: userId })
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
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )

  return Response.json({ ok: true, id: msg.id })
}
