// Quick task 260728-vpm — pure media-failure classifier.
//
// HARD LIMIT (must stay true forever): a web page CANNOT force-grant,
// auto-enable, or otherwise override camera/microphone permission. Once a
// user, an enterprise policy, or the OS has blocked it, only the user can
// restore it via browser/OS settings. Nothing in this file works around
// that — it only maximises the grant rate (re-request on a real user
// gesture) and tells the truth about which of the recognised causes
// actually applies, instead of one generic "blocked for this site" message.

export type MediaKind = 'camera' | 'microphone'

export type MediaPermissionState = 'granted' | 'denied' | 'prompt' | 'prompting' | 'unsupported'

export type MediaFailureCause =
  | 'insecure_context'
  | 'unsupported'
  | 'no_device'
  | 'device_busy'
  | 'permission_denied'
  | 'permission_prompt'
  | 'unknown'

export type MediaFailure = {
  kind: MediaKind
  cause: MediaFailureCause
  title: string
  detail: string
  canRetryInPlace: boolean
  needsUserSettingsChange: boolean
}

export type ClassifyMediaFailureInput = {
  errorName?: string
  permissionState?: MediaPermissionState
  isSecureContext: boolean
  hasMediaDevices: boolean
}

// Real sentences per cause, keyed off a plain-text device LABEL rather than
// the MediaKind enum directly — mergeMediaFailures' same-cause branch below
// needs to render one line for "camera and microphone" together without
// falling back to one device's specific wording, so every generator here
// takes a label string ('camera' | 'microphone' | 'camera and microphone').
// Every branch below must map to one of these, enforced by Task 1's "no
// branch renders an empty banner" test.
const DETAIL: Record<MediaFailureCause, (label: string) => string> = {
  insecure_context: () =>
    'Camera and microphone are only available on a secure origin. Open the app over https, or via http://localhost — a plain-http LAN address (http://192.168.x.x) can never be granted, and no site-permission setting will change that.',
  unsupported: () =>
    'This browser does not expose media devices at all. Use a current version of Chrome, Edge, Safari, or Firefox.',
  no_device: (label) =>
    `No ${label} was detected. Connect one and check it isn&rsquo;t disabled in your OS settings, then retry.`,
  device_busy: (label) =>
    `The ${label} is already in use by another app (Zoom, Teams, Meet) or another browser tab. Close it and retry.`,
  permission_denied: (label) =>
    `Access is blocked for this site. Open the permission control in the address bar, set ${label} to Allow, then use the retry button below &mdash; no reload needed.`,
  permission_prompt: () => 'Access has not been granted yet. Click retry and choose Allow in the browser prompt.',
  unknown: (label) => `Could not start the ${label}. Retry, and if it persists check the browser&rsquo;s site settings.`,
}

const TITLE: Record<MediaFailureCause, (label: string) => string> = {
  insecure_context: () => 'Insecure connection',
  unsupported: () => 'Unsupported browser',
  no_device: (label) => `No ${label} found`,
  device_busy: (label) => `${capitalize(label)} busy`,
  permission_denied: (label) => `${capitalize(label)} blocked`,
  permission_prompt: (label) => `${capitalize(label)} permission needed`,
  unknown: (label) => `${capitalize(label)} unavailable`,
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * classifyMediaFailure — PURE. No `window`/`navigator` access whatsoever;
 * every environment fact arrives as an argument. That is what makes this
 * testable under vitest's `environment: 'node'` and is why the impure probe
 * (`queryMediaPermissionState`, below) is kept in a separate export.
 *
 * Precedence is strict and top-down: each rule below is checked in order,
 * and an earlier match wins even when a later rule would also match.
 */
export function classifyMediaFailure(input: ClassifyMediaFailureInput, kind: MediaKind): MediaFailure {
  const { errorName, isSecureContext, hasMediaDevices } = input

  // WHY this outranks NotAllowedError/denied: a LAN-IP http origin produces
  // a permission-SHAPED rejection (the browser reports it exactly like a
  // user denial) but the real, unfixable cause is the origin itself. Also
  // covers `SecurityError`, which getUserMedia raises precisely for
  // non-secure/policy-blocked origins even when `isSecureContext` reads true
  // in edge cases (e.g. a restrictive Permissions-Policy). Telling this user
  // to "check site permissions" — the previous behavior this task replaces —
  // is the exact misdiagnosis this classifier exists to kill.
  if (!isSecureContext || errorName === 'SecurityError') {
    return build(kind, 'insecure_context', { canRetryInPlace: false, needsUserSettingsChange: false })
  }

  // Secure context, but this environment has no media API surface at all
  // (very old browser, or a locked-down embedded webview). Retrying can
  // only fail the same way, so no retry button.
  if (!hasMediaDevices) {
    return build(kind, 'unsupported', { canRetryInPlace: false, needsUserSettingsChange: false })
  }

  // No camera/mic attached, or the requested constraints can't be
  // satisfied by any attached device. Recoverable by plugging one in, so
  // still worth a retry button once the user has done that.
  if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') {
    return build(kind, 'no_device', { canRetryInPlace: true, needsUserSettingsChange: false })
  }

  // Another process (or another tab of this same browser) already holds
  // the device exclusively. `NotReadableError` and `AbortError` are both
  // getUserMedia's way of reporting this failure mode depending on
  // platform/driver — treat them identically.
  if (errorName === 'NotReadableError' || errorName === 'AbortError') {
    return build(kind, 'device_busy', { canRetryInPlace: true, needsUserSettingsChange: false })
  }

  if (errorName === 'NotAllowedError') {
    if (input.permissionState === 'denied') {
      // WHY canRetryInPlace stays true here: Chrome (and most Chromium
      // browsers) applies an address-bar permission change to the very
      // next getUserMedia call without requiring a page reload. The user
      // still has to go fix it in browser settings first, but once they
      // have, the SAME retry button works — no reload needed.
      return build(kind, 'permission_denied', { canRetryInPlace: true, needsUserSettingsChange: true })
    }
    // permissionState is 'prompt' | 'prompting' | 'unsupported' | undefined
    // — none of those mean the user has actually denied anything yet. This
    // is the single most common real-world case (first-time visit, no
    // choice made) and the one the retry button is built for: an explicit
    // user gesture is the only reliable way to re-trigger a `prompt`-state
    // permission dialog.
    return build(kind, 'permission_prompt', { canRetryInPlace: true, needsUserSettingsChange: false })
  }

  // Anything we didn't anticipate (including a missing errorName) — never
  // dead-end on an error class we don't recognise; still offer a retry.
  return build(kind, 'unknown', { canRetryInPlace: true, needsUserSettingsChange: false })
}

