---
phase: quick-260731-sgo
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [SGO-01, SGO-02, SGO-03, SGO-04]
files_modified:
  - lib/email.ts
  - lib/email-deliverability.ts
  - lib/email-deliverability-refresh.ts
  - tests/lib/email.test.ts
  - tests/lib/email-sendgrid.test.ts
  - tests/lib/email-deliverability.test.ts
  - scripts/verify-email.ts
  - scripts/check-email-deliverability.ts
  - db/schema.ts
  - app/api/cron/email-deliverability/route.ts
  - netlify/functions/refresh-email-deliverability.mts
  - app/_components/email-deliverability-banner.tsx
  - app/(app)/layout.tsx
  - app/(app)/admin/users/page.tsx
  - app/_components/admin-users-table.tsx
  - package.json
  - .env.example
  - README.md
  - CLAUDE.md
  - ACCOUNTS.md

must_haves:
  truths:
    - "The repo contains zero runtime references to Resend: `resend` is absent from package.json dependencies and lib/email.ts imports nothing from it."
    - "sendEmail() still RETURNS provider errors rather than throwing, so every best-effort caller is byte-for-byte unaffected."
    - "A pure, unit-tested classifier turns a DNS outcome or a SendGrid suppression record into deliverable / undeliverable / UNKNOWN, and a transient DNS failure yields UNKNOWN (never undeliverable)."
    - "Every user row can carry a persisted deliverability verdict, refreshed by a scheduled job — never on page load."
    - "A user whose own email is undeliverable sees a dismissable banner in the app shell; dismissal reuses the existing sessionStorage pattern and survives navigation within the session."
    - "SUMMARY states plainly that SendGrid's Email Validation API was requested but is NOT provisioned on this account (403 / no validations.email.create scope), and that MX + suppression lists are the substitute."
  artifacts:
    - path: "lib/email-deliverability.ts"
      provides: "PURE classifier — zero imports, no dns, no fetch, no db"
      exports: ["emailDomain", "classifyDnsOutcome", "classifySuppression", "mergeVerdicts", "shouldShowDeliverabilityBanner", "TRANSIENT_DNS_CODES"]
    - path: "lib/email-deliverability-refresh.ts"
      provides: "Thin impure wrapper: dns/promises probe + SendGrid suppression fetch + DB persist"
      exports: ["probeDomainDns", "fetchSendGridSuppressions", "refreshAllUsersDeliverability"]
    - path: "tests/lib/email-deliverability.test.ts"
      provides: "Unit coverage of the pure classifier incl. the transient-DNS negative case"
    - path: "app/_components/email-deliverability-banner.tsx"
      provides: "Dismissable client banner, sessionStorage-backed"
    - path: "app/api/cron/email-deliverability/route.ts"
      provides: "CRON_SECRET Bearer-protected refresh trigger"
    - path: "netlify/functions/refresh-email-deliverability.mts"
      provides: "Daily scheduled trigger, fetch-only"
    - path: "scripts/check-email-deliverability.ts"
      provides: "On-demand CLI path + live verification harness"
  key_links:
    - from: "app/(app)/layout.tsx"
      to: "app/_components/email-deliverability-banner.tsx"
      via: "props from the EXISTING `me` select (no new query)"
      pattern: "EmailDeliverabilityBanner"
    - from: "netlify/functions/refresh-email-deliverability.mts"
      to: "app/api/cron/email-deliverability/route.ts"
      via: "fetch with Bearer CRON_SECRET"
      pattern: "api/cron/email-deliverability"
    - from: "lib/email-deliverability-refresh.ts"
      to: "lib/email-deliverability.ts"
      via: "import of the pure classifier"
      pattern: "from '@/lib/email-deliverability'"
---

<objective>
Drop Resend entirely so SendGrid is the sole email transport, then detect users who
cannot receive email at all and warn them with a dismissable in-app banner.

Purpose: 6 of the 21 live users sit on `@trtarredo.demo`, a domain that does not
resolve. Every notification sent to them hard-bounces silently, because every send in
this app is best-effort by design and a rejected send is invisible from the UI. Today
nobody — not the user, not an admin — can tell that their notifications are going
nowhere.

Output: SendGrid-only `lib/email.ts`; a pure deliverability classifier plus a thin
impure DNS/suppression probe; three additive nullable `users` columns; a scheduled
refresh job on the established CRON_SECRET + Netlify pattern; a dismissable banner in
the app shell; an admin-side indicator in User Management.
</objective>

<critical_finding>
**The requested approach is NOT available and must not be built.**

The live SendGrid account was probed on 2026-07-31:

