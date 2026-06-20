import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { authConfig } from "@/auth.config"
import { db } from "@/db"
import { users } from "@/db/schema"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim()
        const password = String(creds?.password ?? "")
        if (!email || !password) return null
        const user = await db.query.users.findFirst({ where: eq(users.email, email) })
        if (!user?.hashedPassword) return null
        const ok = await bcrypt.compare(password, user.hashedPassword)
        if (!ok) return null
        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
})
