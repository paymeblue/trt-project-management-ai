import { describe, it, expect, beforeEach, vi } from 'vitest'

// Coverage for actions/video-calls.ts — the server-action layer around
// lib/video-calls.ts (mocked wholesale here; its own DB+GetStream behavior
// isn't re-tested through this file). Focuses on what the action layer
// itself is responsible for: session verification, input validation
// (never trusting a client-supplied user-id list), and authorization
// (only an existing participant may add others; only the call's creator or
// an admin may end it for everyone).

const {
  verifyMock,
  whereMock,
  createVideoCallMock,
  addVideoCallParticipantsMock,
  endVideoCallMock,
  getCallMock,
  getCallParticipantsMock,
  removeCallParticipantMock,
} = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  whereMock: vi.fn(),
  createVideoCallMock: vi.fn(),
  addVideoCallParticipantsMock: vi.fn(),
  endVideoCallMock: vi.fn(),
  getCallMock: vi.fn(),
  getCallParticipantsMock: vi.fn(),
  removeCallParticipantMock: vi.fn(),
}))

// FIFO queue: each `db.select(...).where(...)` call in the action under test
// consumes the next queued value. `.limit()` resolves to the same value as
// calling `where()` bare — mirrors both query shapes actions/video-calls.ts
// uses (validateUserIds has no .limit(), the actor-name lookup does).
let whereQueue: unknown[] = []
function queueWhere(value: unknown) {
  whereQueue.push(value)
}
whereMock.mockImplementation(() => {
  const value = whereQueue.shift()
  const promise = Promise.resolve(value) as Promise<unknown> & { limit: (n: number) => Promise<unknown> }
  promise.limit = () => Promise.resolve(value)
  return promise
})

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({
  verifySessionForAction: verifyMock,
  isAdminRole: (role: string) => role === 'super_admin' || role === 'operations',
}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: whereMock }) }),
  },
}))
vi.mock('@/lib/video-calls', () => ({
  createVideoCall: createVideoCallMock,
  addVideoCallParticipants: addVideoCallParticipantsMock,
  endVideoCall: endVideoCallMock,
  getCall: getCallMock,
  getCallParticipants: getCallParticipantsMock,
  removeCallParticipant: removeCallParticipantMock,
}))

const {
  createVideoCallAction,
  addVideoCallParticipantsAction,
  endVideoCallAction,
  removeVideoCallParticipantAction,
} = await import('@/actions/video-calls')

beforeEach(() => {
  vi.clearAllMocks()
  whereQueue = []
  verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
})

