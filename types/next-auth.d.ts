import type { DefaultSession } from "next-auth"

type Role = "factory_pm" | "site_pm" | "super_admin"

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
