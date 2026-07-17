import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { authConfig } from "@/auth.config"
import { verifyCredentials } from "@/lib/auth/verify-credentials"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "")
        const password = String(creds?.password ?? "")
        return verifyCredentials(email, password)
      },
    }),
  ],
})
