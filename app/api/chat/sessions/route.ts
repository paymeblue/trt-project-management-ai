import { NextRequest } from 'next/server'
import { db } from '@/db'
import { chatSessions } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { eq, and, desc } from 'drizzle-orm'

/** List the caller's conversations, most recently used first. */
export async function GET() {
  const { userId } = await verifySession()

  const rows = await db
    .select({ id: chatSessions.id, title: chatSessions.title, updatedAt: chatSessions.updatedAt })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(100)

  return Response.json({ sessions: rows })
}

/** Delete one of the caller's conversations (cascades its messages). Requires ?id. */
export async function DELETE(req: NextRequest) {
  const { userId } = await verifySession()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ ok: false }, { status: 400 })

  await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))

  return Response.json({ ok: true })
}