describe('createVideoCallAction', () => {
  it('rejects an empty participant list', async () => {
    const res = await createVideoCallAction(null, { participantUserIds: [] })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/at least one other person/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('rejects more than the participant cap', async () => {
    const ids = Array.from({ length: 26 }, (_, i) => `user-${i}`)
    const res = await createVideoCallAction(null, { participantUserIds: ids })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/at most/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('rejects when a selected user id does not actually exist', async () => {
    queueWhere([{ id: 'u2' }]) // validateUserIds: only 1 of 2 requested ids found
    const res = await createVideoCallAction(null, { participantUserIds: ['u2', 'ghost'] })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/could not be found/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('excludes the caller from their own participant list before validating', async () => {
    queueWhere([{ id: 'u2' }]) // validateUserIds should only be checking ['u2'], not ['u1','u2']
    queueWhere([{ name: 'Alice' }])
    createVideoCallMock.mockResolvedValue({ id: 'call-1' })

    const res = await createVideoCallAction(null, { participantUserIds: ['u1', 'u2'] })

    expect(res.status).toBe('success')
    expect(createVideoCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: 'u1', participantUserIds: ['u2'] }),
    )
  })

  it('creates the call and returns its id on success', async () => {
    queueWhere([{ id: 'u2' }, { id: 'u3' }])
    queueWhere([{ name: 'Alice' }])
    createVideoCallMock.mockResolvedValue({ id: 'call-42' })

    const res = await createVideoCallAction(null, {
      title: '  Design sync  ',
      participantUserIds: ['u2', 'u3'],
    })

    expect(res).toEqual({ status: 'success', callId: 'call-42' })
    expect(createVideoCallMock).toHaveBeenCalledWith({
      creatorId: 'u1',
      creatorName: 'Alice',
      title: 'Design sync',
      participantUserIds: ['u2', 'u3'],
    })
  })

  it('rejects a scheduledFor value from a non-admin caller before calling createVideoCall', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' }) // not admin per the mocked isAdminRole
    queueWhere([{ id: 'u2' }]) // validateUserIds

    const res = await createVideoCallAction(null, {
      participantUserIds: ['u2'],
      scheduledFor: '2099-01-01T10:00:00.000Z',
    })

    expect(res.status).toBe('error')
    expect(res.message).toMatch(/only an admin can schedule/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid/past scheduledFor from an admin caller', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'super_admin' })
    queueWhere([{ id: 'u2' }]) // validateUserIds

    const res = await createVideoCallAction(null, {
      participantUserIds: ['u2'],
      scheduledFor: 'not-a-date',
    })

    expect(res.status).toBe('error')
    expect(res.message).toMatch(/valid future date/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('rejects a past scheduledFor from an admin caller', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'operations' })
    queueWhere([{ id: 'u2' }]) // validateUserIds

    const res = await createVideoCallAction(null, {
      participantUserIds: ['u2'],
      scheduledFor: '2000-01-01T10:00:00.000Z',
    })

    expect(res.status).toBe('error')
    expect(res.message).toMatch(/valid future date/i)
    expect(createVideoCallMock).not.toHaveBeenCalled()
  })

  it('parses a valid future scheduledFor from an admin caller and passes it through as a Date', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'super_admin' })
    queueWhere([{ id: 'u2' }]) // validateUserIds
    queueWhere([{ name: 'Alice' }]) // actor name lookup
    createVideoCallMock.mockResolvedValue({ id: 'call-99' })

    const res = await createVideoCallAction(null, {
      participantUserIds: ['u2'],
      scheduledFor: '2099-01-01T10:00:00.000Z',
    })

    expect(res).toEqual({ status: 'success', callId: 'call-99' })
    expect(createVideoCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor: new Date('2099-01-01T10:00:00.000Z') }),
    )
  })
})

describe('addVideoCallParticipantsAction', () => {
  it('rejects when the call does not exist', async () => {
    getCallMock.mockResolvedValue(undefined)
    const res = await addVideoCallParticipantsAction(null, { callId: 'nope', userIds: ['u2'] })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/not found/i)
  })

  it('rejects when the call has already ended', async () => {
    getCallMock.mockResolvedValue({ id: 'c1', status: 'ended', createdBy: 'u1' })
    const res = await addVideoCallParticipantsAction(null, { callId: 'c1', userIds: ['u2'] })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/ended/i)
  })

  it('rejects an actor who is not themselves a participant on this call', async () => {
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    getCallParticipantsMock.mockResolvedValue([{ userId: 'u9', name: 'Owner', role: 'design' }])
    const res = await addVideoCallParticipantsAction(null, { callId: 'c1', userIds: ['u2'] })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/only people already on this call/i)
    expect(addVideoCallParticipantsMock).not.toHaveBeenCalled()
  })

  it('adds valid new participants and notifies via the lib layer', async () => {
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u1' })
    getCallParticipantsMock.mockResolvedValue([{ userId: 'u1', name: 'Me', role: 'design' }])
    queueWhere([{ id: 'u2' }]) // validateUserIds
    queueWhere([{ name: 'Me' }]) // actor name lookup
    addVideoCallParticipantsMock.mockResolvedValue({ added: ['u2'] })

    const res = await addVideoCallParticipantsAction(null, { callId: 'c1', userIds: ['u2'] })

    expect(res.status).toBe('success')
    expect(addVideoCallParticipantsMock).toHaveBeenCalledWith({
      callId: 'c1',
      actorId: 'u1',
      actorName: 'Me',
      userIds: ['u2'],
    })
  })
})

