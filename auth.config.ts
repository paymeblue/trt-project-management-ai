import type { NextAuthConfig } from "next-auth"
import type { UserRole } from "@/lib/workflow"

export const authConfig = {
  // Auth.js auto-trusts the host only on Vercel; Netlify (and other hosts) need
  // this explicitly or auth throws a server-configuration error in production.
  trustHost: true,
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const path = request.nextUrl.pathname
      const isPublic = ["/sign-in", "/sign-up", "/reset-password", "/verify-email", "/"].some(
        (p) => path === p || path.startsWith("/api/auth"),
      )
      if (isPublic) return true
      return isLoggedIn
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = user.role as UserRole
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
