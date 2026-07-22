'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  SpeakerLayout,
  CallControls,
  CallingState,
  useCallStateHooks,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { endVideoCallAction } from '@/actions/video-calls'
import AddCallParticipants from '@/app/_components/add-call-participants'
import { getTabToken } from '@/lib/use-tab-token'

export type CallParticipantInfo = { userId: string; name: string; role: string }

export default function VideoCallRoom({
  apiKey,
  userId,
  userName,
  token,
  callId,
  title,
  isCreator,
  participants,
  allUsers,
  dashboard,
}: {
  apiKey: string
  userId: string
  userName: string
  token: string
  callId: string
  title: string | null
  isCreator: boolean
  participants: CallParticipantInfo[]
  allUsers: { id: string; name: string; role: string }[]
  dashboard: string
}) {
  const router = useRouter()
  const client = useMemo(
    () => new StreamVideoClient({ apiKey, user: { id: userId, name: userName }, token }),
    [apiKey, userId, userName, token],
  )
  const call = useMemo(() => client.call('default', callId), [client, callId])

  // Surfaced as a real banner below, not just CallControls' small warning
  // badge on the camera/mic buttons — a denied/missing device is easy to
  // miss otherwise, and "check your browser permissions" isn't obvious from
  // an icon alone.
  const [mediaBlocked, setMediaBlocked] = useState<{ camera: boolean; microphone: boolean }>({
    camera: false,
    microphone: false,
  })

  useEffect(() => {
    call
      .join()
      .then(() => {
        // Camera/mic start OFF by default (SpeakerLayout/CallControls show
        // the crossed-out red icons until manually toggled) — "like Zoom"
        // means video is on the moment you join, not an extra click. Each
        // enable() is independent: a denied/missing camera must never block
        // the mic (or vice versa), so they're caught separately rather than
        // Promise.all'd.
        call.camera.enable().catch(() => setMediaBlocked((s) => ({ ...s, camera: true })))
        call.microphone.enable().catch(() => setMediaBlocked((s) => ({ ...s, microphone: true })))
      })
      .catch(() => {
        // Surfaced inside CallRoomInner via the call's own connection state —
        // no separate error UI needed here.
      })
    return () => {
      call.leave().catch(() => {
        // Already disconnected (e.g. tab closing) — nothing to clean up.
      })
    }
  }, [call])

  const [copied, setCopied] = useState(false)
  const [ending, startEndTransition] = useTransition()
  const [endError, setEndError] = useState<string | null>(null)

  function copyLink() {
    const url = `${window.location.origin}/calls/${callId}`
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => setEndError('Could not copy the link — copy it from the address bar instead.'))
  }

  function endForEveryone() {
    setEndError(null)
    startEndTransition(async () => {
      const res = await endVideoCallAction(getTabToken(), { callId })
      if (res.status === 'error') {
        setEndError(res.message ?? 'Could not end the call.')
        return
      }
      router.push(dashboard)
    })
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title ?? 'Video call'}</h1>
              <p className="text-xs text-gray-400">
                {participants.length} {participants.length === 1 ? 'person' : 'people'} invited
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-base">link</span>
                {copied ? 'Link copied!' : 'Copy call link'}
              </button>
              {isCreator && (
                <button
                  type="button"
                  onClick={endForEveryone}
                  disabled={ending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-error px-3 py-1.5 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-60"
                >
                  {ending ? 'Ending…' : 'End for everyone'}
                </button>
              )}
            </div>
          </div>

          {endError && <p className="mb-3 text-sm text-error">{endError}</p>}

          {(mediaBlocked.camera || mediaBlocked.microphone) && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {mediaBlocked.camera && mediaBlocked.microphone
                ? 'Camera and microphone are blocked for this site.'
                : mediaBlocked.camera
                  ? 'Camera is blocked for this site.'
                  : 'Microphone is blocked for this site.'}{' '}
              Check your browser&rsquo;s site permissions (usually the icon in the address bar) and
              reload this page.
            </div>
          )}

          <AddCallParticipants callId={callId} existing={participants} allUsers={allUsers} />

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <CallRoomInner onLeft={() => router.push(dashboard)} />
          </div>
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}

// Split out so useCallStateHooks (must run inside <StreamCall>) can watch the
// connection state and redirect once the local user actually leaves —
// clicking a CallControls leave button doesn't itself navigate anywhere.
function CallRoomInner({ onLeft }: { onLeft: () => void }) {
  const { useCallCallingState } = useCallStateHooks()
  const callingState = useCallCallingState()

  useEffect(() => {
    if (callingState === CallingState.LEFT) onLeft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState])

  if (callingState === CallingState.JOINING) {
    return <div className="flex h-96 items-center justify-center text-sm text-gray-400">Joining call…</div>
  }
  if (callingState === CallingState.RECONNECTING_FAILED) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-2 text-sm text-error">
        Could not connect to this call. Check your connection and reopen the link.
      </div>
    )
  }

  return (
    <>
      <SpeakerLayout />
      <CallControls />
    </>
  )
}
