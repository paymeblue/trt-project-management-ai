import "server-only"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"

export async function verifyCredentials(email: string, password: string) {
  const normalizedEmail = String(email ?? "").toLowerCase().trim()
  const normalizedPassword = String(password ?? "")
  if (!normalizedEmail || !normalizedPassword) return null
  const user = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) })
  if (!user?.hashedPassword) return null
  const ok = await bcrypt.compare(normalizedPassword, user.hashedPassword)
  if (!ok) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}
