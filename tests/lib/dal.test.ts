import { describe, it, expect, vi, beforeEach } from "vitest"

const authMock = vi.fn()
const headersGetMock = vi.fn(() => null as string | null)
const verifyTabTokenMock = vi.fn()

vi.mock("@/auth", () => ({ auth: () => authMock() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT")
  }),
  forbidden: vi.fn(() => {
    throw new Error("FORBIDDEN")
  }),
}))
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headersGetMock }),
}))
vi.mock("@/lib/tab-session", () => ({
  verifyTabToken: (token: string) => verifyTabTokenMock(token),
}))
vi.mock("server-only", () => ({}))

beforeEach(() => {
  authMock.mockReset()
  headersGetMock.mockReset()
  headersGetMock.mockReturnValue(null)
  verifyTabTokenMock.mockReset()
  vi.resetModules()
})

describe("DAL (NextAuth session-based)", () => {
  describe("verifySession()", () => {
    it("AUTH-07: rejects with REDIRECT when no session (auth() returns null)", async () => {
      authMock.mockResolvedValue(null)
      const { verifySession } = await import("@/lib/dal")
      await expect(verifySession()).rejects.toThrow("REDIRECT")
    })

    it("AUTH-07: rejects with REDIRECT when session has no user id", async () => {
      authMock.mockResolvedValue({ user: {} })
      const { verifySession } = await import("@/lib/dal")
      await expect(verifySession()).rejects.toThrow("REDIRECT")
    })

    it("returns { userId, role } for a valid session", async () => {
      authMock.mockResolvedValue({ user: { id: "u1", role: "site_pm" } })
      const { verifySession } = await import("@/lib/dal")
      const result = await verifySession()
      expect(result).toEqual({ userId: "u1", role: "site_pm" })
    })
  })

  describe("requireRole()", () => {
    it("AUTH-06: throws FORBIDDEN when role does not match", async () => {
      authMock.mockResolvedValue({ user: { id: "u2", role: "site_pm" } })
      const { requireRole } = await import("@/lib/dal")
      await expect(requireRole("factory_pm")).rejects.toThrow("FORBIDDEN")
    })

    it("returns session when role matches", async () => {
      authMock.mockResolvedValue({ user: { id: "u3", role: "factory_pm" } })
      const { requireRole } = await import("@/lib/dal")
      const result = await requireRole("factory_pm")
      expect(result).toEqual({ userId: "u3", role: "factory_pm" })
    })
  })

  describe("requireOwnerOrAdmin()", () => {
    it("super_admin passes regardless of ownerId", async () => {
      authMock.mockResolvedValue({ user: { id: "admin1", role: "super_admin" } })
      const { requireOwnerOrAdmin } = await import("@/lib/dal")
      const result = await requireOwnerOrAdmin("some-other-user")
      expect(result).toEqual({ userId: "admin1", role: "super_admin" })
    })

    it("owner with matching userId passes", async () => {
      authMock.mockResolvedValue({ user: { id: "owner1", role: "site_pm" } })
      const { requireOwnerOrAdmin } = await import("@/lib/dal")
      const result = await requireOwnerOrAdmin("owner1")
      expect(result).toEqual({ userId: "owner1", role: "site_pm" })
    })

    it("non-owner non-admin throws FORBIDDEN", async () => {
      authMock.mockResolvedValue({ user: { id: "u4", role: "site_pm" } })
      const { requireOwnerOrAdmin } = await import("@/lib/dal")
      await expect(requireOwnerOrAdmin("someone-else")).rejects.toThrow("FORBIDDEN")
    })
  })

  describe("verifySession() — per-tab Authorization header (D-06)", () => {
    it("valid Bearer header with typ: access returns { userId, role } from the token, without calling auth()", async () => {
      headersGetMock.mockReturnValue("Bearer valid-access-token")
      verifyTabTokenMock.mockResolvedValue({ sub: "tab-user-1", role: "factory_pm", typ: "access" })
      const { verifySession } = await import("@/lib/dal")
      const result = await verifySession()
      expect(result).toEqual({ userId: "tab-user-1", role: "factory_pm" })
      expect(verifyTabTokenMock).toHaveBeenCalledWith("valid-access-token")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("invalid/expired Bearer header (verifyTabToken resolves null) throws REDIRECT and does NOT call auth() (fail-closed, D-20.1-01-C)", async () => {
      headersGetMock.mockReturnValue("Bearer expired-or-garbage")
      verifyTabTokenMock.mockResolvedValue(null)
      const { verifySession } = await import("@/lib/dal")
      await expect(verifySession()).rejects.toThrow("REDIRECT")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("a refresh-typed token presented as an access token throws REDIRECT and does NOT call auth()", async () => {
      headersGetMock.mockReturnValue("Bearer some-refresh-token")
      verifyTabTokenMock.mockResolvedValue({ sub: "tab-user-2", typ: "refresh" })
      const { verifySession } = await import("@/lib/dal")
      await expect(verifySession()).rejects.toThrow("REDIRECT")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("no Authorization header at all falls through to the existing auth() cookie path unchanged", async () => {
      headersGetMock.mockReturnValue(null)
      authMock.mockResolvedValue({ user: { id: "cookie-user", role: "site_pm" } })
      const { verifySession } = await import("@/lib/dal")
      const result = await verifySession()
      expect(result).toEqual({ userId: "cookie-user", role: "site_pm" })
      expect(verifyTabTokenMock).not.toHaveBeenCalled()
    })
  })

  describe("verifySessionForAction()", () => {
    it("explicit valid token: returns { userId, role } from the token, without calling auth()", async () => {
      verifyTabTokenMock.mockResolvedValue({ sub: "tab-user-3", role: "operations", typ: "access" })
      const { verifySessionForAction } = await import("@/lib/dal")
      const result = await verifySessionForAction("valid-access-token")
      expect(result).toEqual({ userId: "tab-user-3", role: "operations" })
      expect(verifyTabTokenMock).toHaveBeenCalledWith("valid-access-token")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("explicit invalid/expired token: throws REDIRECT and does NOT call auth() (fail-closed)", async () => {
      verifyTabTokenMock.mockResolvedValue(null)
      const { verifySessionForAction } = await import("@/lib/dal")
      await expect(verifySessionForAction("expired-or-garbage")).rejects.toThrow("REDIRECT")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("explicit token with typ='refresh': throws REDIRECT and does NOT call auth()", async () => {
      verifyTabTokenMock.mockResolvedValue({ sub: "tab-user-4", typ: "refresh" })
      const { verifySessionForAction } = await import("@/lib/dal")
      await expect(verifySessionForAction("some-refresh-token")).rejects.toThrow("REDIRECT")
      expect(authMock).not.toHaveBeenCalled()
    })

    it("explicitToken omitted: falls through to the mocked auth() cookie path", async () => {
      authMock.mockResolvedValue({ user: { id: "cookie-user-2", role: "factory_pm" } })
      const { verifySessionForAction } = await import("@/lib/dal")
      const result = await verifySessionForAction()
      expect(result).toEqual({ userId: "cookie-user-2", role: "factory_pm" })
      expect(verifyTabTokenMock).not.toHaveBeenCalled()
    })

    it("explicitToken = null: falls through to the mocked auth() cookie path", async () => {
      authMock.mockResolvedValue({ user: { id: "cookie-user-3", role: "site_pm" } })
      const { verifySessionForAction } = await import("@/lib/dal")
      const result = await verifySessionForAction(null)
      expect(result).toEqual({ userId: "cookie-user-3", role: "site_pm" })
      expect(verifyTabTokenMock).not.toHaveBeenCalled()
    })

    it("explicitToken = undefined explicitly passed: falls through to the mocked auth() cookie path", async () => {
      authMock.mockResolvedValue({ user: { id: "cookie-user-4", role: "site_pm" } })
      const { verifySessionForAction } = await import("@/lib/dal")
      const result = await verifySessionForAction(undefined)
      expect(result).toEqual({ userId: "cookie-user-4", role: "site_pm" })
      expect(verifyTabTokenMock).not.toHaveBeenCalled()
    })

    it("explicitToken = empty string: falls through to the mocked auth() cookie path (treated as no token)", async () => {
      authMock.mockResolvedValue({ user: { id: "cookie-user-5", role: "site_pm" } })
      const { verifySessionForAction } = await import("@/lib/dal")
      const result = await verifySessionForAction("")
      expect(result).toEqual({ userId: "cookie-user-5", role: "site_pm" })
      expect(verifyTabTokenMock).not.toHaveBeenCalled()
    })

    it("auth() returns null even with no explicit token: throws REDIRECT", async () => {
      authMock.mockResolvedValue(null)
      const { verifySessionForAction } = await import("@/lib/dal")
      await expect(verifySessionForAction()).rejects.toThrow("REDIRECT")
    })
  })
})
