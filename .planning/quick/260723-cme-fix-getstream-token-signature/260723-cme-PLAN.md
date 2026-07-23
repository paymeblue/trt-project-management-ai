---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [lib/video-calls.ts]
autonomous: true
requirements: []
must_haves:
  truths:
    - "GetStream API key and secret are read from env vars at call time, not hardcoded literals"
    - "No credential-fragment diagnostic logging remains in lib/video-calls.ts"
    - "Video call token minting, user upsert, and call-membership updates all use the full, untruncated GETSTREAM_SECRET from .env.local"
  artifacts:
    - path: "lib/video-calls.ts"
      provides: "streamClient() and mintVideoToken() reading GETSTREAM_APIKEY/GETSTREAM_SECRET via requiredEnv()"
  key_links:
    - from: "lib/video-calls.ts streamClient()"
      to: "process.env.GETSTREAM_APIKEY / GETSTREAM_SECRET"
      via: "requiredEnv()"
      pattern: "requiredEnv\\('GETSTREAM_(APIKEY|SECRET)'\\)"
---

<objective>
Fix production "Stream error code 5: Token signature is invalid" / "UpdateUsers failed" errors in video calls.

Root cause (already diagnosed, do not re-investigate): commit a7650ec ("hardcode env") replaced `lib/video-calls.ts`'s env-var reads with hardcoded GetStream `apiKey`/`secret` literals, and the hardcoded secret is truncated by one trailing character (`...bqnes` vs the correct `...bqnes4` in `.env.local`). Every server-signed GetStream call (`generateUserToken`, `upsertUsers`, `updateCallMembers`) uses an HMAC secret that's simply wrong, so GetStream rejects every token/signature.

Purpose: Restore correct env-based credentials so GetStream signature verification succeeds again for all video-call flows (create call, add participants, join via link, mint token).
Output: `lib/video-calls.ts` reverted to read `GETSTREAM_APIKEY`/`GETSTREAM_SECRET` via `requiredEnv()`, diagnostic logging removed, verified with typecheck/lint/tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/lib/video-calls.ts
@/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm/CLAUDE.md
</context>

<interfaces>
Current (broken) state of the two functions being fixed, from lib/video-calls.ts:

```typescript
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is not configured — video calls are unavailable.`);
  return value;
}

let cachedClient: StreamClient | null = null;
function streamClient(): StreamClient {
  if (!cachedClient) {
    const apiKey = 'jvvprazt9h37';
    const secret =
      'avut4xk7geqyw7k7r5z3gxu3pmamzcgk6xhb2g6qhuwtpgg6pxdekvujehbqnes';
    // TEMPORARY diagnostic for the "Token signature is invalid" issue on
    // Netlify — never logs the secret itself, only lengths + edge
    // characters, enough to compare against the GetStream dashboard without
    // exposing the credential in function logs. Remove once resolved.
    console.log('[video-calls] GetStream credential check', {
      apiKeyLength: apiKey.length,
      apiKeyPreview: `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}`,
      secretLength: secret.length,
      secretPreview: `${secret.slice(0, 3)}...${secret.slice(-3)}`,
    });
    cachedClient = new StreamClient(apiKey, secret);
  }
  return cachedClient;
}

