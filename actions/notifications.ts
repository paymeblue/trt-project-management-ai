'use server'

import { verifySessionForAction } from '@/lib/dal'
import { markNotificationsRead } from '@/lib/notifications'

// Marks one notification (by id) or all of the caller's unread ones as read.
// Takes the per-tab token as an explicit bound argument (D-20.1-04-A): Server
// Action POSTs never carry the Authorization header the fetch override adds,
// so a bare verifySession() here would resolve the SHARED cookie's user and
// mark the wrong person's notifications read in a per-tab session tab.
export async function markNotificationsReadAction(
  tabToken: string | null,
  id?: string,
): Promise<void> {
  const { userId } = await verifySessionForAction(tabToken)
  await markNotificationsRead(userId, id)
}
