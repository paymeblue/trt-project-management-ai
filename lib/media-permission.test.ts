import { describe, it, expect } from 'vitest'
import { classifyMediaFailure, mergeMediaFailures, type MediaFailureCause } from './media-permission'

const ALL_CAUSES: MediaFailureCause[] = [
  'insecure_context',
  'unsupported',
  'no_device',
  'device_busy',
  'permission_denied',
  'permission_prompt',
  'unknown',
]

describe('classifyMediaFailure', () => {
  it('Test 1: insecure context wins over NotAllowedError + denied', () => {
    const result = classifyMediaFailure(
      { errorName: 'NotAllowedError', permissionState: 'denied', isSecureContext: false, hasMediaDevices: true },
      'camera',
    )
    expect(result.cause).toBe('insecure_context')
    expect(result.canRetryInPlace).toBe(false)
    expect(result.needsUserSettingsChange).toBe(false)
    expect(result.detail.toLowerCase()).toMatch(/https|localhost/)
  })

  it('Test 2: secure context but no media devices returns unsupported', () => {
    const result = classifyMediaFailure(
      { isSecureContext: true, hasMediaDevices: false },
      'microphone',
    )
    expect(result.cause).toBe('unsupported')
    expect(result.canRetryInPlace).toBe(false)
  })

  it('Test 3: SecurityError returns insecure_context even in a nominally secure context', () => {
    const result = classifyMediaFailure(
      { errorName: 'SecurityError', isSecureContext: true, hasMediaDevices: true },
      'camera',
    )
    expect(result.cause).toBe('insecure_context')
  })

  it('Test 4: NotFoundError and OverconstrainedError return no_device, retryable', () => {
    for (const errorName of ['NotFoundError', 'OverconstrainedError']) {
      const result = classifyMediaFailure({ errorName, isSecureContext: true, hasMediaDevices: true }, 'camera')
      expect(result.cause).toBe('no_device')
      expect(result.needsUserSettingsChange).toBe(false)
      expect(result.canRetryInPlace).toBe(true)
    }
  })

  it('Test 5: NotReadableError and AbortError both return device_busy, retryable, name the real culprit', () => {
    for (const errorName of ['NotReadableError', 'AbortError']) {
      const result = classifyMediaFailure({ errorName, isSecureContext: true, hasMediaDevices: true }, 'microphone')
      expect(result.cause).toBe('device_busy')
      expect(result.canRetryInPlace).toBe(true)
      expect(result.detail).toMatch(/Zoom|Teams|Meet|tab/)
    }
  })

  it('Test 6: NotAllowedError + denied returns permission_denied, needs settings change, still retryable', () => {
    const result = classifyMediaFailure(
      { errorName: 'NotAllowedError', permissionState: 'denied', isSecureContext: true, hasMediaDevices: true },
      'camera',
    )
    expect(result.cause).toBe('permission_denied')
    expect(result.needsUserSettingsChange).toBe(true)
    expect(result.canRetryInPlace).toBe(true)
  })

  it('Test 7: NotAllowedError + prompt/prompting/unsupported/undefined all return permission_prompt', () => {
    const permissionStates = ['prompt', 'prompting', 'unsupported', undefined] as const
    for (const permissionState of permissionStates) {
      const result = classifyMediaFailure(
        { errorName: 'NotAllowedError', permissionState, isSecureContext: true, hasMediaDevices: true },
        'microphone',
      )
      expect(result.cause).toBe('permission_prompt')
      expect(result.needsUserSettingsChange).toBe(false)
      expect(result.canRetryInPlace).toBe(true)
    }
  })

  it('Test 8: unrecognised or missing errorName returns unknown, never dead-ends', () => {
    for (const errorName of ['TypeError', undefined]) {
      const result = classifyMediaFailure({ errorName, isSecureContext: true, hasMediaDevices: true }, 'camera')
      expect(result.cause).toBe('unknown')
      expect(result.canRetryInPlace).toBe(true)
    }
  })

  it('Test 9: every cause maps to a non-empty title and detail', () => {
    for (const cause of ALL_CAUSES) {
      const input =
        cause === 'insecure_context'
          ? { isSecureContext: false, hasMediaDevices: true }
          : cause === 'unsupported'
            ? { isSecureContext: true, hasMediaDevices: false }
            : cause === 'no_device'
              ? { errorName: 'NotFoundError', isSecureContext: true, hasMediaDevices: true }
              : cause === 'device_busy'
                ? { errorName: 'NotReadableError', isSecureContext: true, hasMediaDevices: true }
                : cause === 'permission_denied'
                  ? {
                      errorName: 'NotAllowedError',
                      permissionState: 'denied' as const,
                      isSecureContext: true,
                      hasMediaDevices: true,
                    }
                  : cause === 'permission_prompt'
                    ? {
                        errorName: 'NotAllowedError',
                        permissionState: 'prompt' as const,
                        isSecureContext: true,
                        hasMediaDevices: true,
                      }
                    : { errorName: 'TypeError', isSecureContext: true, hasMediaDevices: true }
      const result = classifyMediaFailure(input, 'camera')
      expect(result.cause).toBe(cause)
      expect(result.title.length).toBeGreaterThan(0)
      expect(result.detail.length).toBeGreaterThan(0)
    }
  })
})

