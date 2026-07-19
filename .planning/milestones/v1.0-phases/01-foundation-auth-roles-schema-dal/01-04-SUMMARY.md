---
phase: 01-foundation-auth-roles-schema-dal
plan: "04"
subsystem: auth
tags: [email-verification, password-reset, server-actions, next16, security]
dependency_graph:
  requires: ["01-01 (schema: verificationTokens + passwordResetTokens)", "01-02 (NextAuth core)", "01-03 (Resend transport + templates)"]
  provides: ["email-flows.ts (sendVerificationEmail, requestPasswordReset, consumeVerificationToken, consumeResetToken)", "email-auth Server Actions", "(auth) route group pages"]
  affects: ["01-05 (RBAC wiring calls sendVerificationEmail on registration)"]
tech_stack:
  added: []
  patterns: ["sha256 token hashing (node:crypto)", "single-use/expiring tokens via usedAt+expiresAt", "useActionState for client-side form state", "dual-branch Server Component page (token present vs absent)"]
key_files:
  created:
    - lib/auth/email-flows.ts
    - actions/email-auth.ts
    - app/(auth)/layout.tsx
    - app/(auth)/verify-email/page.tsx
    - app/(auth)/reset-password/page.tsx
    - app/(auth)/reset-password/new-password-form.tsx
    - app/(auth)/reset-password/request-reset-form.tsx
    - tests/actions/email-auth.test.ts
  modified: []
decisions:
  - "Template functions take { name, verifyUrl/resetUrl } — email-flows.ts fetches the user name from DB before sending (see Deviations)"
  - "Request form extracted to RequestResetForm client component to enable useActionState feedback without useActionState in a Server Component"
  - "requestPasswordResetAction silently swallows email-send errors via catch() to prevent timing-based account enumeration"
  - "Non-enumerating response returned even on Zod parse failure (invalid email format)"
metrics:
  duration: "~30 min"
  completed: "2026-06-20"
  tasks_completed: 2
  files_created: 8
requirements: [EMAIL-01, AUTH-03]
---

# Phase 01 Plan 04: Email Verification + Password Reset Flows Summary

Implemented the complete email-driven auth flows on top of the NextAuth core: a `server-only` token layer (`lib/auth/email-flows.ts`), three Server Actions (`actions/email-auth.ts`), the `(auth)` route group with layout + verify-email page + reset-password dual-branch page, and a full test suite.

## What Was Built

**`lib/auth/email-flows.ts`** — Server-only module owning the token lifecycle:
- `sendVerificationEmail(userId, email)`: generates 32 random bytes (256-bit), inserts a sha256-hashed token into `verificationTokens` with a 1-hour TTL, then emails the raw URL via Resend.
- `consumeVerificationToken(rawToken)`: hashes the raw token, validates not-expired + not-used, marks `usedAt`, updates `users.emailVerified`.
- `requestPasswordReset(email)`: looks up user silently (returns `{ data: null, error: null }` if absent — no enumeration), generates a hashed token in `passwordResetTokens`, emails the raw URL via Resend.
- `consumeResetToken(rawToken)`: same consume pattern as verification but for `passwordResetTokens`; returns `userId` so the caller can update the password.

**`actions/email-auth.ts`** — Three Server Actions:
- `requestPasswordResetAction`: validates email with Zod, calls `requestPasswordReset`, ALWAYS returns `'If that email exists, a reset link has been sent.'` — even on parse failure (non-enumerating).
- `resetPasswordAction`: validates `{ token, password }` with Zod, calls `consumeResetToken`; if null → returns error and makes NO DB write (test-asserted); if valid → `bcrypt.hash(password, 10)` → `db.update(users).set({ hashedPassword })` (AUTH-03, no stub).
- `verifyEmailAction`: calls `consumeVerificationToken`, returns `{ ok: boolean }`.

**`app/(auth)/` route group**:
- `layout.tsx`: minimal public wrapper (centered card, no auth check).
- `verify-email/page.tsx`: awaits `searchParams` (Next 16), calls `verifyEmailAction`, shows verified / invalid / missing-token states.
- `reset-password/page.tsx`: awaits `searchParams`; if `?token` present renders `<NewPasswordForm>`; else renders `<RequestResetForm>`.
- `reset-password/new-password-form.tsx` (client): hidden token input + password input + `useActionState(resetPasswordAction)`.
- `reset-password/request-reset-form.tsx` (client): email input + `useActionState(requestPasswordResetAction)` with inline feedback.

