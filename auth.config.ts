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
      const isLoggedIn = !!auth?.user || request.headers.has('authorization')
      const path = request.nextUrl.pathname
      // /tab-session/restore is the identity-agnostic per-tab-session bounce
      // page (Phase 20.1 hard-refresh recovery) — it renders no data and must
      // stay reachable even when the shared cookie is missing/expired.
      const isPublic = [
        "/sign-in",
        "/sign-up",
        "/reset-password",
        "/verify-email",
        "/tab-session/restore",
        "/",
      ].some((p) => path === p || path.startsWith("/api/auth"))
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