- `POST /v3/validations/email` → `403 {"errors":[{"message":"access forbidden"}]}`
- `GET /v3/scopes` → 200, 206 scopes, containing **zero** validation scopes —
  `validations.email.create` is absent entirely. `mail.send` IS present.
- Account is `type: paid`, `reputation: 100`.

SendGrid's Email Validation API is a separate paid add-on this account does not have.
Any code built on `/v3/validations/email` would 403 forever. **Do not call it.**

What IS available (all verified HTTP 200 on this account):

| Endpoint | Status | Live sample |
|---|---|---|
| `GET /v3/suppression/bounces` | 200 | `[]` |
| `GET /v3/suppression/blocks` | 200 | `{"status":"5.7.7","reason":"554 5.7.7 Email policy violation detected","email":"tobenna@paymeblue.com","created":1785477606}` |
| `GET /v3/suppression/invalid_emails` | 200 | `[]` |

So the substitute is two complementary signals: **DNS/MX** (free, predictive, catches
`@trtarredo.demo` before a single send) and **SendGrid suppressions** (reactive,
authoritative, SendGrid's own record of what actually failed).

This finding is a required deliverable — it must be restated plainly in SUMMARY.md.
</critical_finding>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md
@.planning/STATE.md

@lib/email.ts
@tests/lib/email.test.ts
@tests/lib/email-sendgrid.test.ts
@scripts/verify-email.ts
@lib/notification-autosurface.ts
@app/_components/notifications-bell.tsx
@app/(app)/layout.tsx
@app/api/cron/call-reminders/route.ts
@netlify/functions/send-call-reminders.mts
@netlify.toml
@db/schema.ts
</context>

<interfaces>
<!-- Extracted from the codebase. Use these directly — no exploration needed. -->

Current `lib/email.ts` public surface (what callers depend on):
```
export const EMAIL_FROM: string
export type SendEmailArgs = { to: string | string[]; subject: string; html: string; text?: string }
export type SendEmailResult = { data: { id: string | null } | null; error: { name: string; message: string } | null }
export type EmailProvider = 'sendgrid' | 'resend'        // DELETE
export function sendGridApiKey(): string | undefined
export function activeEmailProvider(): EmailProvider | null   // DELETE
export function isEmailServiceActive(): boolean
export function parseEmailFrom(from: string): { email: string; name?: string }
export function buildSendGridPayload(args): SendGridPayload
export function logEmailFailure(context: string, result: SendEmailResult): void
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult>
```
Callers of `activeEmailProvider()`: `scripts/verify-email.ts` only (3 sites).
Callers of `isEmailServiceActive()`: `lib/notify-*-email.ts` modules — signature unchanged.

`db/schema.ts` already imports `boolean` and `timestamp` from `drizzle-orm/pg-core`
(lines 1-13) — no new import is needed for the additive columns.

`users` table tail (db/schema.ts:42-61):
```
export const users = pgTable('users', {
  id, email, hashedPassword, name, role, emailVerified,
  position, bio, avatarData, imageKey,
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

Existing sessionStorage dismissal pattern — REUSE THIS SHAPE, do not invent a second
one (`lib/notification-autosurface.ts` + `app/_components/notifications-bell.tsx:60-82`):
```
export const AUTO_SURFACED_KEY = 'trt.bell.autoSurfacedIds'
// hydrate inside useEffect (never module scope / never during render — sessionStorage
// does not exist during SSR), wrapped in try/catch so private mode degrades to
// in-memory-only rather than throwing.
export function useRegisterForcingOverlay(active: boolean): void
export function useForcingOverlayActive(): boolean
```
Precedence registry (documented in that file): PendingCallGate (z-70) >
PendingStepGate (z-60) > bell auto-surface.

Cron-route shape (`app/api/cron/call-reminders/route.ts`) — copy verbatim:
```
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  ...
}
```

Netlify scheduled-function shape (`netlify/functions/send-call-reminders.mts`):
`SITE_URL ?? URL` base, POST with `authorization: Bearer ${CRON_SECRET}`,
`export const config: Config = { schedule: '...' }`. `netlify.toml` has
`[functions] directory = "netlify/functions"` and deliberately NO `[build]` block —
do not add one.

`app/(app)/layout.tsx:33-37` — the existing single `me` select the banner props must
ride along on (add columns here, do NOT add a second query):
```
const [me] = await db
  .select({ name: users.name, avatarData: users.avatarData, position: users.position })
  .from(users).where(eq(users.id, userId)).limit(1);
