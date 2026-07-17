import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("server-only", () => ({}))

beforeAll(() => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-for-tab-session-tests"
})

describe("lib/tab-session.ts", () => {
  it("mintTabAccessToken round-trips through verifyTabToken as typ: access", async () => {
    const { mintTabAccessToken, verifyTabToken } = await import("@/lib/tab-session")
    const token = await mintTabAccessToken("user-1", "factory_pm")
    const payload = await verifyTabToken(token)
    expect(payload).toEqual({ sub: "user-1", role: "factory_pm", typ: "access" })
  })

  it("mintTabRefreshToken round-trips through verifyTabToken as typ: refresh", async () => {
    const { mintTabRefreshToken, verifyTabToken } = await import("@/lib/tab-session")
    const token = await mintTabRefreshToken("user-2")
    const payload = await verifyTabToken(token)
    expect(payload).toEqual({ sub: "user-2", role: undefined, typ: "refresh" })
  })

  it("verifyTabToken returns null (not a thrown error) for a garbage string", async () => {
    const { verifyTabToken } = await import("@/lib/tab-session")
    await expect(verifyTabToken("not-a-real-token")).resolves.toBeNull()
  })

  it("verifyTabToken never throws even when decode() itself throws", async () => {
    vi.resetModules()
    vi.doMock("next-auth/jwt", () => ({
      encode: vi.fn(),
      decode: vi.fn(() => {
        throw new Error("boom")
      }),
    }))
    const { verifyTabToken } = await import("@/lib/tab-session")
    await expect(verifyTabToken("anything")).resolves.toBeNull()
    vi.doUnmock("next-auth/jwt")
    vi.resetModules()
  })
})