describe('mergeMediaFailures', () => {
  const denied = (kind: 'camera' | 'microphone') =>
    classifyMediaFailure(
      { errorName: 'NotAllowedError', permissionState: 'denied', isSecureContext: true, hasMediaDevices: true },
      kind,
    )
  const busy = (kind: 'camera' | 'microphone') =>
    classifyMediaFailure({ errorName: 'NotReadableError', isSecureContext: true, hasMediaDevices: true }, kind)

  it('Test 10: same cause on both devices -> one merged line naming "Camera and microphone"', () => {
    const merged = mergeMediaFailures(denied('camera'), denied('microphone'))
    expect(merged).not.toBeNull()
    const combinedLine = merged!.lines.find((l) => l.startsWith('Camera and microphone'))
    expect(combinedLine).toBeDefined()
    expect(merged!.lines.some((l) => l.startsWith('Camera:'))).toBe(false)
    expect(merged!.lines.some((l) => l.startsWith('Microphone:'))).toBe(false)
  })

  it('Test 10b: different causes on each device -> two separate lines, one per device', () => {
    const merged = mergeMediaFailures(denied('camera'), busy('microphone'))
    expect(merged).not.toBeNull()
    expect(merged!.lines.some((l) => l.startsWith('Camera:'))).toBe(true)
    expect(merged!.lines.some((l) => l.startsWith('Microphone:'))).toBe(true)
  })

  it('Test 11: degradation copy is present for camera-only, microphone-only, and both failures', () => {
    const cameraOnly = mergeMediaFailures(denied('camera'), null)
    expect(cameraOnly!.lines.some((l) => /audio participation/i.test(l))).toBe(true)

    const micOnly = mergeMediaFailures(null, denied('microphone'))
    expect(micOnly!.lines.some((l) => /listen|view|see and hear/i.test(l))).toBe(true)

    const both = mergeMediaFailures(denied('camera'), denied('microphone'))
    expect(both!.lines.some((l) => /see and hear/i.test(l))).toBe(true)
  })

  it('Test 12: mergeMediaFailures(null, null) returns null', () => {
    expect(mergeMediaFailures(null, null)).toBeNull()
  })

  it('Test 13: canRetryInPlace is true if EITHER device is retryable, false only when neither is', () => {
    const insecure = classifyMediaFailure({ isSecureContext: false, hasMediaDevices: true }, 'camera')
    const retryableMic = denied('microphone')

    expect(mergeMediaFailures(insecure, retryableMic)!.canRetryInPlace).toBe(true)
    expect(mergeMediaFailures(insecure, null)!.canRetryInPlace).toBe(false)

    const insecureMic = classifyMediaFailure({ isSecureContext: false, hasMediaDevices: true }, 'microphone')
    expect(mergeMediaFailures(insecure, insecureMic)!.canRetryInPlace).toBe(false)
  })
})
