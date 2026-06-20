import "server-only"
import { cache } from "react"
import { redirect, forbidden } from "next/navigation"
import { auth } from "@/auth"

export type Role = "factory_pm" | "site_pm" | "super_admin"

export const verifySession = cache(async (): Promise<{ userId: string; role: Role }> => {
  const session = await auth()
  if (!session?.user?.id) redirect("/sign-in")
  return { userId: session.user.id, role: session.user.role as Role }
})

export async function requireRole(role: Role) {
  const s = await verifySession()
  if (s.role !== role) forbidden()
  return s
}

export async function requireOwnerOrAdmin(ownerId: string) {
  const s = await verifySession()
  if (s.role === "super_admin") return s
  if (s.userId !== ownerId) forbidden()
  return s
}
