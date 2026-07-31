---
phase: quick-260731-sgo
plan: 01
subsystem: email
tags: [sendgrid, email, deliverability, dns, drizzle, netlify, cron]

# Dependency graph
requires:
  - phase: quick-260726-dw4
    provides: CRON_SECRET + Netlify Scheduled Function pattern (app/api/cron/*, netlify/functions/*.mts)
  - phase: quick-260728-esc
    provides: sessionStorage-backed dismiss pattern (lib/notification-autosurface.ts, notifications-bell.tsx) reused verbatim by the new banner
provides:
  - SendGrid as the sole email transport (Resend fully removed)
  - Pure MX/suppression deliverability classifier with tri-state (true/false/null) verdicts
  - users.emailDeliverable / emailUndeliverableReason / emailCheckedAt (additive nullable columns)
  - Daily scheduled refresh job (Netlify -> CRON_SECRET route -> DNS probe + SendGrid suppression fetch)
  - On-demand CLI (npm run email:deliverability [-- --dry-run])
  - Dismissable in-app banner + admin "Undeliverable" badge in User Management
affects: [notifications, admin-users, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure classifier / thin impure wrapper split (lib/email-deliverability.ts has zero imports; lib/email-deliverability-refresh.ts owns all DNS/fetch/DB I/O and delegates every decision to the pure module)"
    - "Tri-state boolean|null verdict so a transient DNS resolver failure is representable as 'unknown', never collapsed into a false 'undeliverable'"
    - "Persist-only-on-certainty: refreshAllUsersDeliverability() never writes when the merged verdict is null, so one bad resolver run can't wipe good data"

key-files:
  created:
    - lib/email-deliverability.ts
    - lib/email-deliverability-refresh.ts
    - tests/lib/email-deliverability.test.ts
    - app/api/cron/email-deliverability/route.ts
    - netlify/functions/refresh-email-deliverability.mts
    - scripts/check-email-deliverability.ts
    - app/_components/email-deliverability-banner.tsx
  modified:
    - lib/email.ts
    - tests/lib/email.test.ts
    - tests/lib/email-sendgrid.test.ts
    - scripts/verify-email.ts
    - db/schema.ts
    - app/(app)/layout.tsx
    - app/(app)/admin/users/page.tsx
    - app/_components/admin-users-table.tsx
    - package.json
    - .env.example
    - README.md
    - CLAUDE.md
    - ACCOUNTS.md

key-decisions:
  - "SendGrid's Email Validation API is NOT provisioned on this account (403 access forbidden on POST /v3/validations/email; GET /v3/scopes returns 206 scopes with zero validation scopes at all) — built MX/A-record DNS lookups + SendGrid's own suppression lists (bounces/blocks/invalid_emails) as the substitute instead"
  - "Tri-state boolean|null on DeliverabilityVerdict.deliverable: a transient DNS code (SERVFAIL/timeout/refused/etc.) always yields null (unknown), and refreshAllUsersDeliverability() only persists on a real true/false — an unknown verdict leaves the existing row untouched"
  - "A SendGrid suppression verdict always outranks a DNS verdict in mergeVerdicts() — SendGrid's own record of an actual failure is authoritative over a DNS prediction"
  - "Banner component takes an explicit email prop (in addition to deliverable/reason) since the required copy ('show their address') is otherwise unattainable — layout.tsx's existing single `me` select was extended with users.email at zero extra query cost"
  - "Banner does not register as a forcing overlay (no useRegisterForcingOverlay call) — it is an inline, in-flow, non-modal notice that must never suppress the bell auto-surface or contest PendingCallGate/PendingStepGate for the screen"

requirements-completed: [SGO-01, SGO-02, SGO-03, SGO-04]

# Metrics
duration: 20min
completed: 2026-07-31
---

# Quick Task 260731-sgo: SendGrid-only email + deliverability detection Summary

**Removed Resend entirely (SendGrid is now the sole email transport), then added a pure MX+suppression deliverability classifier, three additive `users` columns, a daily Netlify-scheduled refresh job, and a dismissable in-app banner + admin badge that surface the 6 `@trtarredo.demo` users whose email silently hard-bounces today.**

## CRITICAL FINDING (required deliverable — restated plainly)

SendGrid's Email Validation API was the originally requested mechanism for detecting
undeliverable addresses. **It is NOT provisioned on this account:**

- `POST /v3/validations/email` → `403 {"errors":[{"message":"access forbidden"}]}`
- `GET /v3/scopes` → `200`, 206 scopes returned, **zero** validation scopes present —
  `validations.email.create` is entirely absent. `mail.send` IS present. Account is
  `type: paid`, `reputation: 100`.
- It is a separate paid add-on this account does not have. No code in this task calls it
  (confirmed: the only occurrence of the string `v3/validations` anywhere in the repo is
  the documentation comment in `lib/email-deliverability.ts`'s own header explaining why
  it is NOT used).

**What was built instead** — two complementary, already-available signals:

| Endpoint | Live-verified status |
|---|---|
| `GET /v3/suppression/bounces` | 200, `[]` |
| `GET /v3/suppression/blocks` | 200, contains `tobenna@paymeblue.com` — `554 5.7.7 Email policy violation detected` |
| `GET /v3/suppression/invalid_emails` | 200, `[]` |
| DNS MX/A lookup (`node:dns/promises`) | free, predictive — catches a dead domain (`@trtarredo.demo`, NXDOMAIN) before a single send |

DNS is predictive (works before any send ever happens); SendGrid's suppression lists are
reactive (SendGrid's own authoritative record of what actually failed). Together they
substitute for the unavailable Validation API.

## Performance

- **Duration:** ~20 min (2026-07-31T09:11 → 09:27, task commits)
- **Tasks:** 4/4 completed
- **Files modified/created:** 20

## Accomplishments

- `lib/email.ts` is now single-transport: `sendViaResend`, `EmailProvider`, and
  `activeEmailProvider()` are gone; `isEmailServiceActive()` = `!!sendGridApiKey()`;
  `sendEmail()` throws naming `SENDGRID_API_KEY` only when no key is configured at all,
  otherwise always sends via SendGrid. `npm uninstall resend` succeeded with **no**
  `--legacy-peer-deps` needed. `resend` is absent from `package.json`, `package-lock.json`,
  and every runtime code path.
- `lib/email-deliverability.ts`: a genuinely zero-import pure module (`grep -cE "^import |require\("` = 0)
  exporting `emailDomain`, `classifyDnsOutcome`, `classifySuppression`, `mergeVerdicts`,
  `shouldShowDeliverabilityBanner`, `TRANSIENT_DNS_CODES`. Every `TRANSIENT_DNS_CODES` entry
  is exercised on both the MX and A lookup in its own named test — the load-bearing
  guarantee that a resolver hiccup never brands a working address dead.
- `users` gained exactly three additive nullable columns (`email_deliverable`,
  `email_undeliverable_reason`, `email_checked_at`). Verified via direct
  `information_schema.columns` inspection: all 12 pre-existing columns and all 21 user
  rows were untouched; a second `db:push` reported **"No changes detected"** (idempotent).
  No drop/alter/rename of any kind occurred.
- `lib/email-deliverability-refresh.ts` + `app/api/cron/email-deliverability/route.ts` +
  `netlify/functions/refresh-email-deliverability.mts` (daily, `17 3 * * *`) + `npm run
  email:deliverability [-- --dry-run]` — live-verified end-to-end against the real Neon DB
  and the real SendGrid account (see Live Verification Results below).
- `app/_components/email-deliverability-banner.tsx` + admin badge in
  `admin-users-table.tsx` — live-verified via a real signed-in dev server (curl-driven
  Auth.js Credentials sign-in, not just unit tests).

## Task Commits

1. **Task 1: Remove Resend completely — SendGrid becomes the only transport** — `5c13f00` (feat)
2. **Task 2: Pure deliverability classifier + additive schema columns** — `f6fe027` (feat)
3. **Task 3: DNS + suppression probe, scheduled refresh, and on-demand CLI** — `e2c60f5` (feat)
4. **Task 4: Dismissable banner in the app shell + admin visibility** — `ff2a44a` (feat)

## Files Created/Modified

- `lib/email.ts` - single-transport SendGrid-only send path
- `lib/email-deliverability.ts` - pure MX/suppression classifier (zero imports)
- `lib/email-deliverability-refresh.ts` - impure DNS probe + SendGrid suppression fetch + DB persist
- `tests/lib/email-deliverability.test.ts` - full branch coverage incl. every transient DNS code
- `tests/lib/email.test.ts`, `tests/lib/email-sendgrid.test.ts` - EMAIL-01/EMAIL-02 ported off Resend
- `scripts/verify-email.ts` - `activeEmailProvider()` → `isEmailServiceActive()`; legacy resend.dev detector kept
- `scripts/check-email-deliverability.ts` - on-demand CLI (`npm run email:deliverability`)
- `db/schema.ts` - 3 additive nullable `users` columns
- `app/api/cron/email-deliverability/route.ts` - CRON_SECRET Bearer-protected refresh trigger
- `netlify/functions/refresh-email-deliverability.mts` - daily scheduled trigger
- `app/_components/email-deliverability-banner.tsx` - dismissable client banner
- `app/(app)/layout.tsx` - extended `me` select, mounted the banner
- `app/(app)/admin/users/page.tsx`, `app/_components/admin-users-table.tsx` - "Undeliverable" badge
- `package.json`, `package-lock.json` - `resend` removed, `email:deliverability` script added
- `.env.example`, `README.md`, `CLAUDE.md`, `ACCOUNTS.md` - docs updated to SendGrid-only
- `lib/notify-escalation-email.ts`, `lib/notify-video-call-email.ts`, `lib/auth/email-flows.ts`,
  `actions/escalation.ts`, `lib/notify-super-admins-email.test.ts`, `lib/notify-video-call-email.test.ts`
  - stale Resend-operator-note comments/test strings corrected (Rule 1, see Deviations)

## Live Verification Results

**Test-count delta vs. the 528 + 1 todo baseline:** final suite is **561 passed + 1 todo**
(+33 net: +0 from Task 1's like-for-like port of the Resend tests to SendGrid, +33 new from
Task 2's `email-deliverability.test.ts`). Zero failures at every stage.

**`npm uninstall resend`:** succeeded with the bare command — **no** `--legacy-peer-deps`
needed this time (unlike the netlify-cli/vitest peer conflict noted in 260726-dw4, which
only affects *installs*, not this removal).

**`db:push` output:** confirmed via direct `information_schema.columns` query (not just
drizzle-kit's own report) — exactly 3 columns added (`email_deliverable` boolean nullable,
`email_undeliverable_reason` text nullable, `email_checked_at` timestamp nullable), all 12
pre-existing `users` columns and all 21 rows intact. A second `db:push` run reported **"No
changes detected"**, confirming idempotency and that nothing else drifted.

**Live dry-run (`npm run email:deliverability -- --dry-run`)** against the real 21-user
table:

```
checked: 21  undeliverable: 6  unknown: 0
```

All 6 `@trtarredo.demo` addresses (`qa.factory`, `designer`, `qa.ops2`, `head.designer`,
`factory.ops`, `factory.manager`) classified `UNDELIVERABLE — domain does not exist (DNS
NXDOMAIN)`. Every `@gmail.com`, `@trtarredo.com`, and `@trt.com` address (including
`uzochukwubenamara@gmail.com`) classified `deliverable`. **This is the exact positive/
negative pair the plan required**, live against real DNS.

**Real (non-dry-run) persistence:** a real POST to `/api/cron/email-deliverability` with
the correct `CRON_SECRET` returned `{"ok":true,"checked":21,"undeliverable":6,"unknown":0,"changed":21}`,
and a direct DB read afterward confirmed all 21 rows now carry the correct
`email_deliverable`/`email_undeliverable_reason` values, with the same 6 `@trtarredo.demo`
rows marked `false` + the NXDOMAIN reason.

**SendGrid suppression-list live proof:** `fetchSendGridSuppressions()` was called
directly against the live account and correctly returned `tobenna@paymeblue.com ->
{"deliverable":false,"reason":"blocks: 554 5.7.7 Email policy violation detected"}` —
SendGrid's own real blocks-list entry, exercising the suppression half of the merge logic
end-to-end (this address is not one of the 21 app users, so it did not appear in the
persisted-verdicts run, but the fetch/classify pathway itself is proven live).

**Cron route auth:** with no Authorization header at all, the route redirects to
`/sign-in` (307) — identical to the already-shipped, proven `call-reminders` route (same
proxy.ts interaction, not a regression). With a wrong Bearer token, it correctly returns
**401**. With the correct `CRON_SECRET`, it returns 200 with the refresh counts.

**Banner + admin badge, live signed-in dev server (curl-driven Auth.js Credentials
sign-in, not just unit tests):**
- Signed in as `qa.factory@trtarredo.demo` (undeliverable) → `/dashboard`'s rendered HTML
  contained "Email notifications are not reaching you", the user's own address, and
  "domain does not exist (DNS NXDOMAIN)".
- Signed in as `admin@trtarredo.com` (deliverable) → zero banner-related text anywhere in
  the rendered HTML.
- `/admin/users` rendered exactly 6 "Undeliverable" badges in the visible HTML, matching
  exactly the 6 `@trtarredo.demo` rows carrying `emailDeliverable: false` in the page's own
  RSC flight-data payload.

**`npm run email:verify`:** reports `Active provider: sendgrid` with no mention of a
provider choice, `EMAIL_FROM` parses correctly, `APP_URL` is the real Netlify origin.

## Decisions Made

- SendGrid's Email Validation API is unavailable on this account; MX + suppression lists
  substitute for it (see Critical Finding above — this is the plan's own required
  deliverable, not an incidental note).
- Tri-state `boolean | null` verdict everywhere so a transient DNS failure never collapses
  into a false "undeliverable"; `refreshAllUsersDeliverability()` only ever persists on a
  real true/false, leaving an unknown verdict's row untouched.
- A SendGrid suppression verdict always outranks a DNS verdict (`mergeVerdicts`) —
  SendGrid's own record of an actual failure is authoritative.
- The banner component's props were extended with an explicit `email: string` beyond the
  plan's literal `{ deliverable, reason }` signature, because the required copy
  ("show their address") is otherwise unattainable — `layout.tsx`'s existing single `me`
  select absorbed `users.email` at zero extra query cost.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected now-stale Resend-operator-note comments/strings outside this
plan's declared `files_modified`**
- **Found during:** Task 1, running the plan's own repo-wide `resend` grep gate
- **Issue:** The plan asserted the only surviving `resend` matches after Task 1 would be
  the two prose hits in `actions/workflow-graph.ts`. In reality, several other files
  (outside Task 1's file list) contained comments describing Resend as the active
  transport/documenting its "zero verified domains" operational state — now factually
  wrong once Resend was fully removed and SendGrid became the sole transport. Two test
  files also used the arbitrary mock-error string `'resend down'`. A second legitimate
  English-word "resend" usage (a design-rejection message, same class as the
  pre-approved `actions/workflow-graph.ts` hits) was also discovered in the *different*
  file `lib/workflow-graph.ts:878`, which the plan's author had not found.
- **Fix:** Updated the stale operator-note comments in `lib/notify-escalation-email.ts`,
  `lib/notify-video-call-email.ts`, `lib/auth/email-flows.ts`, and `actions/escalation.ts`
  to describe SendGrid instead of Resend; renamed the two test mock-error strings to
  `'sendgrid down'`. Left `lib/workflow-graph.ts:878`'s legitimate English-word "resend"
  untouched (same as the two pre-approved `actions/workflow-graph.ts` hits) — treating the
  plan's literal grep-exclusion list (which named only `actions/workflow-graph.ts`) as
  incomplete rather than editing prose that was never wrong to begin with.
- **Files modified:** `lib/notify-escalation-email.ts`, `lib/notify-video-call-email.ts`,
  `lib/auth/email-flows.ts`, `actions/escalation.ts`, `lib/notify-super-admins-email.test.ts`,
  `lib/notify-video-call-email.test.ts`
- **Verification:** repo-wide grep re-run; full test suite green; `tsc`/`lint` clean
- **Committed in:** `5c13f00` (Task 1 commit)

**2. [Rule 2 - Missing critical] Extended the banner's prop signature with `email`**
- **Found during:** Task 4
- **Issue:** The plan's literal `<action>` text specified the banner taking only
  `{ deliverable, reason }`, but its own required copy says the banner must "show their
  address" — unattainable with the literal 2-prop signature.
- **Fix:** Added a third `email: string` prop, sourced from extending `layout.tsx`'s
  existing single `me` select with `users.email` (already the same query, zero extra
  round trip).
- **Files modified:** `app/_components/email-deliverability-banner.tsx`,
  `app/(app)/layout.tsx`
- **Verification:** live signed-in dev-server check confirmed the address renders
  correctly in the banner
- **Committed in:** `ff2a44a` (Task 4 commit)

**3. [Rule 3 - Blocking] Fixed a new `react-hooks/set-state-in-effect` lint error**
- **Found during:** Task 4, `npm run lint`
- **Issue:** The banner's one-time sessionStorage-hydration effect calling `setDismissed(true)`
  tripped a newer ESLint rule not present when the plan was authored.
- **Fix:** Added an `eslint-disable-next-line` with a justifying comment, following the
  exact precedent already established in this repo at
  `app/_components/workflow-configurator-graph.tsx:171` for the identical "one-time
  hydration, not derived state" case.
- **Files modified:** `app/_components/email-deliverability-banner.tsx`
- **Verification:** `npm run lint` returned to 0 errors / 5 warnings (baseline 4 + 1
  expected new warning matching the existing `send-call-reminders.mts` pattern)
- **Committed in:** `ff2a44a` (Task 4 commit)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing-critical, 1 Rule 3
blocking). **Impact on plan:** all three were necessary for correctness/lint-cleanliness
or to fulfill the plan's own explicit UX requirement; no scope creep beyond what each
fix required.

## Known Stubs

None — every path (transport, classifier, refresh job, CLI, banner, admin badge) is
wired to real data with no hardcoded/placeholder values.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covered — no new endpoints, auth
paths, or trust boundaries were introduced outside the ones the plan's STRIDE register
already accounts for (T-260731-01 through T-260731-06, T-260731-SC).

## Issues Encountered

- `drizzle-kit push`'s piped/non-TTY output does not print the SQL diff before applying
  (unlike its interactive-terminal confirmation prompt) — verified the actual applied
  change directly via `information_schema.columns` instead of trusting the CLI's own
  "Changes applied" line at face value.
- The plan's own automated verify commands for the `resend` grep gate (Task 1) and the
  `v3/validations` grep gate (Task 3) are each self-contradictory with their own
  `<action>` text, which explicitly requires several legitimate mentions of "resend"/
  "validations" as documentation/test-proof beyond the single exclusion each check names.
  Resolved by checking the actual intent (no functional code path, only documentation/
  test-proof references) rather than the literal grep-minus-one-file arithmetic — see
  Deviations above for the concrete fixes and equivalences run instead.

## User Setup Required

None — `SENDGRID_APIKEY`/`SENDGRID_API_KEY`, `EMAIL_FROM`, `APP_URL`, and `CRON_SECRET`
were already configured in `.env.local` for this environment (confirmed live via
`npm run email:verify` and the live cron-route/dry-run checks above). The one outstanding
manual step is unrelated to this task: confirming the new
`refresh-email-deliverability` Netlify Scheduled Function actually appears under
Scheduled Functions on Netlify's dashboard after the next deploy (same as the still-open
`send-call-reminders` verification noted in STATE.md's Deferred Items).

## Next Phase Readiness

- Email transport is now single-path (SendGrid only) with no rollback fallback to Resend
  — any future rollback would require re-adding Resend deliberately, not flipping an env var.
  Since Resend fully committed to being removed, this is an explicit lock-in, per SGO-01.
- Deliverability detection is live and persisting real verdicts; the daily Netlify cron
  keeps it fresh without a page-load cost. The on-demand CLI (`npm run
  email:deliverability -- --dry-run`) is available for ad-hoc spot-checks.
- No blockers for future work. The 6 `@trtarredo.demo` users are now both flagged in
  `/admin/users` and self-visible via the dismissable banner — an admin can now correct
  those addresses with full visibility of who is affected and why.

## Self-Check: PASSED

All 20 claimed created/modified files confirmed present via `[ -f ... ]`; all 4 task
commit hashes (`5c13f00`, `f6fe027`, `e2c60f5`, `ff2a44a`) confirmed present via
`git log --oneline --all`.

---
*Phase: quick-260731-sgo*
*Completed: 2026-07-31*
