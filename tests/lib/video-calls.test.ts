import { describe, it, expect, beforeEach, vi } from 'vitest'

// Coverage for lib/video-calls.ts's actual business logic: member-id
// deduplication, excluding the creator from their own notification fan-out,
// skipping already-present participants when adding more, and
// ensureCallParticipant's idempotency (no duplicate row, no notification,
// no crash on a second call). GetStream itself is mocked — this only proves
// OUR logic calls it with the right shape, not GetStream's own behavior.

const {
  notifyUserMock,
  getOrCreateMock,
  updateCallMembersMock,
  endMock,
  upsertUsersMock,
  callFactoryMock,
  insertValuesMock,
  returningMock,
  onConflictDoNothingMock,
  selectWhereMock,
  updateSetMock,
  updateWhereMock,
  deleteWhereMock,
  getOrCreateChatChannelMock,
  addChatChannelMembersMock,
} = vi.hoisted(() => ({
  notifyUserMock: vi.fn(),
  getOrCreateMock: vi.fn(),
  updateCallMembersMock: vi.fn(),
  endMock: vi.fn(),
  upsertUsersMock: vi.fn(),
  callFactoryMock: vi.fn(),
  insertValuesMock: vi.fn(),
  returningMock: vi.fn(),
  onConflictDoNothingMock: vi.fn(),
  selectWhereMock: vi.fn(),
  updateSetMock: vi.fn(),
  updateWhereMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  getOrCreateChatChannelMock: vi.fn(),
  addChatChannelMembersMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notifications', () => ({ notifyUser: notifyUserMock }))
// Chat-channel lifecycle (lib/video-chat.ts) is mocked wholesale here — its
// own behavior is covered by tests/lib/video-chat.test.ts; this file only
// proves lib/video-calls.ts calls it at the right call sites with the right
// args, mirroring how @stream-io/node-sdk itself is faked below.
vi.mock('@/lib/video-chat', () => ({
  getOrCreateChatChannel: getOrCreateChatChannelMock,
  addChatChannelMembers: addChatChannelMembersMock,
}))
// A real function (not an arrow fn) so `new StreamClient(...)` works.
function FakeStreamClient() {
  return {
    upsertUsers: upsertUsersMock,
    video: {
      call: (...args: unknown[]) => {
        callFactoryMock(...args)
        return { getOrCreate: getOrCreateMock, updateCallMembers: updateCallMembersMock, end: endMock }
      },
    },
  }
}
vi.mock('@stream-io/node-sdk', () => ({ StreamClient: FakeStreamClient }))

vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (rows: unknown) => {
        insertValuesMock(rows)
        // Thenable AND chainable: createVideoCall awaits the bulk
        // participants insert directly (no further chain), while the
        // video_calls insert chains .returning(), and
        // ensureCallParticipant chains .onConflictDoNothing().
        const p = Promise.resolve(undefined) as Promise<unknown> & {
          returning: () => Promise<unknown>
          onConflictDoNothing: () => Promise<unknown>
        }
        p.returning = returningMock
        p.onConflictDoNothing = onConflictDoNothingMock
        return p
      },
    }),
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          const value = selectWhereMock(...args)
          // Both awaited bare (`await ...where(...)`) and chained
          // (`...where(...).limit(1)`) resolve to the same queued value —
          // Promise.resolve() flattens a nested thenable either way, so this
          // works whether `value` is a plain array or itself a Promise (from
          // `selectWhereMock.mockResolvedValue(...)`).
          const p = Promise.resolve(value) as Promise<unknown> & { limit: (n: number) => Promise<unknown> }
          p.limit = () => Promise.resolve(value)
          return p
        },
      }),
    }),
    update: () => ({
      set: (patch: unknown) => {
        updateSetMock(patch)
        return { where: updateWhereMock }
      },
    }),
    delete: () => ({ where: deleteWhereMock }),
  },
}))

process.env.GETSTREAM_APIKEY = 'test-api-key'
process.env.GETSTREAM_SECRET = 'test-secret'

const { createVideoCall, addVideoCallParticipants, ensureCallParticipant, removeCallParticipant } = await import(
  '@/lib/video-calls'
)

beforeEach(() => {
  vi.clearAllMocks()
  getOrCreateMock.mockResolvedValue(undefined)
  updateCallMembersMock.mockResolvedValue(undefined)
  upsertUsersMock.mockResolvedValue(undefined)
  returningMock.mockResolvedValue([{ id: 'call-1' }])
  onConflictDoNothingMock.mockResolvedValue(undefined)
  updateWhereMock.mockResolvedValue(undefined)
  deleteWhereMock.mockResolvedValue(undefined)
  getOrCreateChatChannelMock.mockResolvedValue(undefined)
  addChatChannelMembersMock.mockResolvedValue(undefined)
  // Safe default for upsertVideoCallUsers' own select — individual tests
  // override this when they also need it for their own select-based checks
  // (existing participants / existence checks).
  selectWhereMock.mockResolvedValue([])
})

