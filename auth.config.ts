import type { NextAuthConfig } from "next-auth"

export const authConfig = {
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
        token.id = user.id
        token.role = (user as { role?: string }).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as "factory_pm" | "site_pm" | "super_admin"
      }
      return session
    },
  },
  providers: [],
} satisfies NextAuthConfig
