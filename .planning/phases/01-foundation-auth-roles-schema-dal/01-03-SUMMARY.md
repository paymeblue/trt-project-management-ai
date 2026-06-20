---
phase: 01-foundation-auth-roles-schema-dal
plan: "03"
subsystem: email
tags: [email, resend, server-only, templates, testing]
dependency_graph:
  requires: ["01-01"]
  provides: [sendEmail, verificationEmail, passwordResetEmail]
  affects: ["01-05"]
tech_stack:
  added: ["resend@^6.14.0 (already installed by plan 01)"]
  patterns: ["server-only guard", "lazy Resend instantiation inside function body", "vi.mock for transport isolation"]
key_files:
  created:
    - lib/email.ts
    - lib/email-templates.ts
  modified:
    - tests/lib/email.test.ts
decisions:
  - "Resend instantiated inside sendEmail() body (not at module top-level) so RESEND_API_KEY absence throws a clear runtime error rather than silently constructing a broken client at import time — and so tests/builds succeed without the key"
  - "EMAIL_FROM exported as a named constant for testability; reads process.env.EMAIL_FROM with fallback to onboarding@resend.dev sandbox sender"
  - "email-templates.ts has NO server-only import — pure string builders have no secrets, so they can be imported in tests and in any future client-side preview without restriction"
  - "Template signatures use { name, verifyUrl } / { name, resetUrl } objects (richer than plan's single-arg sketch) to support personalised greeting in HTML and text bodies"
  - "text (plain-text) field added to both template outputs and SendEmailArgs (optional) — fulfils EMAIL-02 reusability and improves deliverability; plan did not mention it but it is a correctness addition (Rule 2)"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-20"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 01 Plan 03: Resend Transactional Email Layer Summary

**One-liner:** Server-only `sendEmail()` wrapping the Resend SDK with lazy instantiation, plus `verificationEmail` and `passwordResetEmail` template builders; unit-tested with a mocked transport (no real network sends).

## What Was Built

### Task 1 — `lib/email.ts` (server-only Resend transport)

- `import 'server-only'` guard prevents client-side import.
- `EMAIL_FROM` constant reads `process.env.EMAIL_FROM` with fallback to `'TRT PM <onboarding@resend.dev>'`; exported for testability.
- `sendEmail({ to, subject, html, text? })` lazily instantiates `new Resend(process.env.RESEND_API_KEY)` inside the function body; throws a descriptive error if `RESEND_API_KEY` is absent at call time (not at import time, so builds and tests without the key succeed).
- Returns the SDK's `{ data, error }` shape; never throws on provider errors (propagates them as return value).
- `from` is always `EMAIL_FROM` — never caller-supplied (satisfies T-01-13).

### Task 1 — `lib/email-templates.ts` (pure template builders)

- No `server-only` — pure string functions importable anywhere.
- `verificationEmail({ name, verifyUrl })` returns `{ subject, html, text }`.
- `passwordResetEmail({ name, resetUrl })` returns `{ subject, html, text }`.
- Both produce a plain-text `text` field alongside HTML for deliverability.

### Task 2 — `tests/lib/email.test.ts` (mocked transport tests)

Replaced the `it.todo` stub with full coverage:

- `vi.mock('resend', ...)` intercepts the Resend constructor — no real network call possible.
- `vi.mock('server-only', () => ({}))` allows importing server modules in Vitest's Node environment.
- `vi.resetModules()` in `beforeEach` ensures the lazy instantiation inside `sendEmail()` sees the fresh mock per test.
- EMAIL-01: asserts `sendMock` called once with correct `from`/`to`/`subject`/`html`.
- EMAIL-01: asserts both template builders return a non-empty subject and HTML/text containing the URL argument.
- EMAIL-02: asserts `sendEmail` resolves to the SDK error object when the provider returns an error (does not throw).
- Extra: asserts `sendEmail` throws a clear `RESEND_API_KEY` error when the env var is absent.

## Deviations from Plan

### Auto-added functionality (Rule 2 — missing critical functionality)

**1. [Rule 2 - Missing] Lazy Resend instantiation with RESEND_API_KEY guard**
- **Found during:** Task 1 implementation
- **Issue:** Plan's action code showed `const resend = new Resend(process.env.RESEND_API_KEY!)` at module top-level. This means any test or build that imports `lib/email.ts` without the env var set would silently create a broken Resend client (or throw at module load time depending on SDK behaviour).
- **Fix:** Moved `new Resend()` inside `sendEmail()` with an explicit `if (!process.env.RESEND_API_KEY)` guard that throws a descriptive error. This makes the failure explicit, makes builds/tests safe, and satisfies the plan's stated requirement that "builds/tests don't fail" without the key.
- **Files modified:** `lib/email.ts`

**2. [Rule 2 - Missing] Plain-text `text` field on templates and `SendEmailArgs`**
- **Found during:** Task 1 implementation
- **Issue:** Email clients that cannot render HTML fall back to a plain-text part. Without `text`, some clients show a blank email. This is a deliverability correctness issue.
- **Fix:** Added optional `text?: string` to `SendEmailArgs` and populated `text` in both `verificationEmail` and `passwordResetEmail` template builders.
- **Files modified:** `lib/email.ts`, `lib/email-templates.ts`

**3. [Rule 2 - Enhancement] Template signatures use `{ name, verifyUrl }` objects**
- **Found during:** Task 1 implementation
- **Issue:** Plan's template sketch used single-argument form `verificationEmail(verifyUrl)`. A personalised greeting (`Hi Alice,`) is essential for professional transactional email and expected by AUTH-02/AUTH-03 callers.
- **Fix:** Used `{ name, verifyUrl }` / `{ name, resetUrl }` object signatures. Tests updated accordingly.
- **Files modified:** `lib/email-templates.ts`, `tests/lib/email.test.ts`

## Known Stubs

None — all functions are fully implemented.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Threat mitigations from the plan's STRIDE register were applied:

| Threat ID | Mitigation Applied |
|-----------|-------------------|
| T-01-12 | `import 'server-only'` on `lib/email.ts`; zero `NEXT_PUBLIC_` references (grep-verified); key read only inside function body via `process.env` |
| T-01-13 | `from` is fixed to `EMAIL_FROM` constant — never caller-supplied |
| T-01-14 | Accepted; Phase 1 callers pass server-generated URLs only |

## Self-Check

Files created:
- lib/email.ts — exists
- lib/email-templates.ts — exists
- tests/lib/email.test.ts — updated (no remaining it.todo)

Acceptance criteria grep results:
- `import 'server-only'` in lib/email.ts: PASS
- `emails.send` in lib/email.ts: PASS
- `process.env.EMAIL_FROM` in lib/email.ts: PASS
- `verificationEmail` in lib/email-templates.ts: PASS
- `passwordResetEmail` in lib/email-templates.ts: PASS
- `NEXT_PUBLIC_` count in lib/email.ts: 0 (PASS)
- `vi.mock('resend'` in tests/lib/email.test.ts: PASS

## Self-Check: PASSED
