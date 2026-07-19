---
phase: 1
slug: foundation-auth-roles-schema-dal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 01-RESEARCH.md "## Validation Architecture". Test framework not yet installed — Wave 0 installs it.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (install `vitest`, `@vitejs/plugin-react`) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10–20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite green + smoke test (sign up → verify email → log in → role dashboard)
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| AUTH-01 | Signup Server Action accepts valid email/password | unit | `npx vitest run tests/actions/auth.test.ts` | ❌ W0 |
| AUTH-02 | Signup rejects `super_admin` role; verification email queued | unit | `npx vitest run tests/actions/auth.test.ts` | ❌ W0 |
| AUTH-03 | Password reset issues a Resend email with a valid token | integration | `npx vitest run tests/actions/auth.test.ts` | ❌ W0 |
| AUTH-04 | Signin/signout actions call auth.signIn/signOut | unit | `npx vitest run tests/actions/auth.test.ts` | ❌ W0 |
| AUTH-05 | Session cookie present (HttpOnly) after signin; persists | smoke | `npm run dev` → DevTools cookie check | manual |
| AUTH-06 | factory_pm cannot access /site-pm/* (forbidden) | integration | `npx vitest run tests/lib/dal.test.ts` | ❌ W0 |
| AUTH-07 | verifySession() rejects calls without a valid session | unit | `npx vitest run tests/lib/dal.test.ts` | ❌ W0 |
| CHK-01 | checklist_definitions/template_items/responses exist; no hardcoded line items | schema | `npx drizzle-kit push` + `grep` for label literals | ❌ W0 |
| EMAIL-01 | Resend client sends verification + reset email (mocked transport in test) | unit | `npx vitest run tests/lib/email.test.ts` | ❌ W0 |
| EMAIL-02 | Reusable `sendEmail()` utility exists and is server-only | unit | `npx vitest run tests/lib/email.test.ts` | ❌ W0 |

---

## Observable Success Criteria

1. **Signup → role claim:** After signup with `role=factory_pm`, session/DB shows `users.role === 'factory_pm'`.
2. **Super Admin not via public signup:** signup with `{ role: 'super_admin' }` → validation error (400).
3. **Role-gated routes:** authenticated `factory_pm` → GET `/site-pm/*` → 403 (Next 16 `forbidden()`).
4. **Server-side mutation auth:** Server Action invoked by `factory_pm` against a `site_pm`-owned resource → 403.
5. **Schema-as-data (CHK-01):** `checklist_template_items` count 0 (no items yet), `checklist_definitions` seeded with slugs only; `grep` for label literals in `src/` returns nothing.
6. **Session persists:** log in, reopen tab → still authenticated.
7. **Email (EMAIL-01):** triggering verification/reset enqueues a Resend send (asserted via mocked Resend client in tests; real send verified manually in smoke).

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` + install `vitest`, `@vitejs/plugin-react` — no test framework installed
- [ ] `tests/actions/auth.test.ts` — AUTH-01, AUTH-02, AUTH-03, AUTH-04
- [ ] `tests/lib/dal.test.ts` — AUTH-06, AUTH-07
- [ ] `tests/db/schema.test.ts` — CHK-01 schema structure
- [ ] `tests/lib/email.test.ts` — EMAIL-01, EMAIL-02 (mock Resend transport)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session cookie persistence across tab close | AUTH-05 | Browser cookie lifecycle | Log in, close tab, reopen app → still authed |
| Real verification email delivery | EMAIL-01 | External provider (Resend) | Sign up with a real inbox → receive + click verify link |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