**`tests/actions/email-auth.test.ts`**: Mocks `@/lib/auth/email-flows`, `@/db`, and `bcryptjs`. Asserts:
- `requestPasswordResetAction` calls `requestPasswordReset` and always returns the generic message.
- Non-enumerating: same message when user is unknown or email format is invalid.
- Happy-path reset: `consumeResetToken` returns userId → `bcrypt.hash` called → `db.update(users).set({ hashedPassword })` called.
- Bad-token reset: `consumeResetToken` returns null → `bcrypt.hash` and `db.update` are NOT called (security-critical assertion).
- `verifyEmailAction` returns `{ ok: true/false }` based on token validity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Template signature mismatch**
- **Found during:** Task 1 implementation
- **Issue:** The plan showed `verificationEmail(url)` and `passwordResetEmail(url)` as single-argument calls, but the actual `lib/email-templates.ts` (from Plan 03) defines both as `verificationEmail({ name, verifyUrl })` and `passwordResetEmail({ name, resetUrl })`.
- **Fix:** `email-flows.ts` queries the user's `name` from the DB before calling each template function, passing the correct `{ name, verifyUrl/resetUrl }` object.
- **Files modified:** `lib/auth/email-flows.ts`

**2. [Rule 2 - Missing critical functionality] Request form needs client-side feedback**
- **Found during:** Task 2 (reset-password page)
- **Issue:** The plan shows a plain Server Component form calling `requestPasswordResetAction` directly, but there is no way to display the action's return value (the non-enumerating message) in a Server Component without `useActionState`.
- **Fix:** Extracted `app/(auth)/reset-password/request-reset-form.tsx` as a Client Component that uses `useActionState(requestPasswordResetAction)` to display the generic feedback message inline.
- **Files modified:** `app/(auth)/reset-password/page.tsx` (simplified), `app/(auth)/reset-password/request-reset-form.tsx` (new).

## Threat Surface Scan

All T-01-15 through T-01-20 mitigations from the plan's threat register are implemented:
- **T-01-15** (enumeration): `requestPasswordResetAction` always returns the same message, including on Zod parse failure.
- **T-01-16** (token forgery): 32 random bytes (256-bit), stored as sha256 hash; raw token only in email URL.
- **T-01-17** (replay): `consumeVerificationToken` / `consumeResetToken` reject `usedAt != null` or `expiresAt < now`, and mark `usedAt` on consumption.
- **T-01-18** (raw token leak): `server-only` import; raw token not logged; only persisted hash.
- **T-01-19** (password update without valid token): `resetPasswordAction` only calls `bcrypt.hash` + `db.update` after `consumeResetToken` returns a non-null userId; test-asserted.
- **T-01-20** (plaintext password): `bcrypt.hash(password, 10)` before any DB write.

No new threat surface beyond what the plan's threat model covers.

## Known Stubs

None. All flows are fully implemented end-to-end.

## Self-Check

Files created:
- `/lib/auth/email-flows.ts` — contains `import 'server-only'`, `createHash`, `randomBytes(32)`, `sendEmail(`, `verificationEmail`, `passwordResetEmail`, `consumeResetToken`, `usedAt`, `do NOT reveal`
- `/actions/email-auth.ts` — contains `requestPasswordReset`, `consumeResetToken`, `bcrypt.hash`, `hashedPassword`, `db.update(users)`, `If that email exists`
- `/app/(auth)/layout.tsx` — public auth layout
- `/app/(auth)/verify-email/page.tsx` — awaits searchParams, calls verifyEmailAction
- `/app/(auth)/reset-password/page.tsx` — dual branch, renders NewPasswordForm when token present
- `/app/(auth)/reset-password/new-password-form.tsx` — client component with password input
- `/app/(auth)/reset-password/request-reset-form.tsx` — client component with email input
- `/tests/actions/email-auth.test.ts` — full test suite, no `it.todo` remaining

## Self-Check: PASSED
