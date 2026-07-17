import "server-only"
import { encode, decode } from "next-auth/jwt"

const TAB_SALT = "trt-pm.tab-session"
export const ACCESS_TTL_S = 20 * 60
export const REFRESH_TTL_S = 8 * 60 * 60

export type TabTokenType = "access" | "refresh"

export interface TabTokenPayload {
  sub: string
  role?: string
  typ: TabTokenType
}

export async function mintTabAccessToken(userId: string, role: string): Promise<string> {
  return encode({
    secret: process.env.AUTH_SECRET!,
    salt: TAB_SALT,
    maxAge: ACCESS_TTL_S,
    token: { sub: userId, role, typ: "access" },
  })
}

export async function mintTabRefreshToken(userId: string): Promise<string> {
  return encode({
    secret: process.env.AUTH_SECRET!,
    salt: TAB_SALT,
    maxAge: REFRESH_TTL_S,
    token: { sub: userId, typ: "refresh" },
  })
}

export async function verifyTabToken(token: string): Promise<TabTokenPayload | null> {
  try {
    const payload = await decode({
      secret: process.env.AUTH_SECRET!,
      salt: TAB_SALT,
      token,
    })
    if (!payload || typeof payload.sub !== "string" || !payload.sub) return null
    if (payload.typ !== "access" && payload.typ !== "refresh") return null
    return {
      sub: payload.sub,
      role: typeof payload.role === "string" ? payload.role : undefined,
      typ: payload.typ,
    }
  } catch {
    return null
  }
}
