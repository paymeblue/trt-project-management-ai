---
phase: quick-260723-cme
plan: 01
subsystem: video-calls
tags: [getstream, node-sdk, env-vars, security]

# Dependency graph
requires: []
provides:
  - lib/video-calls.ts streamClient()/mintVideoToken() reading GETSTREAM_APIKEY/GETSTREAM_SECRET via requiredEnv() (env-based, no hardcoded credentials)
affects: [video-calls, dave-aredo-unrelated]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - lib/video-calls.ts

key-decisions:
  - "No scope expansion — only the two hardcoded literal assignments and the diagnostic console.log block were touched; requiredEnv() itself and every other function in the file were left untouched per the plan's explicit constraint"

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-07-23
---

# Quick Task 260723-cme: Fix GetStream Token Signature Summary

**Reverted `lib/video-calls.ts` from hardcoded (and truncated-by-one-character) GetStream apiKey/secret literals back to `requiredEnv('GETSTREAM_APIKEY')`/`requiredEnv('GETSTREAM_SECRET')`, and removed the temporary credential-fragment diagnostic logging — fixes production "Token signature is invalid" / "UpdateUsers failed" errors.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 (Task 1: code revert; Task 2: verification only, no code change)
- **Files modified:** 1

## Accomplishments

- `streamClient()` in `lib/video-calls.ts`: replaced `const apiKey = 'jvvprazt9h37'` and the truncated `const secret = 'avut4xk7...bqnes'` literal with `requiredEnv('GETSTREAM_APIKEY')` / `requiredEnv('GETSTREAM_SECRET')`; deleted the "TEMPORARY diagnostic" comment block and the `console.log('[video-calls] GetStream credential check', ...)` call entirely.
- `mintVideoToken()`: replaced the hardcoded `apiKey: 'jvvprazt9h37'` in the returned `VideoCallToken` with `apiKey: requiredEnv('GETSTREAM_APIKEY')`.
- `requiredEnv()` itself, its doc comment, and every other function in the file were left untouched, as specified.
- `.env.local` was not touched (already correct, full secret ending in `...bqnes4`).

## Task Commits

1. **Task 1: Revert hardcoded GetStream credentials to env-var reads and remove diagnostic logging** — `33ac3a9` (fix)
2. **Task 2: Typecheck, lint, and run video-call tests** — no code changes (verification-only task); results captured below.

## Files Created/Modified
- `lib/video-calls.ts` — `streamClient()` and `mintVideoToken()` now source GetStream credentials via `requiredEnv('GETSTREAM_APIKEY')`/`requiredEnv('GETSTREAM_SECRET')`; diagnostic `console.log` and its comment block removed.

## Decisions Made
None beyond following the plan exactly as written — no deviations were needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The existing test suites already mocked `process.env.GETSTREAM_APIKEY`/`GETSTREAM_SECRET` (predating commit a7650ec's hardcoding), so no test updates were required.

## Verification (actual output)

- `grep -c "jvvprazt9h37\|avut4xk7geqyw7k7r5z3gxu3pmamzcgk6xhb2g6qhuwtpgg6pxdekvujehbqnes\|TEMPORARY diagnostic\|GetStream credential check" lib/video-calls.ts` → `0`
- `grep -c "requiredEnv('GETSTREAM_APIKEY')" lib/video-calls.ts` → `2`
- `grep -c "requiredEnv('GETSTREAM_SECRET')" lib/video-calls.ts` → `1`
- `npx tsc --noEmit` → exited 0, no output (clean)
- `npm run lint` → `✖ 4 problems (0 errors, 4 warnings)` — all 4 warnings are pre-existing and unrelated to `lib/video-calls.ts` (2x `@next/next/no-page-custom-font` in `app/layout.tsx`, 2x `@typescript-eslint/no-unused-vars` in `tests/actions/workflow.test.ts`, duplicated across the repo root and an unrelated `.claude/worktrees/agent-a196900aee7b57239` copy scanned by the same lint run)
- `npx vitest run tests/lib/video-calls.test.ts tests/actions/video-calls.test.ts` → `Test Files 2 passed (2)`, `Tests 18 passed (18)`

## User Setup Required
None — no external service configuration required. `.env.local` already had the correct full-length `GETSTREAM_SECRET`.

## Next Phase Readiness
- All 3 `must_haves.truths` satisfied: env vars read at call time (not hardcoded), no credential-fragment diagnostic logging remains, all three GetStream-calling paths (token minting, user upsert, call-membership updates) now use the single `requiredEnv('GETSTREAM_SECRET')`-sourced client via the shared `streamClient()` cache.
- typecheck/lint/tests all green; no blockers for other in-flight work.
- Live production verification (starting a real call and confirming no "Token signature is invalid" error) was not performed in this session — recommend a smoke test after deploy.

---
*Phase: quick-260723-cme*
*Completed: 2026-07-23*

## Self-Check: PASSED

- FOUND: lib/video-calls.ts
- FOUND: .planning/quick/260723-cme-fix-getstream-token-signature/260723-cme-SUMMARY.md
- FOUND commit: 33ac3a9
