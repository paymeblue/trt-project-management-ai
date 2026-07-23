import { describe, it, expect, beforeEach, vi } from 'vitest'

// Coverage for lib/video-chat.ts — GetStream Chat's server-side surface.
// Mirrors tests/lib/video-calls.test.ts's mocking conventions: a fake
// StreamChat client (getInstance/channel/createToken) so no real network
// call ever happens, and process.env set before the module-under-test is
// imported (this file's chatServerClient() singleton lazily reads
// GETSTREAM_APIKEY/GETSTREAM_SECRET on first use, same as streamClient()).

const { getInstanceMock, channelFactoryMock, createMock, addMembersMock, createTokenMock } = vi.hoisted(() => ({
  getInstanceMock: vi.fn(),
  channelFactoryMock: vi.fn(),
  createMock: vi.fn(),
  addMembersMock: vi.fn(),
  createTokenMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
// lib/video-calls.ts's requiredEnv is reused as-is (per CONTEXT.md — no
// separate credential handling), but importing the REAL lib/video-calls.ts
// here would pull in its own heavy chain (@/db, @stream-io/node-sdk,
// notifications) purely to reach one trivial env-var helper. Mock just that
// export, with the same trim-and-throw behavior, to keep this file's
// coverage scoped to lib/video-chat.ts's own logic.
vi.mock('@/lib/video-calls', () => ({
  requiredEnv: (name: string) => {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is not configured — video calls are unavailable.`)
    return value
  },
}))
vi.mock('stream-chat', () => ({
  StreamChat: {
    getInstance: (...args: unknown[]) => {
      getInstanceMock(...args)
      return {
        channel: (...channelArgs: unknown[]) => {
          channelFactoryMock(...channelArgs)
          return { create: createMock, addMembers: addMembersMock }
        },
        createToken: createTokenMock,
      }
    },
  },
}))

process.env.GETSTREAM_APIKEY = 'test-api-key'
process.env.GETSTREAM_SECRET = 'test-secret'

const { mintChatToken, getOrCreateChatChannel, addChatChannelMembers } = await import('@/lib/video-chat')

beforeEach(() => {
  vi.clearAllMocks()
  createMock.mockResolvedValue(undefined)
  addMembersMock.mockResolvedValue(undefined)
  createTokenMock.mockReturnValue('fake-chat-token')
})

describe('getOrCreateChatChannel', () => {
  it('creates a messaging channel keyed by callId with the given members', async () => {
    await getOrCreateChatChannel('call-1', ['u1', 'u2'])

    expect(channelFactoryMock).toHaveBeenCalledWith('messaging', 'call-1', {
      members: ['u1', 'u2'],
      created_by_id: 'u1',
    })
    expect(createMock).toHaveBeenCalledOnce()
  })
})

describe('addChatChannelMembers', () => {
  it('adds the given users to the existing channel', async () => {
    await addChatChannelMembers('call-1', ['u3'])

    expect(channelFactoryMock).toHaveBeenCalledWith('messaging', 'call-1')
    expect(addMembersMock).toHaveBeenCalledWith(['u3'])
  })
})

describe('mintChatToken', () => {
  it('mints a token with a numeric future expiry', () => {
    const token = mintChatToken('u1')

    expect(token).toBe('fake-chat-token')
    expect(createTokenMock).toHaveBeenCalledWith('u1', expect.any(Number))
    const exp = createTokenMock.mock.calls[0][1] as number
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })
})
