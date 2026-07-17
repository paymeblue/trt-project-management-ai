'use server';

import { z } from 'zod';
import { verifyCredentials } from '@/lib/auth/verify-credentials';
import { mintTabAccessToken, mintTabRefreshToken, ACCESS_TTL_S } from '@/lib/tab-session';

// ── Action result type ───────────────────────────────────────────────────────

export type TabSigninState = {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

// ── tabSigninAction ──────────────────────────────────────────────────────────

const TabSigninSchema = z.object({
  email: z.email({ error: 'Please enter a valid email address.' }),
  password: z.string().min(1, { error: 'Password is required.' }),
});

// Per-tab "sign in as a different user" Server Action. Verifies credentials
// independently of next-auth's Credentials provider and mints per-tab tokens
// — it NEVER touches next-auth's sign-in helper (which sets the shared
// cookie, signing in every other open tab as this user) and NEVER navigates
// server-side (a server-side navigation would discard the freshly-minted
// tokens before the client can capture them into sessionStorage). The caller
// is responsible for storing the returned tokens and navigating client-side.
export async function tabSigninAction(
  _prevState: TabSigninState,
  formData: FormData,
): Promise<TabSigninState> {
  const parsed = TabSigninSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? 'Invalid credentials.',
    };
  }
  const { email, password } = parsed.data;

  const user = await verifyCredentials(email, password);
  if (!user) {
    return { message: 'Invalid email or password.' };
  }

  const accessToken = await mintTabAccessToken(user.id, user.role);
  const refreshToken = await mintTabRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + ACCESS_TTL_S * 1000,
  };
}