function build(
  kind: MediaKind,
  cause: MediaFailureCause,
  flags: { canRetryInPlace: boolean; needsUserSettingsChange: boolean },
): MediaFailure {
  return {
    kind,
    cause,
    title: TITLE[cause](kind),
    detail: DETAIL[cause](kind),
    ...flags,
  }
}

export type MergedMediaFailure = { lines: string[]; canRetryInPlace: boolean; retryLabel: string }

/**
 * mergeMediaFailures — PURE. Combines the camera and microphone failure
 * (if any) into the single banner rendered by video-call-room.tsx, and
 * appends the "you can still participate" degradation sentence so a
 * one-sided failure is never presented as a dead end.
 */
export function mergeMediaFailures(
  camera: MediaFailure | null,
  microphone: MediaFailure | null,
): MergedMediaFailure | null {
  if (!camera && !microphone) return null

  const lines: string[] = []

  if (camera && microphone && camera.cause === microphone.cause) {
    // Same cause on both devices — one line naming both, built from the
    // shared DETAIL generator with the merged label so it never falls back
    // to one device's specific wording (e.g. "set camera to Allow" would be
    // wrong when the microphone is denied too).
    lines.push(`Camera and microphone: ${DETAIL[camera.cause]('camera and microphone')}`)
  } else {
    if (camera) lines.push(`Camera: ${camera.detail}`)
    if (microphone) lines.push(`Microphone: ${microphone.detail}`)
  }

  // Graceful degradation is a rendering requirement, not new logic: no
  // failure path may dead-end the user out of the call entirely.
  if (camera && microphone) {
    lines.push('You can still see and hear other participants while this is unresolved.')
  } else if (camera) {
    lines.push('Audio participation still works — other participants can hear you.')
  } else if (microphone) {
    lines.push('Listening and viewing still work — you can see and hear other participants.')
  }

  const canRetryInPlace = Boolean(camera?.canRetryInPlace) || Boolean(microphone?.canRetryInPlace)

  const retryLabel =
    camera && microphone
      ? 'Enable camera & microphone'
      : camera
        ? 'Enable camera'
        : 'Enable microphone'

  return { lines, canRetryInPlace, retryLabel }
}

/**
 * queryMediaPermissionState — the ONLY impure export in this file.
 * Deliberately excluded from unit tests (feature-detection branches over
 * `navigator.permissions`, which vitest's `environment: 'node'` has no
 * meaningful stand-in for).
 *
 * Firefox has no `'camera'`/`'microphone'` Permissions API query name and
 * Safari's support is partial — a bare `navigator.permissions.query` call
 * THROWS in those cases, which would otherwise turn a perfectly recoverable
 * `prompt` state into an unhandled rejection. Feature-detect and swallow
 * into `'unsupported'` instead.
 */
export async function queryMediaPermissionState(kind: MediaKind): Promise<MediaPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported'
  try {
    const name = kind === 'camera' ? 'camera' : 'microphone'
    // PermissionName's TS lib.dom typings don't include 'camera'/'microphone'
    // in every TS version; cast through the query's own param shape.
    const status = await navigator.permissions.query({ name: name as PermissionName })
    const state = status.state as MediaPermissionState
    return state
  } catch {
    return 'unsupported'
  }
}
