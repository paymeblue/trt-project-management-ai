import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'
import { verifyTabToken, mintTabAccessToken, ACCESS_TTL_S } from '@/lib/tab-session'

export const dynamic = 'force-dynamic'

// Mints a fresh per-tab access token from a still-valid per-tab refresh
// token. This is the credential SOURCE for the header-based auth path — it
// deliberately never calls verifySession(), which would require an access
// token (or the shared cookie) to already be present.
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 })
  }

  const refreshToken =
    typeof body === 'object' && body !== null && 'refreshToken' in body
      ? (body as Record<string, unknown>).refreshToken
      : undefined

  if (typeof refreshToken !== 'string' || !refreshToken) {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 })
  }

  const payload = await verifyTabToken(refreshToken)
  if (!payload?.sub || payload.typ !== 'refresh') {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
  }

  // Bug fix (found live during Plan 20.1-04's checkpoint, HIGH severity): the
  // refresh token deliberately never carries a `role` claim (mintTabRefreshToken),
  // so `payload.role` is always undefined here — minting the refreshed access
  // token from it silently baked in role: '', breaking role-gated auth for any
  // tab open past the access-token TTL with no error surfaced. Look up the
  // user's CURRENT role from the DB instead — also more correct than trusting a
  // stale claim, since a role change should take effect on the next refresh.
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, payload.sub)).limit(1)
  if (!user) {
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
  }

  const accessToken = await mintTabAccessToken(payload.sub, user.role)

  return NextResponse.json({
    accessToken,
    expiresAt: Date.now() + ACCESS_TTL_S * 1000,
  })
}
