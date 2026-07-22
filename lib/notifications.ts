import 'server-only'
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { notifications, users, projects } from '@/db/schema'
import { Roles } from '@/lib/workflow'

// The three notification types that carry a projectId and route to
// /disputes/{projectId} when clicked (see notifications-bell.tsx's
// NO_NAVIGATE_TYPES for the inverse set: assignment/approval_request/
// approval_rejected/step_turn all navigate elsewhere or nowhere).
// Deliberately NOT role-gated: escalation targets span multiple roles
// (super_admin, operations, and design for Head of Design), so "who can see
// Disputes" is naturally answered by "who actually has one," not a
// hardcoded role list.
export const DISPUTE_NOTIFICATION_TYPES = ['escalation', 'bypass_request', 'pause_flag'] as const

export type NotificationDTO = {
  id: string
  type: string
  title: string
  body: string | null
  projectId: string | null
  callId: string | null
  read: boolean
  createdAt: string
}

// The one notification type that carries a callId and routes to
// /calls/{callId} when clicked (see notifications-bell.tsx).
export const VIDEO_CALL_NOTIFICATION_TYPE = 'video_call'

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
  callId?: string | null
  actorId?: string | null
}): Promise<void> {
  if (input.recipientId === input.actorId) return
  await db.insert(notifications).values({
    recipientId: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    projectId: input.projectId ?? null,
    callId: input.callId ?? null,
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
      callId: r.callId,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread: Number(n),
  }
}

// Sidebar badge count — total unread video-call notifications for this user
// (mirrors getDisputeUnreadCount's shape exactly, different type filter).
export async function getVideoCallUnreadCount(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        eq(notifications.type, VIDEO_CALL_NOTIFICATION_TYPE),
      ),
    )
  return Number(n)
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

export type DisputeListItem = {
  projectId: string
  projectName: string
  unreadCount: number
  latestTitle: string
  latestBody: string | null
  latestType: string
  latestCreatedAt: string
}

// Sidebar badge count — total unread dispute-routing notifications for this
// user, across all projects. Deliberately does NOT touch getMyWork/pending:
// a dispute is never allowed to gate or appear in the escalating user's own
// step-completion flow (their checklist submission must keep advancing the
// workflow exactly as today) — this is a separate, supervisor-facing signal
// only.
export async function getDisputeUnreadCount(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        inArray(notifications.type, [...DISPUTE_NOTIFICATION_TYPES]),
      ),
    )
  return Number(n)
}

// One row per project this user has ever been notified about (dispute-routing
// types), most recently active first, with a per-project unread count and the
// latest notification's own title/body/type as a preview.
export async function getDisputeList(userId: string): Promise<DisputeListItem[]> {
  const rows = await db
    .select({
      projectId: notifications.projectId,
      projectName: projects.name,
      readAt: notifications.readAt,
      title: notifications.title,
      body: notifications.body,
      type: notifications.type,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(
      and(
        eq(notifications.recipientId, userId),
        inArray(notifications.type, [...DISPUTE_NOTIFICATION_TYPES]),
      ),
    )
    .orderBy(desc(notifications.createdAt))

  const byProject = new Map<string, DisputeListItem>()
  for (const r of rows) {
    if (!r.projectId) continue
    const existing = byProject.get(r.projectId)
    if (existing) {
      if (r.readAt === null) existing.unreadCount += 1
      continue
    }
    byProject.set(r.projectId, {
      projectId: r.projectId,
      projectName: r.projectName ?? 'Unknown project',
      unreadCount: r.readAt === null ? 1 : 0,
      latestTitle: r.title,
      latestBody: r.body,
      latestType: r.type,
      latestCreatedAt: r.createdAt.toISOString(),
    })
  }
  return [...byProject.values()]
}

// Marks every one of THIS user's unread dispute-routing notifications for
// ONE project as read — called when they open that project's dispute
// thread, which is what "attending to it" means for clearing the badge.
export async function markProjectDisputeNotificationsRead(
  userId: string,
  projectId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.projectId, projectId),
        isNull(notifications.readAt),
        inArray(notifications.type, [...DISPUTE_NOTIFICATION_TYPES]),
      ),
    )
}
