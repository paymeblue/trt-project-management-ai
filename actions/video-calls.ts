'use server'

import { revalidatePath } from 'next/cache'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySessionForAction, isAdminRole } from '@/lib/dal'
import type { UserRole } from '@/lib/workflow'
import {
  createVideoCall,
  addVideoCallParticipants,
  endVideoCall,
  getCall,
  getCallParticipants,
  removeCallParticipant,
} from '@/lib/video-calls'

export type VideoCallActionState = { status: 'idle' | 'success' | 'error'; message?: string; callId?: string }

const MAX_TITLE = 120
// A sane cap, not a GetStream limit — this is a small internal team tool, not
// a broadcast/webinar product; a call with more "participants" than that is
// almost certainly a misclick on the picker.
const MAX_PARTICIPANTS = 25

async function validateUserIds(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))
  return rows.length === ids.length
}

export async function createVideoCallAction(
  tabToken: string | null,
  input: { title?: string; participantUserIds: string[] },
): Promise<VideoCallActionState> {
  const { userId } = await verifySessionForAction(tabToken)

  const participantUserIds = [
    ...new Set((input.participantUserIds ?? []).filter((id) => typeof id === 'string' && id !== userId)),
  ]
  if (participantUserIds.length === 0) {
    return { status: 'error', message: 'Pick at least one other person to call.' }
  }
  if (participantUserIds.length > MAX_PARTICIPANTS) {
    return { status: 'error', message: `A call can have at most ${MAX_PARTICIPANTS} other people.` }
  }
  // Server-side membership check — never trust the client's user-id list.
  if (!(await validateUserIds(participantUserIds))) {
    return { status: 'error', message: 'One of the selected people could not be found.' }
  }

  const title = (input.title ?? '').trim().slice(0, MAX_TITLE) || null
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)

  try {
    const { id } = await createVideoCall({
      creatorId: userId,
      creatorName: me?.name ?? 'Someone',
      title,
      participantUserIds,
    })
    revalidatePath('/calls')
    return { status: 'success', callId: id }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not start the call.' }
  }
}

export async function addVideoCallParticipantsAction(
  tabToken: string | null,
  input: { callId: string; userIds: string[] },
): Promise<VideoCallActionState> {
  const { userId } = await verifySessionForAction(tabToken)

  const call = await getCall(input.callId)
  if (!call) return { status: 'error', message: 'Call not found.' }
  if (call.status !== 'active') return { status: 'error', message: 'This call has ended.' }

  const existing = await getCallParticipants(input.callId)
  if (!existing.some((p) => p.userId === userId)) {
    return { status: 'error', message: 'Only people already on this call can add others.' }
  }

  const userIds = [...new Set((input.userIds ?? []).filter((id) => typeof id === 'string'))]
  if (userIds.length === 0) return { status: 'error', message: 'Pick at least one person to add.' }
  if (existing.length + userIds.length > MAX_PARTICIPANTS) {
    return { status: 'error', message: `A call can have at most ${MAX_PARTICIPANTS} other people.` }
  }
  if (!(await validateUserIds(userIds))) {
    return { status: 'error', message: 'One of the selected people could not be found.' }
  }

  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)

  try {
    await addVideoCallParticipants({
      callId: input.callId,
      actorId: userId,
      actorName: me?.name ?? 'Someone',
      userIds,
    })
    revalidatePath(`/calls/${input.callId}`)
    return { status: 'success' }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not add participants.' }
  }
}

export async function endVideoCallAction(
  tabToken: string | null,
  input: { callId: string },
): Promise<VideoCallActionState> {
  const { userId, role } = await verifySessionForAction(tabToken)

  const call = await getCall(input.callId)
  if (!call) return { status: 'error', message: 'Call not found.' }
  if (call.status !== 'active') return { status: 'success' } // already ended — idempotent
  if (call.createdBy !== userId && !isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only whoever started this call, or an admin, can end it for everyone.' }
  }

  try {
    await endVideoCall(input.callId)
    revalidatePath(`/calls/${input.callId}`)
    revalidatePath('/calls')
    return { status: 'success' }
  } catch {
    return { status: 'error', message: 'Could not end the call.' }
  }
}

export async function removeVideoCallParticipantAction(
  tabToken: string | null,
  input: { callId: string; userId: string },
): Promise<VideoCallActionState> {
  const { userId, role } = await verifySessionForAction(tabToken)

  const call = await getCall(input.callId)
  if (!call) return { status: 'error', message: 'Call not found.' }
  if (call.status !== 'active') return { status: 'error', message: 'This call has ended.' }
  if (call.createdBy !== userId && !isAdminRole(role as UserRole)) {
    return { status: 'error', message: 'Only whoever started this call, or an admin, can remove someone.' }
  }
  if (input.userId === call.createdBy) {
    return { status: 'error', message: "The call creator can't be removed." }
  }

  try {
    await removeCallParticipant(input.callId, input.userId)
    revalidatePath(`/calls/${input.callId}`)
    return { status: 'success' }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Could not remove that person.' }
  }
}
