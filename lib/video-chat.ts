import 'server-only';
import { StreamChat } from 'stream-chat';
import { requiredEnv } from '@/lib/video-calls';

// ── GetStream-backed in-call chat ───────────────────────────────────────────
// Chat is a SEPARATE GetStream product from video (@stream-io/node-sdk's
// StreamClient has no .channel()/.chat method) — this mirrors
// lib/video-calls.ts's structure but wraps a second, independent client
// (stream-chat's StreamChat), reusing the same GETSTREAM_APIKEY/SECRET pair.
// One 'messaging' channel per call, id-mapped to the call id — mirrors how a
// video_calls.id already doubles as the GetStream video call id.
const TOKEN_TTL_SECONDS = 60 * 60;

let cachedChatClient: StreamChat | null = null;
function chatServerClient(): StreamChat {
  if (!cachedChatClient) {
    const apiKey = requiredEnv('GETSTREAM_APIKEY');
    const secret = requiredEnv('GETSTREAM_SECRET');
    cachedChatClient = StreamChat.getInstance(apiKey, secret, {
      disableCache: true,
    });
  }
  return cachedChatClient;
}

/** Mints a fresh GetStream Chat user token — never expose GETSTREAM_SECRET to the client. */
export function mintChatToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return chatServerClient().createToken(userId, exp);
}

/**
 * Idempotent — safe to call every time a call is created or a participant
 * opens the room. GetStream treats channel().create() as get-or-create for
 * the same type+id pair, mirroring the video side's call.getOrCreate().
 */
export async function getOrCreateChatChannel(
  callId: string,
  memberIds: string[],
): Promise<void> {
  const channel = chatServerClient().channel('messaging', callId, {
    members: memberIds,
    created_by_id: memberIds[0],
  });
  await channel.create();
}

/** Adds members to an already-created channel — no-op-safe for already-present members. */
export async function addChatChannelMembers(
  callId: string,
  newUserIds: string[],
): Promise<void> {
  const channel = chatServerClient().channel('messaging', callId);
  await channel.addMembers(newUserIds);
}
