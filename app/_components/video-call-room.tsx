'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  SpeakerLayout,
  CallControls,
  CallingState,
  useCallStateHooks,
  type Call,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { endVideoCallAction } from '@/actions/video-calls'
import AddCallParticipants from '@/app/_components/add-call-participants'
import CallChatPanel from '@/app/_components/call-chat-panel'
import { getTabToken } from '@/lib/use-tab-token'
import {
  classifyMediaFailure,
  mediaErrorName,
  mergeMediaFailures,
  queryMediaPermissionState,
  type MediaFailure,
  type MediaKind,
} from '@/lib/media-permission'
import { describeCallEnd, describeCallingState, deriveCallPresence, formatCallDuration } from '@/lib/call-status'

export type CallParticipantInfo = { userId: string; name: string; role: string }

// EXIT PATH AUDIT (quick task 260729-cr1)
//
// All seven ways a user can leave this call room, and what happens to
// (1) local media devices, (2) the Stream call/client, (3) the
// `video_calls` row, (4) navigation. Reproduced as a markdown table in this
// quick task's SUMMARY.md.
//
// 1. CallControls hangup (leave). SDK's call.leave() stops devices as its
//    own final step; the subsequent React unmount runs releaseCallResources,
//    whose disable(true) calls are idempotent no-ops if leave already
//    succeeded and are the real safety net if it did not. Client
//    disconnected on unmount. notifyLeftOnce stamps leftAt;
//    markCallParticipantLeft auto-ends the call if this was the last
//    present participant. Navigation: callingState -> LEFT fires the effect
//    that pushes `dashboard`.
//
// 2. End for everyone — local actor. endVideoCallAction sets
//    status='ended' + endedAt then best-effort call.end() on Stream.
//    router.push(dashboard) unmounts the room, which runs
//    releaseCallResources + the leave beacon. The beacon's
//    markCallParticipantLeft re-reads status, sees it's no longer 'active',
//    and is a safe no-op (never a double end).
//
// 3. End for everyone — remote participant. Stream delivers call.ended; the
//    SDK sets endedAt/endedBy and THEN leaves (verified ordering in
//    @stream-io/video-client's watchCallEnded — the state handler runs
//    first, so by the time this component observes callingState === LEFT,
//    useCallEndedAt()/useCallEndedBy() are already populated; that ordering
//    is what makes the remote-end notice below reliable rather than racy),
//    so callingState -> LEFT with camera/mic stopped by leave and
//    re-released on unmount. Row already ended by the actor; this client's
//    beacon is the same safe no-op as (2). Navigation: previously pushed
//    `dashboard` with NO explanation whatsoever — CLOSED below: the user
//    now sees who ended the call and why before being routed away.
//
// 4. Client-side navigation away (sidebar link, back button). Unmount
//    cleanup: releaseCallResources + beacon + possible auto-end. Navigation
//    already in flight.
//
// 5. Tab / browser close. No React unmount ever occurs; the pagehide
//    listener runs releaseCallResources and the keepalive:true beacon. Best
//    effort by nature — a hard kill or offline device drops it, which is
//    exactly why sweepStaleCalls exists as the authoritative backstop. No
//    navigation.
//
// 6. Join timeout (JOIN_TIMEOUT_MS, i.e. joining an already-ended call).
//    Devices were never enabled; every releaseCallResources step is a safe
//    no-op on unmount. ensureCallParticipant already stamped joinedAt when
//    the page rendered, so the beacon's leftAt correctly clears presence.
//    Navigation: the terminal panel's "Back to Video Calls" link. OK.
//
// 7. RECONNECTING_FAILED. Previously a pure-text terminal panel with no
//    link and no button — the user was stranded in a dead room, and because
//    nothing unmounted, releaseCallResources never ran and the camera light
//    stayed on until they navigated away by some other means. CLOSED below:
//    the failed panel now has a "Back to Video Calls" link, which is the
//    actual media-release mechanism for this path (navigating away is what
//    unmounts the component and runs releaseCallResources), not merely a
//    convenience.

