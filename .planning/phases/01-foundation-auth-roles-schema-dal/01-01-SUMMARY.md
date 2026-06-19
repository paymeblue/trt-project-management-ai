---
phase: 01-foundation-auth-roles-schema-dal
plan: "01"
subsystem: database
tags: [drizzle, neon, schema, vitest, env, foundation]
dependency_graph:
  requires: []
  provides:
    - db/schema.ts (all Phase 1 + later-phase tables, NextAuth users shape)
    - db/index.ts (server-only Drizzle/neon-http client)
    - drizzle.config.ts (schema push/generate config)
    - vitest.config.ts (test runner)
    - tests/ stubs for auth/dal/schema/email
    - .env.example (all key documentation)
  affects:
    - 01-02 (auth core imports db/schema + db/index)
    - 01-03 (DAL imports db/schema + db/index)
    - 01-04 (email util uses resend dep)
    - 01-05 (admin seed uses db/index + schema)
tech_stack:
  added:
    - drizzle-orm@0.45.2
    - "@neondatabase/serverless@1.1.0"
    - drizzle-kit@0.31.10
    - server-only@0.0.1
    - zod@4.4.3
    - resend@6.14.0
    - vitest@4.1.9
    - "@vitejs/plugin-react@6.0.2"
    - tsx@4.22.4
  patterns:
    - drizzle-orm/neon-http adapter for serverless Postgres
    - pgEnum for RBAC (factory_pm | site_pm | super_admin)
    - server-only guard on db/index.ts
    - it.todo stubs for Wave 0 test scaffolding
key_files:
  created:
    - db/schema.ts
    - db/index.ts
    - drizzle.config.ts
    - vitest.config.ts
    - tests/actions/auth.test.ts
    - tests/lib/dal.test.ts
    - tests/db/schema.test.ts
    - tests/lib/email.test.ts
    - .env.example
  modified:
    - package.json (scripts + deps)
    - .gitignore (.env.example exception)
    - .env.local (added RESEND_API_KEY, EMAIL_FROM, APP_URL, ADMIN_* placeholders)
decisions:
  - NextAuth/Auth.js v5 Credentials shape for users table (hashedPassword + role); no Neon-auth authUserId column
  - All 17 tables pushed in one plan so later-phase schema is available without migrations (process_diagrams, conversations, messages, token tables)
  - drizzle-kit push for dev DB; generate+migrate pattern for prod documented in package.json scripts
  - .env.example committed via .gitignore negation (!.env.example) — contains no secrets
metrics:
  duration: "~10 minutes"
  completed: "2026-06-19"
  tasks_completed: 3
  files_created: 9
  files_modified: 3
---

# Phase 01 Plan 01: DB/Schema/Test Foundation Summary

Drizzle schema (17 tables) pushed to Neon, NextAuth users shape wired, Vitest configured with Wave 0 test stubs.

## What Was Built

### Task 1: Install deps + full Drizzle schema

Installed exact versions: `@neondatabase/serverless@1.1.0`, `drizzle-orm@0.45.2`, `server-only@0.0.1`, `zod@4.4.3`, `resend@6.14.0`, `drizzle-kit@0.31.10` (devDep), `tsx` (devDep).

Created `db/schema.ts` with 17 `pgTable` declarations:
- **Base 11 (Phase 1):** `users`, `projects`, `checklistDefinitions`, `checklistTemplateItems`, `checklists`, `checklistResponses`, `attachments`, `processes`, `chatMessages`, `aiUsage`, `staticContent`
- **Later-phase (included now to prevent migration churn):** `processDiagrams`, `conversations`, `conversationParticipants`, `messages`, `verificationTokens`, `passwordResetTokens`

`users` table is NextAuth Credentials-shaped: `hashedPassword` (bcryptjs), `role` (pgEnum), `emailVerified` (timestamp). No `authUserId` / Neon-auth column.

Created `db/index.ts` with `import 'server-only'`, neon-http Drizzle client. Created `drizzle.config.ts` pointing at `./db/schema.ts`.

Added 7 scripts to `package.json`: `db:push`, `db:generate`, `db:migrate`, `db:studio`, `db:seed-admin`, `test`, `test:watch`.

### Task 2: Vitest config + test stubs + env scaffolding

Installed `vitest@4.1.9` and `@vitejs/plugin-react@6.0.2` as devDeps.

