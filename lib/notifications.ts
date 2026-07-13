import 'server-only'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { notifications, users } from '@/db/schema'
import { Roles } from '@/lib/workflow'

export type NotificationDTO = {
  id: string
  type: string
  title: string
  body: string | null
  projectId: string | null
  read: boolean
  createdAt: string
}

export type NotificationFeed = { items: NotificationDTO[]; unread: number }

// Fan a single alert out to every super admin (REQ-G06), one row per recipient
// so read state is per-user. Never self-notifies the actor.
export async function notifyAllSuperAdmins(input: {
  type: string
  title: string
  body?: string | null
  projectId?: string | null
  actorId?: string | null
}): Promise<void> {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, Roles.SuperAdmin))

  const rows = admins
    .filter((a) => a.id !== input.actorId)
    .map((a) => ({
      recipientId: a.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      projectId: input.projectId ?? null,
      actorId: input.actorId ?? null,
    }))
  if (rows.length) await db.insert(notifications).values(rows)
}

// Notify a single recipient (e.g. a workflow-step assignee). Never self-notifies
// when recipientId === actorId (mirrors notifyAllSuperAdmins' self-exclusion) —
// in case an actor assigns a step to themselves.
export async function notifyUser(input: {
  recipientId: string
  type: string
  title: string
  body?: string | null
  projectId?: string | null
  actorId?: string | null
}): Promise<void> {
  if (input.recipientId === input.actorId) return
  await db.insert(notifications).values({
    recipientId: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    projectId: input.projectId ?? null,
    actorId: input.actorId ?? null,
  })
}

// The caller's own recent notifications + a total unread count.
export async function getNotifications(userId: string): Promise<NotificationFeed> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(30)

  const [{ n }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)))

  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      projectId: r.projectId,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread: Number(n),
  }
}

// Mark one (by id) or all of the caller's unread notifications as read.
export async function markNotificationsRead(userId: string, id?: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        ...(id ? [eq(notifications.id, id)] : []),
      ),
    )
}
