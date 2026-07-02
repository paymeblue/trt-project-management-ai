import type { DefaultSession } from "next-auth"
import type { UserRole } from "@/lib/workflow"

// Derived from the single source of truth so new departments never drift here.
type Role = UserRole

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"]
  }
  interface User {
    role: Role
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: Role
  }
}
