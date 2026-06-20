import { describe, it, expect, vi, beforeEach } from "vitest"

const authMock = vi.fn()

vi.mock("@/auth", () => ({ auth: () => authMock() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT")
  }),
  forbidden: vi.fn(() => {
    throw new Error("FORBIDDEN")
  }),
}))
vi.mock("server-only", () => ({}))

beforeEach(() => {
  authMock.mockReset()
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
})
