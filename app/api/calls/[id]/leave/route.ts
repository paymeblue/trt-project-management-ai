import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { videoCallParticipants } from '@/db/schema';
import { verifySession } from '@/lib/dal';
import { markCallParticipantLeft } from '@/lib/video-calls';

export const dynamic = 'force-dynamic';

// Quick task 260728-vce (T-vce-01): the beacon target for a call room's
// unmount/pagehide exit paths (app/_components/video-call-room.tsx's
// notifyServerLeft). Best-effort by nature — a hard tab kill, crash, or
// offline device can all drop this request; the scheduled sweep
// (sweepStaleCalls) is the authoritative backstop for exactly those cases,
// not this route.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // verifySession() redirect()s (throws NEXT_REDIRECT) on an unauthenticated
  // caller — a fire-and-forget keepalive beacon must never surface that as
  // an uncaught throw, so it's caught here and turned into a plain 401.
  let userId: string;
  try {
    ({ userId } = await verifySession());
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // userId is derived ONLY from the session, never from the request body —
  // accepting a body-supplied userId would let any signed-in caller mark
  // someone ELSE as gone and force-end a call they're not even in (T-vce-01).
  const [participant] = await db
    .select({ id: videoCallParticipants.id })
    .from(videoCallParticipants)
    .where(
      and(
        eq(videoCallParticipants.callId, id),
        eq(videoCallParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!participant) {
    return NextResponse.json({ error: 'not a participant' }, { status: 403 });
  }

  const { callEnded } = await markCallParticipantLeft(id, userId);
  return NextResponse.json({ ok: true, callEnded });
}