export function mintVideoToken(userId: string, callId: string): VideoCallToken {
  const token = streamClient().generateUserToken({
    user_id: userId,
    validity_in_seconds: TOKEN_TTL_SECONDS,
  });
  return { apiKey: 'jvvprazt9h37', token, callId };
}
```

`requiredEnv` itself is already correct (trims env value, throws if unset) — do not modify it.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Revert hardcoded GetStream credentials to env-var reads and remove diagnostic logging</name>
  <files>lib/video-calls.ts</files>
  <action>
    In `streamClient()` (around lines 37-55): replace the hardcoded `const apiKey = 'jvvprazt9h37';` with `const apiKey = requiredEnv('GETSTREAM_APIKEY');` and replace the hardcoded truncated `const secret = 'avut4xk7geqyw7k7r5z3gxu3pmamzcgk6xhb2g6qhuwtpgg6pxdekvujehbqnes';` with `const secret = requiredEnv('GETSTREAM_SECRET');`. Delete the entire "TEMPORARY diagnostic" comment block and the `console.log('[video-calls] GetStream credential check', ...)` call that follows the credential assignments — keep only `cachedClient = new StreamClient(apiKey, secret);` after the two `requiredEnv` assignments.

    In `mintVideoToken()` (around line 81): replace the hardcoded `apiKey: 'jvvprazt9h37'` in the returned object with `apiKey: requiredEnv('GETSTREAM_APIKEY')`.

    Do not touch `requiredEnv()` itself, its doc comment, or any other function in this file. Do not touch `.env.local`.
  </action>
  <verify>
    <automated>grep -c "jvvprazt9h37\|avut4xk7geqyw7k7r5z3gxu3pmamzcgk6xhb2g6qhuwtpgg6pxdekvujehbqnes\|TEMPORARY diagnostic\|GetStream credential check" lib/video-calls.ts</automated>
  </verify>
  <done>grep above returns 0 — no hardcoded literals or diagnostic logging remain; both `streamClient()` and `mintVideoToken()` call `requiredEnv('GETSTREAM_APIKEY')`/`requiredEnv('GETSTREAM_SECRET')` instead.</done>
</task>

<task type="auto">
  <name>Task 2: Typecheck, lint, and run video-call tests to confirm the revert didn't break anything</name>
  <files>lib/video-calls.ts, tests/lib/video-calls.test.ts, tests/actions/video-calls.test.ts</files>
  <action>
    Run `npx tsc --noEmit` from the repo root to confirm no type errors were introduced. Run `npm run lint` and confirm it's clean (or only has pre-existing warnings unrelated to this file). Run `npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts` to confirm the existing video-call test suites still pass against the reverted code. If any test in these two files fails due to the code now expecting env vars, check whether the test file mocks `process.env.GETSTREAM_APIKEY`/`GETSTREAM_SECRET` (it should already, since prior to commit a7650ec the code read from env) — do not weaken the fix to make a stale test pass; investigate first.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts</automated>
  </verify>
  <done>`tsc --noEmit` exits 0, `npm run lint` is clean on lib/video-calls.ts, and both vitest suites pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| server → GetStream API | Server-signed JWTs (user tokens, upsertUsers, updateCallMembers) authenticate this app to GetStream using `GETSTREAM_SECRET` |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | lib/video-calls.ts streamClient() | mitigate | Restore reading `GETSTREAM_SECRET` from env (never hardcoded/committed) so the HMAC secret used to sign GetStream JWTs is the real, full-length production value, not a truncated literal baked into source control |
| T-quick-02 | Information Disclosure | lib/video-calls.ts streamClient() | mitigate | Remove the diagnostic `console.log` that emits secret length + edge characters to function logs; no credential-fragment logging remains |
</threat_model>

<verification>
- `grep -c "jvvprazt9h37\|avut4xk7geqyw7k7r5z3gxu3pmamzcgk6xhb2g6qhuwtpgg6pxdekvujehbqnes\|TEMPORARY diagnostic\|GetStream credential check" lib/video-calls.ts` returns 0
- `grep -c "requiredEnv('GETSTREAM_APIKEY')" lib/video-calls.ts` returns 2 (streamClient + mintVideoToken)
- `grep -c "requiredEnv('GETSTREAM_SECRET')" lib/video-calls.ts` returns 1 (streamClient)
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts` passes
</verification>

<success_criteria>
- lib/video-calls.ts no longer contains any hardcoded GetStream apiKey/secret literal or diagnostic logging
- streamClient() and mintVideoToken() both source credentials via requiredEnv('GETSTREAM_APIKEY') / requiredEnv('GETSTREAM_SECRET')
- .env.local is untouched (already correct, full secret ending in ...bqnes4)
- typecheck, lint, and both video-call test suites pass
</success_criteria>

<output>
Create `.planning/quick/260723-cme-fix-getstream-token-signature/260723-cme-SUMMARY.md` when done
</output>
</content>
