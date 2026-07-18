import "server-only"
import { cache } from "react"
import { redirect, forbidden } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/auth"
import { verifyTabToken } from "@/lib/tab-session"
import { isAdminRole, type UserRole } from "@/lib/workflow"

export type Role = UserRole
export { isAdminRole }

// Given a raw bearer token string, decode + check typ==='access' + fail
// closed. Shared by verifySession()'s header branch and
// verifySessionForAction() (D-20.1-04-B) — a single choke point for
// per-tab-token verification so the two call sites can never drift apart.
async function resolveTabIdentity(rawToken: string): Promise<{ userId: string; role: Role }> {
  const payload = await verifyTabToken(rawToken)
  // Fail closed: an invalid/expired token must never fall through to the
  // shared cookie — that would resolve to whichever user's cookie happens
  // to be in the browser, i.e. a different tab's identity (D-20.1-01-C).
  if (!payload || payload.typ !== "access") redirect("/sign-in")
  return { userId: payload.sub, role: payload.role as Role }
}

export const verifySession = cache(async (): Promise<{ userId: string; role: Role }> => {
  const authorization = (await headers()).get("authorization")
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length)
    return resolveTabIdentity(token)
  }

  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  return { userId: session.user.id, role: session.user.role as Role }
})

// Server-Action-callable sibling to verifySession(). Server Actions cannot
// receive a client-attached Authorization header (there is no request the
// client controls headers on) — the per-tab token must instead travel as an
// ordinary bound function argument (RESEARCH.md Pattern 3). NOT wrapped in
// cache(): each Server Action invocation is a distinct call, not part of a
// shared Server-Component render pass.
export async function verifySessionForAction(
  explicitToken?: string | null,
): Promise<{ userId: string; role: Role }> {
  if (explicitToken) return resolveTabIdentity(explicitToken)

  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  return { userId: session.user.id, role: session.user.role as Role }
}

// Server-Action-callable sibling to requireAdmin(), same rationale as
// verifySessionForAction: Server Action POSTs carry no Authorization header,
// so the per-tab token must arrive as an explicit bound argument.
export async function requireAdminForAction(explicitToken?: string | null) {
  const s = await verifySessionForAction(explicitToken)
  if (!isAdminRole(s.role)) forbidden()
  return s
}

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