// Quick task 260728-vpm (VPM-04) — release the camera/mic hardware on EVERY
// exit path: the CallControls leave button, "End for everyone", client-side
// navigation away, and tab close.
//
// Root cause of the live "camera light stays on after ending a call" bug:
// call.leave() DOES stop devices internally (CameraManager/MicrophoneManager
// default `stopOnLeave: true`), but only as the LAST step of its own long
// sequential teardown (subscriber/publisher/sfuClient/dynascale disposal all
// run first) — if any earlier step throws, leave() rejects before ever
// reaching its own camera/mic disable call, and this component's previous
// cleanup only ever ran `call.leave().catch(() => {})`, silently swallowing
// that rejection with the hardware still held.
//
// Disabling camera/mic explicitly and FIRST — independent of whether
// leave()/disconnectUser() themselves succeed — guarantees release no
// matter what the SDK's own teardown does. Each step below is independently
// try/caught so one failing step can never skip the next, and a call that
// never actually joined (the JOIN_TIMEOUT_MS case) still runs every step
// safely: disable() on a never-enabled device, or leave()/disconnectUser()
// on a call/client that never fully connected, are all safe no-ops/rejections
// we simply swallow.
// Quick task 260728-vce: best-effort, unload-survivable "I left" beacon.
// `keepalive: true` is what lets this request outlive the document being
// torn down — the entire point on `pagehide`, where the tab is closing
// while the request is still in flight. `navigator.sendBeacon` gives the
// same unload survivability but cannot set an `Authorization` header (only
// a body + content-type), which would force this app's per-tab token into a
// request body and fork the auth path lib/dal.ts already supports for every
// other request — keepalive fetch keeps this on the SAME one auth path.
// Called from both exit sites (unmount cleanup and `pagehide`) rather than
// forking a Server Action for one and a beacon for the other, for the same
// no-drift reasoning this file already applies to `enableMedia`. This is
// BEST-EFFORT by nature: a hard tab kill, crash, OS-level process kill, or
// an offline device can all drop the request — that is precisely why the
// scheduled sweep (lib/video-calls.ts's sweepStaleCalls) exists as the
// authoritative backstop, not as a nice-to-have.
function notifyServerLeft(callId: string) {
  fetch(`/api/calls/${callId}/leave`, {
    method: 'POST',
    keepalive: true,
    headers: { authorization: `Bearer ${getTabToken() ?? ''}` },
  }).catch(() => {
    // Best-effort — see the function comment above.
  })
}

async function releaseCallResources(call: Call, client: StreamVideoClient) {
  try {
    await call.camera.disable(true)
  } catch {
    // Already disabled, device never enabled, or call already left/torn
    // down — nothing to release.
  }
  try {
    await call.microphone.disable(true)
  } catch {
    // Same as above.
  }
  try {
    await call.leave()
  } catch {
    // Already left (e.g. CallControls' own leave button already invoked
    // call.leave() internally), or never actually joined — nothing further
    // to do; the camera/mic disable above already ran regardless.
  }
  try {
    await client.disconnectUser()
  } catch {
    // Client already disconnected, or never finished connecting.
  }
}