Created `vitest.config.ts` with node environment, `@/` alias pointing to repo root, includes `tests/**/*.test.ts`.

Created four Wave 0 test stub files:
- `tests/actions/auth.test.ts` — AUTH-01..04 todos
- `tests/lib/dal.test.ts` — AUTH-06/07 todos
- `tests/db/schema.test.ts` — CHK-01 todo + 3 active schema export assertions (pass immediately)
- `tests/lib/email.test.ts` — EMAIL-01/02 todos

Created `.env.example` with all keys documented (no secrets, no `NEXT_PUBLIC_`, no `NEON_AUTH_*`). Added missing keys (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `ADMIN_*`) to `.env.local` as placeholders (existing `DATABASE_URL`, `AUTH_SECRET`, AI keys preserved).

### Task 3: Schema push to Neon (pre-authorized)

Ran `npx drizzle-kit push` with `DATABASE_URL` set from `.env.local`. Push succeeded with `[✓] Changes applied` (two NOTICE messages about FK constraint name truncation — PostgreSQL 63-char identifier limit, non-breaking).

**Table verification:** Queried `pg_tables` via `@neondatabase/serverless` — all 17 tables confirmed present in `public` schema.

**Users column verification:** `hashed_password`, `role`, `email_verified` present; zero `auth_user*` columns.

## Schema Push / Verify Result

```
Tables created: 17
Push status: SUCCESS ([✓] Changes applied)
Users shape: hashed_password + role (pgEnum) + email_verified — NextAuth Credentials correct
Neon-auth columns: none
Truncation NOTICEs: 2 FK constraint names truncated by PostgreSQL (non-breaking)
```

## Vitest / Lint / TypeScript Status

| Check | Result |
|-------|--------|
| `npx vitest run` | 3 passed, 9 todo, 0 failures |
| `npm run lint` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |

## Commits

| Task | Hash | Description |
|------|------|-------------|
| Task 1 | 6fa7504 | feat(01-01): install DB/email deps and author full Drizzle schema |
| Task 2 | 93b11e2 | feat(01-01): add Vitest config, test stubs, and env scaffolding |
| Task 3 | (no commit — push to external DB, not repo) | Schema pushed to Neon, tables verified |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .gitignore preventing .env.example commit**
- **Found during:** Task 2 (git add .env.example failed)
- **Issue:** `.gitignore` had `.env*` which matched `.env.example`; the example file needs to be committed (it contains no secrets)
- **Fix:** Added `!.env.example` exception to `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** 93b11e2

**2. [Rule 3 - Blocking] DATABASE_URL not available to drizzle-kit push**
- **Found during:** Task 3 (push failed with "connection url required")
- **Issue:** `drizzle-kit` does not auto-load `.env.local`; DATABASE_URL must be in environment
- **Fix:** Passed `DATABASE_URL` as explicit env var prefix: `DATABASE_URL="..." npx drizzle-kit push`
- **Files modified:** none (runtime fix)

## Known Stubs

All stubs are intentional Wave 0 placeholders — features built in Plans 01-02 through 01-05:
- `tests/actions/auth.test.ts`: AUTH-01..04 (`it.todo`) — wired in Plan 01-02
- `tests/lib/dal.test.ts`: AUTH-06/07 (`it.todo`) — wired in Plan 01-03
- `tests/lib/email.test.ts`: EMAIL-01/02 (`it.todo`) — wired in Plan 01-04

Active assertions in `tests/db/schema.test.ts` pass now (schema exports verified).

## Threat Flags

No new threat surface introduced beyond what is in the plan's threat model (T-01-01 through T-01-22 all addressed as designed: `server-only` guard on `db/index.ts`, `.env*` gitignored, no `NEXT_PUBLIC_` secrets, no exposed password hashes in client-facing exports).

## Self-Check: PASSED

- db/schema.ts: FOUND
- db/index.ts: FOUND
- drizzle.config.ts: FOUND
- vitest.config.ts: FOUND
- tests/actions/auth.test.ts: FOUND
- tests/lib/dal.test.ts: FOUND
- tests/db/schema.test.ts: FOUND
- tests/lib/email.test.ts: FOUND
- .env.example: FOUND
- Commit 6fa7504: FOUND
- Commit 93b11e2: FOUND
- Vitest: 3 passed, 0 failures
- tsc: PASS
- lint: PASS
