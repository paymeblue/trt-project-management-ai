'use client'

import { useMemo } from 'react'
import { Chat, Channel, Window, MessageList, MessageComposer, useCreateChatClient } from 'stream-chat-react'
import type { StreamChat } from 'stream-chat'
import 'stream-chat-react/css/index.css'

// Docked, toggleable in-call chat panel — exactly one fixed 'messaging'
// channel per call (id-mapped to the call id), no ChannelList/Thread (this
// isn't a multi-channel inbox). Uses useCreateChatClient over a manual
// `new StreamChat(...)` so connect/disconnect lifecycle (including
// disconnectUser() on unmount) is handled for us.
export default function CallChatPanel({
  apiKey,
  userId,
  userName,
  token,
  callId,
}: {
  apiKey: string
  userId: string
  userName: string
  token: string
  callId: string
}) {
  const client = useCreateChatClient({
    apiKey,
    tokenOrProvider: token,
    userData: { id: userId, name: userName },
  })

  if (!client) {
    return <div className="p-3 text-xs text-gray-400">Setting up chat…</div>
  }

  return (
    <Chat client={client}>
      <ChannelChat client={client} callId={callId} />
    </Chat>
  )
}

// Split out so channel lookup only runs once the client is actually
// connected, mirroring video-call-room.tsx's own CallRoomInner split.
function ChannelChat({ client, callId }: { client: StreamChat; callId: string }) {
  const channel = useMemo(() => client.channel('messaging', callId), [client, callId])
  return (
    <Channel channel={channel}>
      <Window>
        <MessageList />
        <MessageComposer />
      </Window>
    </Channel>
  )
}