export default function VideoCallRoom({
  apiKey,
  userId,
  userName,
  token,
  chatToken,
  callId,
  title,
  isCreator,
  isAdmin,
  creatorId,
  participants,
  allUsers,
  dashboard,
  scheduledFor,
}: {
  apiKey: string
  userId: string
  userName: string
  token: string
  chatToken: string
  callId: string
  title: string | null
  isCreator: boolean
  isAdmin: boolean
  creatorId: string
  participants: CallParticipantInfo[]
  allUsers: { id: string; name: string; role: string }[]
  dashboard: string
  scheduledFor: string | null
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
  // an icon alone. Each kind's failure is classified independently (quick
  // task 260728-vpm) so a busy camera and an unprompted mic never collapse
  // into one wrong sentence, and so the banner can offer an in-place retry
  // instead of telling the user to reload.
  const [mediaFailures, setMediaFailures] = useState<{ camera: MediaFailure | null; microphone: MediaFailure | null }>({
    camera: null,
    microphone: null,
  })
  const [retrying, setRetrying] = useState(false)

  // enableMedia's setMediaFailures calls are async (permission query +
  // enable() both await) and can resolve after the user has already left
  // the call (unmount, navigation away, tab close). Guard every state
  // update behind this so a late-resolving promise never touches unmounted
  // component state.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Guards notifyServerLeft so it fires at most once per room mount even
  // though both the unmount cleanup AND pagehide can race/double-fire (e.g.
  // a client-side nav away triggers unmount while pagehide never fires, but
  // a tab close can in principle hit both in quick succession on some
  // browsers) — the server side is already idempotent (markCallParticipantLeft
  // re-reads status before acting), this just avoids a redundant request.
  const leftNotifiedRef = useRef(false)
  const notifyLeftOnce = useCallback(() => {
    if (leftNotifiedRef.current) return
    leftNotifiedRef.current = true
    notifyServerLeft(callId)
  }, [callId])

  // Single shared enable path used by BOTH the post-join auto-enable and
  // the banner retry button — one code path, so retry can never drift from
  // the initial attempt's classification logic.
  const enableMedia = useCallback(
    async (kind: MediaKind) => {
      const isSecureContext = window.isSecureContext
      const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

      // A plain-http LAN-IP test session (or any non-secure origin) can
      // only ever fail here — calling enable() would just produce a
      // permission-shaped rejection with the wrong apparent cause. Skip
      // straight to classification so the banner tells the truth instead
      // of "check site permissions".
      if (!isSecureContext || !hasMediaDevices) {
        const failure = classifyMediaFailure({ isSecureContext, hasMediaDevices }, kind)
        if (mountedRef.current) setMediaFailures((s) => ({ ...s, [kind]: failure }))
        return
      }

      try {
        if (kind === 'camera') await call.camera.enable()
        else await call.microphone.enable()
        // Success (including a successful retry) clears this kind's own
        // failure — never the other kind's, preserving independence.
        if (mountedRef.current) setMediaFailures((s) => ({ ...s, [kind]: null }))
      } catch (err) {
        // NOT `err.name` directly: call.camera.enable() wraps the underlying
        // getUserMedia DOMException, so its `.name` is a useless "Error" and
        // every real cause collapsed into the 'unknown' catch-all. mediaErrorName
        // unwraps message/cause to recover the true DOMException name.
        const errorName = mediaErrorName(err)
        const permissionState = await queryMediaPermissionState(kind)
        const failure = classifyMediaFailure({ errorName, permissionState, isSecureContext, hasMediaDevices }, kind)
        if (mountedRef.current) setMediaFailures((s) => ({ ...s, [kind]: failure }))
      }
    },
    [call],
  )

  // If the call was already ended (server-side call.end()) by the time this
  // client tries to join, call.join() can hang forever instead of rejecting
  // — the SDK's own "call ended" handling only kicks in once its websocket
  // connection is up, which a join against a dead call may never reach. Bug
  // found live: a participant who opened/refreshed a just-ended call's room
  // got stuck on "Joining call…" indefinitely. This timeout is the fallback
  // that actually resolves it either way.
  const JOIN_TIMEOUT_MS = 10_000
  const [joinTimedOut, setJoinTimedOut] = useState(false)

  useEffect(() => {
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) setJoinTimedOut(true)
    }, JOIN_TIMEOUT_MS)

    call
      .join()
      .then(() => {
        settled = true
        clearTimeout(timeout)
        // Camera/mic start OFF by default (SpeakerLayout/CallControls show
        // the crossed-out red icons until manually toggled) — "like Zoom"
        // means video is on the moment you join, not an extra click. Each
        // enableMedia call is independent: a denied/missing camera must
        // never block the mic (or vice versa), so they're never
        // Promise.all'd. This zero-click path is intentionally NOT gated
        // behind a permission query or a button — it's the already-granted
        // fast path.
        void enableMedia('camera')
        void enableMedia('microphone')
      })
      .catch(() => {
        settled = true
        clearTimeout(timeout)
        setJoinTimedOut(true)
      })
    return () => {
      settled = true
      clearTimeout(timeout)
      // VPM-04: explicitly release camera/mic (then leave, then disconnect
      // the client) on every component-unmount exit path — CallControls'
      // leave button and "End for everyone" both navigate away afterward,
      // unmounting this component; client-side navigation away unmounts it
      // directly. See releaseCallResources' own comment for why this can't
      // just rely on call.leave() doing it internally.
      releaseCallResources(call, client).catch(() => {
        // releaseCallResources already swallows every one of its own steps;
        // this is belt-and-suspenders only.
      })
      // 260728-vce: tell the server this user left — deliberately NOT inside
      // releaseCallResources, which is media-hardware release and must stay
      // synchronous-ish and failure-isolated (see that function's own
      // comment).
      notifyLeftOnce()
    }
  }, [call, client, enableMedia, notifyLeftOnce])

  // VPM-04: the effect above only fires on React unmount, which does NOT
  // happen on a hard tab/browser close (no client-side navigation occurs,
  // so nothing ever unmounts). `pagehide` is the standard, bfcache-safe
  // signal for "the document is going away" — register it once per
  // call/client pair so that exit path also releases the hardware.
  useEffect(() => {
    const onPageHide = () => {
      releaseCallResources(call, client).catch(() => {})
      // 260728-vce: same beacon as the unmount cleanup above — pagehide is
      // the exit path that never unmounts this component (hard tab/browser
      // close), so it needs its own call site.
      notifyLeftOnce()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [call, client, notifyLeftOnce])

  // Side panel: 'people' | 'chat' | null (closed). `chatEverOpened` is a
  // one-way latch — once the user opens Chat for the first time, the
  // <CallChatPanel> instance below is mounted for the rest of this room's
  // lifetime and never unmounted again, only hidden via CSS. See the
  // "Chat mount lifecycle" comment further down for why.
  const [panel, setPanel] = useState<'people' | 'chat' | null>(null)
  const [chatEverOpened, setChatEverOpened] = useState(false)

  const [copied, setCopied] = useState(false)
  const [ending, startEndTransition] = useTransition()
  const [endError, setEndError] = useState<string | null>(null)

  // Confirmed destructive end (task 3b). The joined count shown in the
  // confirmation must be the SAME number CallLiveStatus's header chip
  // shows — lifted here via a callback rather than re-deriving it, so the
  // two can never drift.
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [joinedCount, setJoinedCount] = useState(0)
  const onJoinedCountChange = useCallback((n: number) => setJoinedCount(n), [])

  useEffect(() => {
    if (!confirmingEnd) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmingEnd(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmingEnd])

  const roomRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === roomRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Not fullscreen, or the browser refused — nothing to recover from.
      })
    } else {
      roomRef.current?.requestFullscreen().catch(() => {
        // Some browsers require a direct user gesture; this is already
        // called from one (the button's own onClick).
      })
    }
  }

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

  const mediaBanner = mergeMediaFailures(mediaFailures.camera, mediaFailures.microphone)

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme>
          {/* Quick task 260729-cr1: bounded flex column with a real,
              viewport-relative height. `dvh` (not `vh`) is load-bearing on
              mobile Safari/Chrome, where `vh` ignores the collapsing browser
              chrome and pushes the call controls below the fold. Root cause
              this exists to fix: .str-video__speaker-layout__wrapper is
              `flex-grow: 1; overflow-y: hidden`, which only does anything
              inside a flex-column parent that ITSELF has a bounded height —
              a future "simplification" that drops `flex flex-col` or this
              explicit height silently reintroduces the letterboxed strip
              (see this file's EXIT PATH AUDIT header and PLAN.md's
              objective for the full root-cause trace). `min-h-[30rem]` is
              the floor for short viewports: below that the page scrolls
              rather than crushing the stage. */}
          <div
            ref={roomRef}
            className={
              isFullscreen
                ? 'flex h-screen w-screen flex-col gap-3 bg-surface p-3'
                : 'flex h-[calc(100dvh-13rem)] min-h-[30rem] flex-col gap-3 sm:h-[calc(100dvh-15rem)]'
            }
          >
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{title ?? 'Video call'}</h1>
              <CallLiveStatus invitedCount={participants.length} onJoinedCountChange={onJoinedCountChange} />
            </div>
            {confirmingEnd && !ending ? (
              // Inline confirmation surface (task 3b) — deliberately NOT a
              // window.confirm(), which is unstyled, blocking, and
              // untestable. Names the blast radius using the LIVE joined
              // count (people who never joined are unaffected), spells out
              // the leave-vs-end distinction, and defaults focus to Cancel.
              <div
                role="alertdialog"
                aria-label="Confirm end call for everyone"
                className="w-full rounded-md border border-error/40 bg-error/5 p-3 text-xs"
              >
                <p className="font-semibold text-gray-900">
                  End this call for {joinedCount} {joinedCount === 1 ? 'person' : 'people'} currently in it?
                </p>
                <p className="mt-1 text-gray-500">
                  Ending stops the call for everyone and cannot be undone. The red hangup button in the call
                  controls only removes you — the call keeps running for everyone else.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmingEnd(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={ending}
                    onClick={endForEveryone}
                    className="rounded-md bg-error px-3 py-1.5 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-60"
                  >
                    {ending ? 'Ending…' : 'Yes, end for everyone'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span className="material-symbols-outlined text-base">
                    {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
                  </span>
                  {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span className="material-symbols-outlined text-base">link</span>
                  {copied ? 'Link copied!' : 'Copy call link'}
                </button>
                <button
                  type="button"
                  onClick={() => setPanel((p) => (p === 'people' ? null : 'people'))}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span className="material-symbols-outlined text-base">group</span>
                  People
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatEverOpened(true)
                    setPanel((p) => (p === 'chat' ? null : 'chat'))
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span className="material-symbols-outlined text-base">chat</span>
                  {panel === 'chat' ? 'Hide chat' : 'Chat'}
                </button>
                {(isCreator || isAdmin) && (
                  // Outlined error button, NOT solid bg-error — a
                  // deliberate visual difference from CallControls' solid
                  // red hangup button a few pixels away in the controls
                  // bar. Two identically-red buttons, one reversible
                  // (leave) and one not (end for everyone), is the exact
                  // shape of a misclick-destroys-the-meeting bug.
                  <button
                    type="button"
                    onClick={() => setConfirmingEnd(true)}
                    disabled={ending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-error px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10 disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-base">call_end</span>
                    {ending ? 'Ending…' : 'End for everyone'}
                  </button>
                )}
              </div>
            )}
          </div>

          {endError && <p className="shrink-0 text-sm text-error">{endError}</p>}

          {scheduledFor && (
            <div className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
              Scheduled for{' '}
              {new Date(scheduledFor).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} —
              you&rsquo;re early, feel free to join now.
            </div>
          )}

          {mediaBanner && (
            <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {mediaBanner.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {mediaBanner.canRetryInPlace && (
                // An explicit user gesture is both the only reliable way to
                // re-trigger a `prompt`-state permission dialog and the
                // highest-grant-rate moment to ask — this button never
                // reloads, navigates, or leaves the call, it only
                // re-invokes the same enableMedia() the auto-enable path
                // used.
                <button
                  type="button"
                  disabled={retrying}
                  onClick={() => {
                    setRetrying(true)
                    const kinds: MediaKind[] = []
                    if (mediaFailures.camera) kinds.push('camera')
                    if (mediaFailures.microphone) kinds.push('microphone')
                    Promise.all(kinds.map((kind) => enableMedia(kind))).finally(() => setRetrying(false))
                  }}
                  className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  {retrying ? 'Requesting…' : mediaBanner.retryLabel}
                </button>
              )}
            </div>
          )}

          {/* min-h-0 is load-bearing: without it a flex child's default
              min-height: auto refuses to shrink below its content and the
              stage overflows the viewport instead of fitting it. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            {/* The dark background is deliberate and is the one place NOT
                to use the gray-shim theme palette — video letterbox bars
                read as dark in every professional call tool, in both light
                and dark app themes. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-900">
              <CallRoomInner
                joinTimedOut={joinTimedOut}
                onLeft={() => router.push(dashboard)}
                endingLocally={ending}
                localUserId={userId}
              />
            </div>

            {/* Side panel — ALWAYS rendered once the room mounts (never
                `{panel && ...}`), visibility toggled purely via the `hidden`
                class on this outer node. This is what lets <CallChatPanel>
                below stay mounted across both tab switches AND fully
                closing/reopening the panel — see the Chat mount lifecycle
                comment on its wrapper for why that matters. */}
            <div
              className={
                panel
                  ? 'flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white lg:w-80'
                  : 'hidden'
              }
            >
              <div className="flex shrink-0 border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setPanel((p) => (p === 'people' ? null : 'people'))}
                  className={`flex-1 px-3 py-2 text-xs font-semibold ${
                    panel === 'people' ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  People
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatEverOpened(true)
                    setPanel((p) => (p === 'chat' ? null : 'chat'))
                  }}
                  className={`flex-1 px-3 py-2 text-xs font-semibold ${
                    panel === 'chat' ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Chat
                </button>
              </div>

              <div className={panel === 'people' ? 'min-h-0 flex-1 overflow-y-auto' : 'hidden'}>
                <CallRoster />
                <AddCallParticipants
                  callId={callId}
                  existing={participants}
                  allUsers={allUsers}
                  canManage={isCreator || isAdmin}
                  creatorId={creatorId}
                />
              </div>

              {/* Chat mount lifecycle — do not regress this. CallChatPanel
                  calls useCreateChatClient, which connects/disconnects a
                  Stream Chat user on mount/unmount. Naively swapping tabs
                  by conditional rendering would disconnect/reconnect the
                  chat client on every tab click (and every panel
                  open/close). Instead: never mount this until the user
                  opens the Chat tab at least once (chatEverOpened latches
                  true and never resets), then once mounted keep it mounted
                  for the rest of the room's lifetime and toggle only
                  visibility via classes. A reviewer will otherwise "clean
                  up" this gate into a plain `panel === 'chat' && (...)` —
                  don't. */}
              {chatEverOpened && (
                <div className={panel === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                  <CallChatPanel
                    apiKey={apiKey}
                    userId={userId}
                    userName={userName}
                    token={chatToken}
                    callId={callId}
                  />
                </div>
              )}
            </div>
          </div>
          </div>
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}

// Split out so useCallStateHooks (must run inside <StreamCall>) can read
// live call duration/presence — VideoCallRoom itself is the component that
// RENDERS <StreamCall>, so a hook call directly in VideoCallRoom's own
// function body would run outside the context that provider creates for
// its children. Same reasoning as CallRoomInner below.
function CallLiveStatus({
  invitedCount,
  onJoinedCountChange,
}: {
  invitedCount: number
  onJoinedCountChange?: (n: number) => void
}) {
  const { useCallStartedAt, useParticipants, useCallCallingState } = useCallStateHooks()
  const startedAt = useCallStartedAt()
  // useParticipants().length, NOT useParticipantCount(): the latter is a
  // server-computed approximation that includes anonymous users, so it can
  // disagree with the faces actually on screen — the count next to the
  // video must match what the user can actually see.
  const joinedCount = useParticipants().length
  const callingState = useCallCallingState()

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    // Only start ticking once actually joined — no timer burning while
    // still joining/reconnecting/etc. The initial `useState(() => Date.now())`
    // already seeds a reasonable first value, so the effect only needs to
    // subscribe to the 1s tick, not call setState synchronously itself.
    if (callingState !== CallingState.JOINED) return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [callingState])

  // Reports the live joined count up to VideoCallRoom so the "End for
  // everyone" confirmation (task 3b) names the SAME number this component
  // shows in its own chip — never a separately re-derived count that could
  // drift from it.
  useEffect(() => {
    onJoinedCountChange?.(joinedCount)
  }, [joinedCount, onJoinedCountChange])

  const duration = formatCallDuration(startedAt?.getTime(), nowMs)
  const presence = deriveCallPresence({ invitedCount, joinedCount })

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      {duration && (
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          {duration}
        </span>
      )}
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
        {presence.joinedLabel}
      </span>
      <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 font-medium text-gray-500">
        {presence.invitedLabel}
      </span>
      {presence.waitingMessage && <span className="text-gray-400">{presence.waitingMessage}</span>}
    </div>
  )
}

// The People tab's live roster of who is actually IN the call right now —
// distinct from AddCallParticipants' invite list, which is who was invited
// (a superset that may include people who never joined). Same
// render-inside-<StreamCall> reasoning as CallLiveStatus/CallRoomInner.
function CallRoster() {
  const { useParticipants } = useCallStateHooks()
  const participants = useParticipants()

  return (
    <div className="border-b border-gray-100 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        In this call ({participants.length})
      </p>
      <ul className="space-y-1">
        {participants.map((p) => (
          <li key={p.sessionId} className="flex items-center gap-2 text-sm text-gray-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            <span className="truncate">{p.name || p.userId}</span>
            {p.isLocalParticipant && <span className="shrink-0 text-xs text-gray-400">(You)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Split out so useCallStateHooks (must run inside <StreamCall>) can watch the
// connection state and redirect once the local user actually leaves —
// clicking a CallControls leave button doesn't itself navigate anywhere.
function CallRoomInner({
  joinTimedOut,
  onLeft,
  endingLocally,
  localUserId,
}: {
  joinTimedOut: boolean
  onLeft: () => void
  endingLocally: boolean
  localUserId: string
}) {
  const { useCallCallingState, useCallEndedAt, useCallEndedBy } = useCallStateHooks()
  const callingState = useCallCallingState()
  const endedAt = useCallEndedAt()
  const endedBy = useCallEndedBy()

  // Purely derived from render inputs (callingState/endingLocally/endedAt)
  // rather than tracked in its own state — SDK ordering guarantee (verified
  // by reading watchCallEnded in @stream-io/video-client): when someone else
  // calls call.end(), the state handler sets endedAt/endedBy FIRST, and only
  // THEN does watchCallEnded invoke call.leave({ reject: false }), which is
  // what transitions callingState to LEFT. So by the time this component
  // observes LEFT, endedAt/endedBy are already populated — that ordering is
  // what makes checking endedAt here safe rather than a race.
  const endedRemotely = callingState === CallingState.LEFT && !endingLocally && !!endedAt

  // Guards onLeft so a double fire (the LEFT effect below AND CallControls'
  // own onLeave prop, task 3d) can never double-push the router.
  const navigatedRef = useRef(false)
  const navigateOnce = useCallback(() => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    onLeft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (callingState !== CallingState.LEFT) return
    if (endingLocally || !endedAt) {
      // A plain leave, or the local ender who is already navigating —
      // exactly as before this task.
      navigateOnce()
      return
    }
    // Ended by someone else. Tell the user (endedRemotely above renders the
    // notice) before routing them away instead of silently pushing
    // `dashboard` with no explanation (EXIT PATH AUDIT gap 3, closed here).
    const ENDED_NOTICE_MS = 4000
    const timeout = setTimeout(navigateOnce, ENDED_NOTICE_MS)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callingState, endingLocally, endedAt])

  if (endedRemotely) {
    // Keep the endedBy?.id === localUserId check even though `endingLocally`
    // already covers the normal local path — an admin who ends the call
    // from a second tab is a real case and should not be told a stranger
    // ended it.
    const { title, detail } = describeCallEnd({
      endedByName: endedBy?.name ?? null,
      endedByYou: endedBy?.id === localUserId,
    })
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-gray-300">
        <span className="material-symbols-outlined text-3xl text-gray-500">call_end</span>
        <p className="text-base font-semibold text-white">{title}</p>
        <p>{detail}</p>
        <p className="text-xs text-gray-500">You&rsquo;ll be returned automatically.</p>
        <Link href="/calls" className="font-semibold text-primary hover:underline">
          Back to Video Calls
        </Link>
      </div>
    )
  }

  // Checked BEFORE the descriptor branches below — a join stuck past the
  // parent's timeout is exactly what the 'joining' descriptor would
  // otherwise render as "Joining call…" forever (see the bug this fixes:
  // an already-ended call's join never resolves or rejects).
  if (joinTimedOut && callingState !== CallingState.JOINED) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-gray-300">
        <span className="material-symbols-outlined text-3xl text-gray-500">videocam_off</span>
        Could not join — this call may have ended.
        <Link href="/calls" className="font-semibold text-primary hover:underline">
          Back to Video Calls
        </Link>
      </div>
    )
  }

  // Driven through describeCallingState + descriptor.keepStageMounted
  // instead of an inline if-chain (quick task 260729-cr1) — the lookup
  // table in lib/call-status.ts is the single place that decides which
  // states unmount the stage, so it can never drift from what
  // CallLiveStatus's header chips imply is happening.
  const descriptor = describeCallingState(callingState)

  if (!descriptor.keepStageMounted) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-gray-300">
        {descriptor.kind === 'failed' && (
          <span className="material-symbols-outlined text-3xl text-error">error</span>
        )}
        <span className={descriptor.kind === 'failed' ? 'text-error' : ''}>{descriptor.overlay}</span>
        {descriptor.kind === 'failed' && (
          // Task 3d — un-strand RECONNECTING_FAILED. This link is the
          // actual media-release mechanism for this path (navigating away
          // is what unmounts the component and runs releaseCallResources),
          // not merely a convenience — without it the camera stays on
          // until the user finds some other way to leave.
          <Link href="/calls" className="font-semibold text-primary hover:underline">
            Back to Video Calls
          </Link>
        )}
      </div>
    )
  }

  // keepStageMounted is true here — 'live', or one of the three transient
  // states (reconnecting/migrating/offline). Do NOT unmount <SpeakerLayout>
  // for the transient case: unmounting tears down the video elements and
  // turns a 2-second blip into a full rejoin. Instead render the stage as
  // normal plus an absolutely-positioned pill on top of it when
  // descriptor.overlay is non-null.
  return (
    <>
      <div className="relative min-h-0 flex-1">
        {descriptor.overlay && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            {descriptor.overlay}
          </div>
        )}
        <SpeakerLayout />
      </div>
      <div className="shrink-0 border-t border-white/10 bg-gray-900">
        {/* callingState -> LEFT (the effect above) already handles
            navigation for every leave path. This onLeave is
            belt-and-braces for the case where the SDK's own leave() call
            rejects after stopping devices and callingState never reaches
            LEFT — navigateOnce's guard makes a double fire harmless. */}
        <CallControls onLeave={() => navigateOnce()} />
      </div>
    </>
  )
}