```

`app/(app)/admin/users/page.tsx:14-18` select + `app/_components/admin-users-table.tsx:15`:
```
type Row = { id: string; name: string; email: string; role: string; position: string | null }
```

Vitest: `environment: 'node'`, `globals: true`, include `tests/**/*.test.{ts,tsx}`,
alias `@` → repo root. Server modules are imported after `vi.mock('server-only', () => ({}))`.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remove Resend completely — SendGrid becomes the only transport</name>
  <files>
    lib/email.ts,
    tests/lib/email.test.ts,
    tests/lib/email-sendgrid.test.ts,
    scripts/verify-email.ts,
    package.json,
    .env.example,
    README.md,
    CLAUDE.md,
    ACCOUNTS.md
  </files>
  <behavior>
    The EMAIL-01 / EMAIL-02 behaviours currently asserted against the Resend mock must
    survive the migration, restated against SendGrid. Do NOT delete assertions —
    port them.
    - EMAIL-01: sendEmail POSTs to `https://api.sendgrid.com/v3/mail/send` with the
      correct from / to / subject / html.
    - EMAIL-01: an array of recipients produces one personalization EACH (not one
      shared `to`).
    - EMAIL-01: the optional `text` field is included as a `text/plain` part ordered
      BEFORE `text/html`, and omitted entirely when not supplied.
    - EMAIL-02: a provider failure is RETURNED as `{ data: null, error }`, never
      thrown — this is what keeps every best-effort caller unaffected.
    - EMAIL-02: `sendEmail()` throws a clear error only when NO SendGrid key is
      configured at all, and the thrown message names SENDGRID_API_KEY (not
      RESEND_API_KEY).
    - The API key never appears in a returned diagnostic.
    - `isEmailServiceActive()` is true iff a SendGrid key is set; setting only
      RESEND_API_KEY leaves it FALSE (proves the fallback is gone).
    - The verificationEmail / passwordResetEmail template assertions in
      tests/lib/email.test.ts are provider-agnostic and carry over verbatim.
  </behavior>
  <action>
    Rewrite `lib/email.ts` as a single-transport module. Delete the
    `import { Resend } from 'resend'` line, the entire `sendViaResend` function, the
    `EmailProvider` union type, and `activeEmailProvider()`. Redefine
    `isEmailServiceActive()` as `!!sendGridApiKey()`. In `sendEmail()`, replace the
    provider switch with a guard that throws
    `'SendGrid is not configured. Set SENDGRID_API_KEY (or SENDGRID_APIKEY) before calling sendEmail().'`
    when `sendGridApiKey()` is undefined, then delegates unconditionally to
    `sendViaSendGrid`. Keep `sendGridApiKey()`'s dual-spelling read exactly as-is
    (both spellings are load-bearing — see its existing comment).

    Change the `EMAIL_FROM` default from `'TRT PM <onboarding@resend.dev>'` to
    `'TRT PM <notifications@trtarredo.com>'`. Leave the SendEmailResult `{ data, error }`
    shape UNCHANGED — every caller and `logEmailFailure` depend on it, and turning
    best-effort sends into throws is the one regression this task must not cause.
    Update the doc comment above `SendEmailResult` so it no longer says the shape
    "mirrors the Resend SDK's contract" — restate it as this repo's own returned-error
    contract and say WHY (a throw here would fail the workflow step the email reports
    on).

    Rewrite `tests/lib/email.test.ts`: delete the `vi.mock('resend', ...)` block and
    the `sendMock`, rename the top describe to `email utility (SendGrid)`, and port
    every behaviour listed above using the `vi.stubGlobal('fetch', ...)` style already
    proven in `tests/lib/email-sendgrid.test.ts` (with `afterEach(() => vi.unstubAllGlobals())`).
    Assert against the parsed request body rather than a mock call object.

    In `tests/lib/email-sendgrid.test.ts`: delete the `vi.mock('resend', ...)` block
    and the `resendSendMock` (their justifying comment — "lib/email.ts imports the
    Resend SDK at module scope" — is no longer true), delete the whole
    `provider selection` describe (both its Resend cases are meaningless and its
    SendGrid case is now covered by `isEmailServiceActive`), and drop the
    `delete process.env.RESEND_API_KEY` line from `beforeEach`. Everything else in
    that file stays.

    In `scripts/verify-email.ts`: replace the three `activeEmailProvider()` call sites
    with `isEmailServiceActive()`. The "no transport" failure message becomes
    `'SendGrid is not configured. Set SENDGRID_API_KEY (or SENDGRID_APIKEY).'`. Delete
    the `provider === 'resend' && SENDGRID_API_KEY === ''` warn branch. KEEP the
    `resend.dev` EMAIL_FROM check but drop its `provider === 'sendgrid' &&` condition
    and re-comment it as a LEGACY-VALUE detector — a deployment's env may still hold
    the old sandbox address, and SendGrid will reject it. The success line becomes
    `accepted by SendGrid (id: ...)`.

    Run `npm uninstall resend`. Per STATE.md (quick task 260726-dw4), this repo needs
    `--legacy-peer-deps` because of a netlify-cli/vitest `@opentelemetry/api` peer
    conflict — if the bare command fails, retry with `--legacy-peer-deps` and note it
    in SUMMARY. Confirm `resend` is gone from both `dependencies` and the lockfile's
    root `dependencies` block.

    Docs: `.env.example` — delete `RESEND_API_KEY=`, rewrite the comment block above
    the SendGrid keys to describe a single transport, and change the `EMAIL_FROM`
    example to `TRT PM <notifications@trtarredo.com>` with a note that it must be a
    SendGrid-verified sender identity. `README.md:74` — `**Email:** sendgrid (v3 API, no SDK)`.
    `README.md:82` — `RESEND_API_KEY` → `SENDGRID_API_KEY`. `CLAUDE.md:33` —
    `**Email:** SendGrid v3 REST API (no SDK, no dependency). Resend was removed 2026-07-31.`
    `ACCOUNTS.md:41` — `RESEND_API_KEY` → `SENDGRID_API_KEY`.

    Finally grep the whole repo (excluding node_modules, .next, .git, package-lock.json,
    and .planning) for `resend`/`RESEND` case-insensitively. The ONLY surviving matches
    must be `actions/workflow-graph.ts:280,296` — those are the English word "resend"
    in a design-rejection message, entirely unrelated. Anything else is a miss.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npx vitest run tests/lib/email.test.ts tests/lib/email-sendgrid.test.ts && node -e "const p=require('./package.json');if(p.dependencies.resend||p.devDependencies?.resend)process.exit(1);console.log('resend removed')" && test "$(grep -rniE 'resend' --include='*.ts' --include='*.tsx' --include='*.mts' --include='*.json' --include='*.md' --include='*.example' . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=.planning --exclude=package-lock.json | grep -v '^./actions/workflow-graph.ts' | wc -l | tr -d ' ')" = "0"</automated>
  </verify>
  <done>
    `resend` absent from package.json and lib/email.ts; SendGrid is the only code path;
    the ported EMAIL-01/EMAIL-02 assertions pass; the repo-wide resend grep is clean
    apart from the two unrelated `actions/workflow-graph.ts` prose hits; tsc clean.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Pure deliverability classifier + additive schema columns</name>
  <files>
    lib/email-deliverability.ts,
    tests/lib/email-deliverability.test.ts,
    db/schema.ts
  </files>
  <behavior>
    `lib/email-deliverability.ts` is PURE — zero imports, no `dns`, no `fetch`, no
    `db`, no React. Every branch below is a test case in
    `tests/lib/email-deliverability.test.ts`.

    `emailDomain(address)`:
    - `'a@trtarredo.demo'` → `'trtarredo.demo'`; lowercased; trimmed.
    - no `@`, empty local part, or empty domain → `null`.

    `classifyDnsOutcome({ mx, mxErrorCode, aCount, aErrorCode })`:
    - non-empty `mx` → `{ deliverable: true, reason: null }`.
    - `mx` is exactly one record whose `exchange` is `'.'` (RFC 7505 "null MX", an
      explicit declaration that the domain accepts no mail) →
      `{ deliverable: false, reason: 'domain publishes a null MX record (RFC 7505) — it accepts no mail' }`.
    - `mxErrorCode === 'ENOTFOUND'` (NXDOMAIN — the domain does not exist at all) →
      `{ deliverable: false, reason: 'domain does not exist (DNS NXDOMAIN)' }`.
      This is the `@trtarredo.demo` case.
    - `mx` empty or `mxErrorCode === 'ENODATA'`, and `aCount > 0` →
      `{ deliverable: true, reason: null }` (RFC 5321 §5.1 implicit MX: an A record
      alone is a legal mail destination).
    - `mx` empty or `ENODATA`, and `aErrorCode` is `'ENODATA'`/`'ENOTFOUND'` or
      `aCount === 0` →
      `{ deliverable: false, reason: 'domain has no MX and no A record — it cannot receive mail' }`.
    - ANY code in `TRANSIENT_DNS_CODES` (`ESERVFAIL`, `ETIMEOUT`, `ETIMEDOUT`,
      `EREFUSED`, `ECONNREFUSED`, `ENOTIMP`, `EBADRESP`) on EITHER lookup, or any
      unrecognised code → `{ deliverable: null, reason: null }`. **This is the single
      most important case in the file**: a resolver hiccup must never brand a real
      user's address dead.

    `classifySuppression({ list, status, reason })`:
    - always `deliverable: false`; reason is `"<list>: <sendgrid reason or status>"`,
      e.g. `'blocks: 554 5.7.7 Email policy violation detected'`.
    - missing reason falls back to the status, then to a generic
      `'listed by SendGrid'` — the function never returns an empty reason.

    `mergeVerdicts(dns, suppression)`:
    - a suppression verdict always wins, even over `dns.deliverable === true` —
      SendGrid's record of an actual failure outranks a DNS prediction.
    - `suppression === null` → the dns verdict passes through unchanged.

    `shouldShowDeliverabilityBanner({ emailDeliverable, dismissed })`:
    - true ONLY when `emailDeliverable === false` and `dismissed === false`.
    - `emailDeliverable === null` (never checked, or last check was UNKNOWN) → false.
      Silence is correct for unknown; a scary banner on a transient resolver failure
      is worse than no banner.
  </behavior>
  <action>
    Create `lib/email-deliverability.ts` containing ONLY pure functions — no `import`
    statements at all. Export `DeliverabilityVerdict = { deliverable: boolean | null; reason: string | null }`,
    `TRANSIENT_DNS_CODES`, and the five functions specified above. Lead the file with a
    dense header comment stating the finding from `<critical_finding>`: SendGrid's
    Email Validation API returns 403 on this account and `validations.email.create` is
    not in its scope list, so MX + suppression lists are the substitute — and that the
    tri-state `boolean | null` exists precisely so a transient DNS failure is
    representable as "unknown" rather than collapsing into "undeliverable".

    Write `tests/lib/email-deliverability.test.ts` covering every bullet above. The
    transient-code cases and the `emailDeliverable === null` banner case get explicit,
    named tests — those are the two ways this feature could libel a working address.
    No `vi.mock('server-only')` is needed; the module has no imports.

    Append three strictly ADDITIVE nullable columns to the `users` table in
    `db/schema.ts`, after `imageKey` and before `createdAt`:
    ```
    emailDeliverable:         boolean('email_deliverable'),
    emailUndeliverableReason: text('email_undeliverable_reason'),
    emailCheckedAt:           timestamp('email_checked_at'),
    ```
    `boolean` and `timestamp` are already imported (db/schema.ts lines 1-13). All three
    are nullable with no default on purpose: NULL means "never checked / last check was
    inconclusive", which is a genuinely distinct third state from true and false.
    Comment that inline.

    Apply with `npm run db:push`. **ABORT if drizzle-kit proposes ANY drop, rename, or
    alter of an existing column or table** — this repo has a documented history of live
    drift (STATE.md, 260716-hys / 260724-alz). Only three ADD COLUMNs are acceptable.
    If drizzle-kit prompts, read the proposed statements before answering; if anything
    destructive appears, cancel, leave the schema file in place, and report it in
    SUMMARY rather than forcing it through.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npx vitest run tests/lib/email-deliverability.test.ts && test "$(grep -cE "^import |require\(" lib/email-deliverability.ts)" = "0" && grep -q "email_undeliverable_reason" db/schema.ts</automated>
  </verify>
  <done>
    The pure module has zero imports and full branch coverage including transient-DNS
    and unknown-state cases; the three nullable columns exist in db/schema.ts and were
    applied to the live DB with no drop/alter; tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: DNS + suppression probe, scheduled refresh, and on-demand CLI</name>
  <files>
    lib/email-deliverability-refresh.ts,
    app/api/cron/email-deliverability/route.ts,
    netlify/functions/refresh-email-deliverability.mts,
    scripts/check-email-deliverability.ts,
    package.json
  </files>
  <action>
    Create `lib/email-deliverability-refresh.ts` — the thin IMPURE wrapper. Starts with
    `import 'server-only'`, imports `resolveMx`/`resolve4` from `node:dns/promises`,
    the pure classifier from `@/lib/email-deliverability`, `sendGridApiKey` from
    `@/lib/email`, and `db`/`users`. It contains no classification logic of its own —
    every decision is delegated to the pure module. State that rule in the header
    comment so a later editor does not drift logic back into the network layer.

    `probeDomainDns(domain)`: call `resolveMx(domain)`; on throw capture `err.code` as
    a string (never rethrow). Only if MX yielded nothing or ENODATA, also call
    `resolve4(domain)` and capture its count or code the same way. Hand the four
    captured values straight to `classifyDnsOutcome` and return its verdict. Memoize
    per-domain within a single refresh run (a plain `Map`) — the live table has 21
    users across 4 domains, so this is 4 DNS lookups, not 21.

    `fetchSendGridSuppressions()`: if `sendGridApiKey()` is undefined, return an empty
    Map (unconfigured is not an error here — the DNS signal still works standalone).
    Otherwise GET all three of
    `https://api.sendgrid.com/v3/suppression/{bounces,blocks,invalid_emails}` with
    `Authorization: Bearer <key>`. Each returns an array of
    `{ email: string; reason?: string; status?: string; created: number }`. Build a
    `Map<lowercased email, DeliverabilityVerdict>` via `classifySuppression`. Wrap each
    fetch in its own try/catch: a failing suppression endpoint must degrade to "no
    suppression data for this list", never abort the whole refresh. Never log the key,
    never include the Authorization header in any diagnostic.

    `refreshAllUsersDeliverability()`: select `id, email` from `users`; fetch
    suppressions once; for each user compute `mergeVerdicts(await probeDomainDns(domain), suppressionMap.get(email) ?? null)`.
    **Persist only when `verdict.deliverable !== null`** — an unknown verdict leaves
    the existing row untouched, so one bad resolver run cannot wipe good data. On a
    real verdict, update `emailDeliverable`, `emailUndeliverableReason` (null when
    deliverable), and `emailCheckedAt: sql\`now()\`` — SQL-native `now()`, NOT
    `new Date()`, per this repo's naive-timestamp-clock-skew convention. An address
    with no parseable domain (`emailDomain` → null) is undeliverable with reason
    `'address has no valid domain part'`. Return
    `{ checked, undeliverable, unknown, changed }` counts. Wrap the per-user body so one
    bad row cannot abort the batch.

    Create `app/api/cron/email-deliverability/route.ts` copying
    `app/api/cron/call-reminders/route.ts` verbatim in shape: `export const dynamic = 'force-dynamic'`,
    POST, `authorization !== \`Bearer ${process.env.CRON_SECRET}\`` → 401, otherwise
    call `refreshAllUsersDeliverability()` and return its counts as JSON.

    Create `netlify/functions/refresh-email-deliverability.mts` mirroring
    `send-call-reminders.mts`: `SITE_URL ?? URL` base with the same "cannot reach
    internal API" guard, POST with the Bearer secret, `console.error` on non-ok,
    `export const config: Config = { schedule: '17 3 * * *' }` (once daily — MX records
    and suppression lists do not change minute to minute, and this is exactly the kind
    of job that must not be a page-load cost). `netlify.toml` needs NO edit: its
    `[functions] directory` already picks up new files, and its comment block
    explicitly warns against adding a `[build]` section.

    Create `scripts/check-email-deliverability.ts` as the on-demand path, using the
    `NodeModule._load` `server-only` shim + `dotenv` preamble copied verbatim from
    `scripts/verify-email.ts`. `npm run email:deliverability` prints a per-user table
    (email, verdict, reason) and the summary counts; `-- --dry-run` classifies and
    prints without writing. Register `"email:deliverability": "tsx scripts/check-email-deliverability.ts"`
    in package.json scripts, next to `email:verify`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm run email:deliverability -- --dry-run 2>&1 | tee /tmp/260731-sgo-dryrun.txt && grep -qi "trtarredo.demo" /tmp/260731-sgo-dryrun.txt && grep -q "validations" lib/email-deliverability.ts; test "$(grep -rc "v3/validations" lib/ app/ scripts/ netlify/ 2>/dev/null | grep -v ':0$' | wc -l | tr -d ' ')" = "0"</automated>
    <human-check>
      The dry run must classify `uzochukwubenamara@gmail.com` as deliverable and every
      `@trtarredo.demo` address as undeliverable with reason
      "domain does not exist (DNS NXDOMAIN)". That positive/negative pair is the proof
      the detection actually works against live data. Then run it for real (no
      --dry-run) and confirm the writes landed.
    </human-check>
  </verify>
  <done>
    The dry run classifies the live 21 users, flagging the 6 `@trtarredo.demo`
    addresses and passing `@gmail.com`; a real run persists verdicts; the cron route
    401s without the Bearer secret; no code references `/v3/validations`; tsc and lint
    clean.
  </done>
</task>

<task type="auto">
  <name>Task 4: Dismissable banner in the app shell + admin visibility</name>
  <files>
    app/_components/email-deliverability-banner.tsx,
    app/(app)/layout.tsx,
    app/(app)/admin/users/page.tsx,
    app/_components/admin-users-table.tsx
  </files>
  <action>
    Create `app/_components/email-deliverability-banner.tsx` (`'use client'`), taking
    `{ deliverable: boolean | null; reason: string | null }`. Export
    `EMAIL_DELIVERABILITY_DISMISSED_KEY = 'trt.email.deliverabilityDismissed'`.

    Reuse the EXISTING sessionStorage pattern verbatim from
    `app/_components/notifications-bell.tsx:60-82` — hydrate the dismissed flag inside
    a `useEffect` (never at module scope, never during render: sessionStorage does not
    exist during SSR and touching it outside an effect desyncs hydration), wrapped in
    try/catch so private mode degrades to in-memory-only. Write the same key on
    dismiss, also in try/catch. Do NOT invent a second dismissal mechanism, and do NOT
    reach for localStorage — sessionStorage is right here for the same reason the bell
    uses it: an admin fixing the address mid-session should let the banner return next
    session without a permanent opt-out.

    Render nothing unless `shouldShowDeliverabilityBanner({ deliverable, dismissed })`
    from the pure module returns true. Copy: state plainly that email notifications to
    their address are not being delivered, show their address and the reason, and give
    the ONE actionable instruction — ask an administrator to correct it in User
    Management, since a user cannot change their own email here. Include a dismiss
    button with an accessible label.

    PRECEDENCE — comment this explicitly. The banner deliberately does NOT call
    `useRegisterForcingOverlay`: it is an inline, in-flow, non-modal notice, not a
    demand for a decision, so it must not suppress the notifications bell's
    auto-surface the way PendingCallGate (z-70) and PendingStepGate (z-60) do. It
    renders inside `<main>` beneath the sticky header's z-30 and well beneath both
    gates, so a forcing modal always wins the screen without either component knowing
    about the other. It never auto-focuses.

    In `app/(app)/layout.tsx`, extend the EXISTING `me` select (line 33-37) with
    `emailDeliverable: users.emailDeliverable` and
    `emailUndeliverableReason: users.emailUndeliverableReason` — no second query, this
    layout already runs on every authenticated page. Mount
    `<EmailDeliverabilityBanner ... />` as the first child inside the
    `<div className="mx-auto w-full max-w-6xl">` wrapper in `<main>`, above
    `{children}`.

    Admin visibility (keep it small — this is the last thing in the diff and must not
    balloon it): add `emailDeliverable` and `emailUndeliverableReason` to the select in
    `app/(app)/admin/users/page.tsx`, widen the `Row` type in
    `app/_components/admin-users-table.tsx` with both nullable fields, and render a
    small red "Undeliverable" badge next to the email cell (with the reason as its
    `title`) when `emailDeliverable === false`. No new action, no new control, no
    filtering — only an admin can fix another user's address, so they only need to SEE
    it. If either file's structure makes this more than roughly 20 lines, stop and
    report it in SUMMARY instead of expanding scope.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm test 2>&1 | tail -20 && grep -q "EmailDeliverabilityBanner" "app/(app)/layout.tsx" && grep -q "shouldShowDeliverabilityBanner" app/_components/email-deliverability-banner.tsx && test "$(grep -c "useRegisterForcingOverlay" app/_components/email-deliverability-banner.tsx)" = "0" && test "$(grep -c "localStorage" app/_components/email-deliverability-banner.tsx)" = "0"</automated>
    <human-check>
      Sign in as a `@trtarredo.demo` QA account (see the seeded per-role credentials):
      the banner appears with the NXDOMAIN reason, dismisses on click, stays dismissed
      across in-session navigation, and returns after a fresh session. Sign in as a
      `@gmail.com` account: no banner at all. With a pending step on your desk, confirm
      PendingStepGate still takes the screen and the banner sits quietly behind it.
      Finally load /admin/users and confirm the 6 demo addresses carry the badge.
    </human-check>
  </verify>
  <done>
    Undeliverable users see a dismissable banner; deliverable and never-checked users
    see nothing; dismissal uses the existing sessionStorage pattern with no second
    mechanism and no localStorage; the banner does not register as a forcing overlay;
    admins see the badge in User Management; tsc, lint, and the full suite are green
    with no regressions against the 528 passed + 1 todo baseline.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| App → SendGrid API | Bearer API key crosses; SendGrid responses are untrusted input |
| App → public DNS resolvers | Attacker-influenceable responses (a domain owner controls their own MX) |
| Netlify scheduler → internal cron route | Unauthenticated public HTTP endpoint guarded only by a shared secret |
| Browser → app shell | Undeliverable reason string is rendered into a user's page |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260731-01 | Information Disclosure | `lib/email.ts`, `lib/email-deliverability-refresh.ts` | mitigate | Never interpolate `sendGridApiKey()` into any log, error, or returned diagnostic. Task 1's existing "never leaks the API key" test is retained; Task 3 forbids logging the Authorization header. |
| T-260731-02 | Tampering | DNS responses | mitigate | A hostile/compromised resolver returning SERVFAIL cannot mark users dead — `classifyDnsOutcome` maps every transient code to `deliverable: null`, and `refreshAllUsersDeliverability` refuses to persist a null verdict. |
| T-260731-03 | Spoofing | `app/api/cron/email-deliverability/route.ts` | mitigate | Constant `Bearer ${CRON_SECRET}` check with an explicit `!expected` guard so an unset secret fails closed (401), copied from the proven call-reminders route. No session/DAL surface is exposed. |
| T-260731-04 | Denial of Service | DNS probe fan-out | mitigate | Per-domain memoization caps the live table's 21 users at 4 lookups; the job is daily and scheduled, never triggered by a page load. |
| T-260731-05 | Elevation of Privilege | admin badge in User Management | accept | Read-only display on a page already behind `requireAdmin()`; no new action or mutation is added. |
| T-260731-06 | Information Disclosure | banner reason string | mitigate | A user only ever sees the verdict for their OWN address (sourced from the layout's `eq(users.id, userId)` select). SendGrid reason strings are rendered as React text children, never `dangerouslySetInnerHTML`. |
| T-260731-SC | Tampering | npm/pip/cargo installs | mitigate | No packages are ADDED by this task — `dns/promises` is built in. The only dependency change is a REMOVAL (`npm uninstall resend`), which introduces no new supply-chain surface, so no legitimacy checkpoint is required. |
</threat_model>

<verification>
Run from `/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm`:

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean on every touched file. If a pre-existing unrelated lint
   error surfaces (this has happened before, see STATE.md 260728-cfn), leave it alone
   and note it.
3. `npm test` — full suite. Baseline is **528 passed + 1 todo**. Task 1 rewrites tests
   rather than adding them, so the exact total will shift; the requirement is **zero
   failures** and a net total no lower than the baseline. State the actual delta in
   SUMMARY.
4. `npm run email:verify` — reports SendGrid as the transport with no mention of a
   provider choice.
5. `npm run email:deliverability -- --dry-run` — the `@gmail.com` vs `@trtarredo.demo`
   positive/negative pair classifies correctly.
6. Repo-wide `resend` grep returns only the two unrelated prose hits in
   `actions/workflow-graph.ts`.
7. No file anywhere references `/v3/validations`.
</verification>

<success_criteria>
- Resend is gone from package.json, the lockfile, `lib/email.ts`, both test files,
  `scripts/verify-email.ts`, and all four doc files.
- EMAIL-01 and EMAIL-02 behaviours are still asserted — ported to SendGrid, not deleted.
- `sendEmail()` still returns provider errors instead of throwing; no workflow step,
  call, or escalation can fail because of anything in this task.
- The deliverability classifier is pure, import-free, and unit-tested, with explicit
  coverage of the transient-DNS and unknown-state cases.
- `users` gained exactly three additive nullable columns; no drop, rename, or alter
  touched the live DB.
- Deliverability is refreshed by a daily scheduled job on the existing CRON_SECRET +
  Netlify pattern plus an on-demand CLI — never on page load.
- An undeliverable user sees a dismissable banner reusing the existing sessionStorage
  pattern, which never fights PendingStepGate / PendingCallGate / the bell.
- tsc, lint, and the full suite are green with no regressions.
</success_criteria>

<output>
Create `.planning/quick/260731-sgo-sendgrid-only-deliverability/260731-sgo-SUMMARY.md` when done.

**SUMMARY must state plainly, as a first-class deliverable, that:** SendGrid's Email
Validation API was the requested mechanism but is NOT provisioned on this account —
`POST /v3/validations/email` returns 403 `access forbidden`, and `GET /v3/scopes`
(200, 206 scopes) contains no validation scopes at all; `validations.email.create` is
absent. It is a separate paid add-on. DNS/MX checks plus the three SendGrid
suppression lists (bounces, blocks, invalid_emails) are the substitute that was built
instead, and they are complementary: MX is predictive and catches a dead domain before
a single send, suppressions are SendGrid's own reactive record of addresses that
actually failed.

Also record: the exact test-count delta vs the 528 + 1 todo baseline, whether
`npm uninstall resend` needed `--legacy-peer-deps`, the drizzle-kit push output
(confirming three ADD COLUMNs and nothing else), and the live dry-run results for the
`uzochukwubenamara@gmail.com` / `@trtarredo.demo` pair.
</output>
