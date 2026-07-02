'use server'

import { verifySession } from '@/lib/dal'
import { markNotificationsRead } from '@/lib/notifications'

// Marks one notification (by id) or all of the caller's unread ones as read.
export async function markNotificationsReadAction(id?: string): Promise<void> {
  const { userId } = await verifySession()
  await markNotificationsRead(userId, id)
}