describe('endVideoCallAction', () => {
  it('is idempotent when the call already ended', async () => {
    getCallMock.mockResolvedValue({ id: 'c1', status: 'ended', createdBy: 'u9' })
    const res = await endVideoCallAction(null, { callId: 'c1' })
    expect(res.status).toBe('success')
    expect(endVideoCallMock).not.toHaveBeenCalled()
  })

  it('rejects a non-creator, non-admin caller', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    const res = await endVideoCallAction(null, { callId: 'c1' })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/only whoever started/i)
    expect(endVideoCallMock).not.toHaveBeenCalled()
  })

  it('allows the creator to end the call', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u1' })
    endVideoCallMock.mockResolvedValue(undefined)
    const res = await endVideoCallAction(null, { callId: 'c1' })
    expect(res.status).toBe('success')
    expect(endVideoCallMock).toHaveBeenCalledWith('c1')
  })

  it('allows a super_admin to end someone else\'s call', async () => {
    verifyMock.mockResolvedValue({ userId: 'admin-1', role: 'super_admin' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    endVideoCallMock.mockResolvedValue(undefined)
    const res = await endVideoCallAction(null, { callId: 'c1' })
    expect(res.status).toBe('success')
    expect(endVideoCallMock).toHaveBeenCalledWith('c1')
  })
})

describe('removeVideoCallParticipantAction', () => {
  it('rejects when the call does not exist', async () => {
    getCallMock.mockResolvedValue(undefined)
    const res = await removeVideoCallParticipantAction(null, { callId: 'nope', userId: 'u2' })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/not found/i)
    expect(removeCallParticipantMock).not.toHaveBeenCalled()
  })

  it('rejects when the call has already ended', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'ended', createdBy: 'u1' })
    const res = await removeVideoCallParticipantAction(null, { callId: 'c1', userId: 'u2' })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/ended/i)
    expect(removeCallParticipantMock).not.toHaveBeenCalled()
  })

  it('rejects a non-creator, non-admin caller', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    const res = await removeVideoCallParticipantAction(null, { callId: 'c1', userId: 'u2' })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/only whoever started/i)
    expect(removeCallParticipantMock).not.toHaveBeenCalled()
  })

  it('rejects removing the call creator, even by an admin', async () => {
    verifyMock.mockResolvedValue({ userId: 'admin-1', role: 'super_admin' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    const res = await removeVideoCallParticipantAction(null, { callId: 'c1', userId: 'u9' })
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/creator can't be removed/i)
    expect(removeCallParticipantMock).not.toHaveBeenCalled()
  })

  it('allows the creator to remove a non-creator participant', async () => {
    verifyMock.mockResolvedValue({ userId: 'u1', role: 'design' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u1' })
    removeCallParticipantMock.mockResolvedValue(undefined)
    const res = await removeVideoCallParticipantAction(null, { callId: 'c1', userId: 'u2' })
    expect(res.status).toBe('success')
    expect(removeCallParticipantMock).toHaveBeenCalledWith('c1', 'u2')
  })

  it('allows an admin to remove a non-creator participant on a call they did not create', async () => {
    verifyMock.mockResolvedValue({ userId: 'admin-1', role: 'super_admin' })
    getCallMock.mockResolvedValue({ id: 'c1', status: 'active', createdBy: 'u9' })
    removeCallParticipantMock.mockResolvedValue(undefined)
    const res = await removeVideoCallParticipantAction(null, { callId: 'c1', userId: 'u2' })
    expect(res.status).toBe('success')
    expect(removeCallParticipantMock).toHaveBeenCalledWith('c1', 'u2')
  })
})
