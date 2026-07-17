import { NextResponse } from 'next/server'
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

  const accessToken = await mintTabAccessToken(payload.sub, payload.role ?? '')

  return NextResponse.json({
    accessToken,
    expiresAt: Date.now() + ACCESS_TTL_S * 1000,
  })
}