describe('createVideoCall', () => {
  it('deduplicates the creator out of their own participant list and notifies only invitees', async () => {
    await createVideoCall({
      creatorId: 'u1',
      creatorName: 'Alice',
      title: 'Sync',
      participantUserIds: ['u1', 'u2', 'u2', 'u3'], // creator redundantly included, u2 duplicated
    })

    // video_calls row insert, then one bulk participants insert.
    const participantsCall = insertValuesMock.mock.calls.find((c) => Array.isArray(c[0]))
    const rows = participantsCall?.[0] as { userId: string; invitedBy: string | null }[]
    expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2', 'u3'])
    expect(rows.find((r) => r.userId === 'u1')?.invitedBy).toBeNull()
    expect(rows.find((r) => r.userId === 'u2')?.invitedBy).toBe('u1')

    // GetStream call created with the same deduplicated member set.
    expect(callFactoryMock).toHaveBeenCalledWith('default', 'call-1')
    expect(getOrCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: expect.arrayContaining([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }]),
        }),
      }),
    )
    expect(getOrCreateMock.mock.calls[0][0].data.members).toHaveLength(3)

    // Notified u2 and u3 exactly once each — never the creator.
    expect(notifyUserMock).toHaveBeenCalledTimes(2)
    const notifiedIds = notifyUserMock.mock.calls.map((c) => c[0].recipientId).sort()
    expect(notifiedIds).toEqual(['u2', 'u3'])
    expect(notifyUserMock.mock.calls.every((c) => c[0].callId === 'call-1')).toBe(true)

    // Every member must exist on GetStream's side before getOrCreate — this
    // is what fixed the live "GetOrCreateCall failed: ...don't exist" error.
    expect(upsertUsersMock).toHaveBeenCalledOnce()

    // Chat channel lifecycle mirrors the video-call membership mutation —
    // same deduplicated member set, called only after getOrCreate succeeds.
    expect(getOrCreateChatChannelMock).toHaveBeenCalledWith('call-1', expect.arrayContaining(['u1', 'u2', 'u3']))
    expect(getOrCreateChatChannelMock.mock.calls[0][1]).toHaveLength(3)
  })
})

describe('addVideoCallParticipants', () => {
  it('skips ids already on the call and only notifies genuinely new ones', async () => {
    // First select: existing-participants check. Second select: upsertVideoCallUsers'
    // own {id, name} lookup for the newly-added user (name must be a real string —
    // toTitleCase is called on it, and users.name is notNull in the real schema).
    selectWhereMock
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([{ id: 'u3', name: 'U3' }])

    const result = await addVideoCallParticipants({
      callId: 'call-1',
      actorId: 'u1',
      actorName: 'Alice',
      userIds: ['u2', 'u3'], // u2 already present, u3 is new
    })

    expect(result.added).toEqual(['u3'])
    expect(updateCallMembersMock).toHaveBeenCalledWith({ update_members: [{ user_id: 'u3' }] })
    expect(notifyUserMock).toHaveBeenCalledTimes(1)
    expect(notifyUserMock).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'u3', callId: 'call-1' }))
    expect(upsertUsersMock).toHaveBeenCalledOnce()
    expect(addChatChannelMembersMock).toHaveBeenCalledWith('call-1', ['u3'])
  })

  it('is a no-op when every requested id is already a participant', async () => {
    selectWhereMock.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])

    const result = await addVideoCallParticipants({
      callId: 'call-1',
      actorId: 'u1',
      actorName: 'Alice',
      userIds: ['u2'],
    })

    expect(result.added).toEqual([])
    expect(updateCallMembersMock).not.toHaveBeenCalled()
    expect(notifyUserMock).not.toHaveBeenCalled()
    expect(addChatChannelMembersMock).not.toHaveBeenCalled()
  })
})

describe('ensureCallParticipant', () => {
  it('does nothing when the user is already a participant', async () => {
    selectWhereMock.mockResolvedValue([{ id: 'existing-row' }])

    await ensureCallParticipant('call-1', 'u1')

    expect(insertValuesMock).not.toHaveBeenCalled()
    expect(updateCallMembersMock).not.toHaveBeenCalled()
    expect(addChatChannelMembersMock).not.toHaveBeenCalled()
  })

  it('inserts a participant row and adds the GetStream member when not already present', async () => {
    selectWhereMock.mockResolvedValue([])

    await ensureCallParticipant('call-1', 'u1')

    expect(insertValuesMock).toHaveBeenCalledWith({ callId: 'call-1', userId: 'u1', invitedBy: null })
    expect(updateCallMembersMock).toHaveBeenCalledWith({ update_members: [{ user_id: 'u1' }] })
    expect(upsertUsersMock).toHaveBeenCalledOnce()
    // Joining via a link is never a notified event — the user is already on the page.
    expect(notifyUserMock).not.toHaveBeenCalled()
    // Covers users who join via a shared link rather than an explicit invite.
    expect(addChatChannelMembersMock).toHaveBeenCalledWith('call-1', ['u1'])
  })
})

describe('removeCallParticipant', () => {
  it('deletes the participant row and removes the GetStream call member', async () => {
    await removeCallParticipant('call-1', 'u2')

    expect(deleteWhereMock).toHaveBeenCalledOnce()
    expect(callFactoryMock).toHaveBeenCalledWith('default', 'call-1')
    expect(updateCallMembersMock).toHaveBeenCalledWith({ remove_members: ['u2'] })
  })

  it('does not throw when GetStream removal fails — our own DB row is the source of truth', async () => {
    updateCallMembersMock.mockRejectedValueOnce(new Error('GetStream unavailable'))

    await expect(removeCallParticipant('call-1', 'u2')).resolves.toBeUndefined()
    expect(deleteWhereMock).toHaveBeenCalledOnce()
  })
})
