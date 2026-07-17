import "server-only"
import { cache } from "react"
import { redirect, forbidden } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/auth"
import { verifyTabToken } from "@/lib/tab-session"
import { isAdminRole, type UserRole } from "@/lib/workflow"

export type Role = UserRole
export { isAdminRole }

export const verifySession = cache(async (): Promise<{ userId: string; role: Role }> => {
  const authorization = (await headers()).get("authorization")
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length)
    const payload = await verifyTabToken(token)
    // Fail closed: an invalid/expired header must never fall through to the
    // shared cookie — that would resolve to whichever user's cookie happens
    // to be in the browser, i.e. a different tab's identity (D-20.1-01-C).
    if (!payload || payload.typ !== "access") redirect("/sign-in")
    return { userId: payload.sub, role: payload.role as Role }
  }

  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  return { userId: session.user.id, role: session.user.role as Role }
})

export async function requireRole(role: Role) {
  const s = await verifySession()
  if (s.role !== role) forbidden()
  return s
}

// super_admin OR operations — both have full admin rights.
export async function requireAdmin() {
  const s = await verifySession()
  if (!isAdminRole(s.role)) forbidden()
  return s
}

export async function requireOwnerOrAdmin(ownerId: string) {
  const s = await verifySession()
  if (s.role === "super_admin") return s
  if (s.userId !== ownerId) forbidden()
  return s
}
