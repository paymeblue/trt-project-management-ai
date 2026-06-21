import { ne, asc } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession } from '@/lib/dal'

// Everyone the current user can start a chat with.
export async function GET() {
  const { userId } = await verifySession()
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(ne(users.id, userId))
    .orderBy(asc(users.name))
  return Response.json({ users: rows })
}
