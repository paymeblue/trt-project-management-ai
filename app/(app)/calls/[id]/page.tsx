import { ne } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifySession, isAdminRole } from '@/lib/dal'
import { roleDashboard } from '@/lib/workflow'
import { getCall, getCallParticipants, ensureCallParticipant, mintVideoToken } from '@/lib/video-calls'
import { mintChatToken } from '@/lib/video-chat'
import { toTitleCase } from '@/lib/text-case'
import VideoCallRoom from '@/app/_components/video-call-room'

export const dynamic = 'force-dynamic'

export default async function CallRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId, role } = await verifySession()
  const dashboard = roleDashboard(role)

  const call = await getCall(id)

  function shell(children: React.ReactNode) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/calls" className="text-sm text-primary hover:underline">
          ← Video Calls
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    )
  }

  if (!call) {
    return shell(<p className="text-sm text-gray-500">This call could not be found.</p>)
  }

  if (call.status !== 'active') {
    return shell(
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm font-semibold text-gray-700">This call has ended.</p>
        <a href={dashboard} className="mt-2 inline-block text-sm text-primary hover:underline">
          Back to dashboard
        </a>
      </div>,
    )
  }

  // Joining via a shared link records participation even if this user wasn't
  // explicitly invited — being on the link (a random, unguessable id) behind
  // this app's own auth is treated as sufficient authorization, matching how
  // most meeting-link tools work. No notification fires for this case (see
  // ensureCallParticipant) — the user is already looking at the page.
  await ensureCallParticipant(id, userId)

  const [participants, rawUsers] = await Promise.all([
    getCallParticipants(id),
    db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(ne(users.id, userId))
      .orderBy(users.name),
  ])
  const allUsers = rawUsers.map((u) => ({ ...u, name: toTitleCase(u.name) }))

  const { apiKey, token } = mintVideoToken(userId, id)
  const chatToken = mintChatToken(userId)
  const isAdmin = isAdminRole(role)
  const scheduledForFuture =
    call.scheduledFor && call.scheduledFor.getTime() > new Date().getTime() ? call.scheduledFor.toISOString() : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
      <Link href="/calls" className="text-sm text-primary hover:underline">
        ← Video Calls
      </Link>
      <div className="mt-4">
        <VideoCallRoom
          apiKey={apiKey}
          userId={userId}
          userName={participants.find((p) => p.userId === userId)?.name ?? 'You'}
          token={token}
          chatToken={chatToken}
          callId={id}
          title={call.title}
          isCreator={call.createdBy === userId}
          isAdmin={isAdmin}
          creatorId={call.createdBy}
          participants={participants}
          allUsers={allUsers}
          dashboard={dashboard}
          scheduledFor={scheduledForFuture}
        />
      </div>
    </div>
  )
}
