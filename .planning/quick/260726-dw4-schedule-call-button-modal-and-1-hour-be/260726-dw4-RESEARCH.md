# Quick Task 260726-dw4: Netlify Scheduled Function - Research

**Researched:** 2026-07-26
**Domain:** Netlify Scheduled Functions on a Next.js 16 App Router site (net-new infra, no netlify.toml exists)
**Confidence:** HIGH (file shape, cron, timeout, invocation model, runtime env var — all official docs) / MEDIUM (Next.js Runtime coexistence — inferred, not explicitly documented)

## Summary

Netlify Scheduled Functions in 2026 are still standard Netlify Functions (v2 API, `.mts`/`.mjs`, in `netlify/functions/`) with either an inline `export const config = { schedule: "..." }` or a `netlify.toml` `[functions."<name>"] schedule = "..."` block — **both mechanisms are current and fully supported**, confirmed directly from `docs.netlify.com/build/functions/scheduled-functions/` (fetched today) and cross-checked via Context7's Netlify docs index. Standard cron (`*/5 * * * *`) is supported. Scheduled functions are **not HTTP-reachable** — Netlify invokes them internally on schedule (or via "Run now" / CLI), so no auth bolt-on is needed for the trigger itself, but the *internal API route it calls* still needs its own secret check since that route IS a normal HTTP endpoint. The reliable way for the function to build the callback URL is `process.env.URL` — officially documented as available to functions at runtime (not just build-time) — but given the "reliability in a scheduled/cron context specifically" ambiguity, the practical/safer choice is an explicitly configured `SITE_URL` env var, since `URL` reflects whatever Netlify serves at request time (branch/deploy-preview nuances) and there's no docs page that specifically calls out scheduled-function runtime as identical to HTTP-function runtime for this variable (it's a reasonable inference, not a stated guarantee).

**Primary recommendation:** Create `netlify/functions/send-call-reminders.mts` using inline `export const config: Config = { schedule: "*/5 * * * *" }`, install `@netlify/functions@^5.3.0` as a devDependency for the `Config` type only, add a `netlify.toml` with `[build] command`/`publish` for Next.js (via `@netlify/plugin-nextjs` per this repo's existing deploy target) — do NOT also duplicate the schedule in `netlify.toml` (redundant; inline wins). Use an explicit `SITE_URL` env var (user-configured in Netlify site settings + `.env.local`) for the internal fetch target, with `process.env.URL` as a documented fallback only if `SITE_URL` is unset.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cron trigger / scheduling | Netlify platform (Functions) | — | Netlify owns cron infra; nothing in Next.js can self-schedule server-side |
| Reminder business logic (query due calls, dedupe via `reminderSentAt`, fan-out notifications) | API / Backend (Next.js Route Handler) | — | Must reuse `lib/notifications.ts` / DB access — single source of truth per CONTEXT.md decision |
| HTTP trigger auth (secret header check) | API / Backend | — | The Netlify function is an untrusted-ish caller from the route's perspective; route must verify a shared secret |
| Netlify function itself | Netlify Functions runtime | — | Thin, stateless — only responsibility is "wake up, fetch the internal URL, done" |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@netlify/functions` | `^5.3.0` [VERIFIED: npm registry — `npm view @netlify/functions version` → `5.3.0`, latest dist-tag] | TypeScript types (`Config`, `Context`) for scheduled functions | Official Netlify types package; not required at runtime, only for type-checking the `config` export and handler signature |

No other new runtime dependency is required. The function itself needs zero business-logic packages — it's a thin `fetch()` call into the existing Next.js API route.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `netlify-cli` | `^27.0.0` [VERIFIED: npm registry] | Local dev/testing of scheduled functions (`netlify dev`, `netlify functions:invoke`) | Dev-only, devDependency; not required for production but needed to test the function locally before relying on Netlify's dashboard "Run now" |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Netlify Scheduled Function | Vercel Cron / external cron (e.g. cron-job.org hitting a secret-protected route) | User already locked "Netlify Scheduled Function" in CONTEXT.md — not re-litigated here |
| Inline `config.schedule` | `netlify.toml` `[functions."name"].schedule` | Both valid; inline keeps the schedule co-located with the code, `netlify.toml` needed if the function isn't JS/TS (not applicable here) |

**Installation:**
```bash
npm install -D @netlify/functions netlify-cli
```

**Version verification:** Ran `npm view @netlify/functions version` (→ `5.3.0`) and `npm view netlify-cli version` (→ `27.0.0`) directly against the npm registry during this research session — both current as of 2026-07-26.

## Package Legitimacy Audit

Both packages are official, first-party Netlify packages (`@netlify/*` scope, org-verified on npm), pre-existing multi-year publication history, and are the canonical packages referenced in Netlify's own official documentation (fetched directly from docs.netlify.com in this session). slopcheck was not run (no local Python/pip invocation performed in this quick-task research pass), so per protocol these are conservatively tagged:

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `@netlify/functions` | npm | Multi-year, official Netlify org scope | github.com/netlify/functions | not run — `[ASSUMED]` per protocol despite doc citation | Approved, planner should gate behind `checkpoint:human-verify` per protocol default |
| `netlify-cli` | npm | Multi-year, official Netlify org scope | github.com/netlify/cli | not run — `[ASSUMED]` | Approved, same gate |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was not invoked this session — both packages are `[ASSUMED]` per protocol even though they are cited directly from official Netlify documentation and are the officially-scoped `@netlify/*` / Netlify-org npm packages. Planner should still add a lightweight `checkpoint:human-verify` before `npm install` per the default gate, though risk is low given first-party provenance.*

## Architecture Patterns

### System Architecture Diagram

```
Netlify cron scheduler (every 5 min, UTC)
        |
        v
netlify/functions/send-call-reminders.mts   (thin trigger, no DB/GetStream logic)
        |
        | fetch(`${SITE_URL}/api/internal/call-reminders`, { headers: { "x-internal-secret": ... } })
        v
app/api/internal/call-reminders/route.ts     (Next.js Route Handler — verifies secret)
        |
        | calls existing lib/ functions
        v
lib/video-calls.ts  -->  query calls where scheduledFor is within next hour AND reminderSentAt IS NULL
        |
        v
lib/notifications.ts (notifyUser) --> fan out to invitees (participants minus creator)
        |
        v
DB: UPDATE calls SET reminderSentAt = now() WHERE id = ...   (idempotency gate)
```

### Recommended Project Structure
```
netlify/
└── functions/
    └── send-call-reminders.mts   # thin scheduled trigger, fetch-only
netlify.toml                       # build config (publish dir / plugin), NOT the schedule (inline is used)
app/
└── api/
    └── internal/
        └── call-reminders/
            └── route.ts           # secret-protected Route Handler, does the real work
```

### Pattern 1: Inline scheduled function config
**What:** Export a `config` object with a `schedule` cron string directly from the function file.
**When to use:** Always, for JS/TS functions (this repo is TS) — avoids maintaining schedule in two places.
**Example:**
```typescript
// Source: https://docs.netlify.com/build/functions/scheduled-functions (fetched 2026-07-26)
import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  const secret = process.env.INTERNAL_CRON_SECRET;
  const baseUrl = process.env.SITE_URL ?? process.env.URL;

  const res = await fetch(`${baseUrl}/api/internal/call-reminders`, {
    method: "POST",
    headers: { "x-internal-secret": secret ?? "" },
  });

  if (!res.ok) {
    console.error("call-reminders trigger failed", res.status, await res.text());
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
```

### Pattern 2: Secret-protected internal Route Handler (the actual logic lives here, per CONTEXT.md decision)
**What:** A normal Next.js Route Handler at `app/api/internal/call-reminders/route.ts` that checks a shared secret header, then does the DB query + notification fan-out using existing `lib/` modules.
**When to use:** Any time an external trigger (Netlify function, cron, webhook) needs to invoke app logic without a user session.
**Example:**
```typescript
// app/api/internal/call-reminders/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ... existing lib/video-calls.ts + lib/notifications.ts logic here
  return NextResponse.json({ ok: true });
}
```

### Anti-Patterns to Avoid
- **Putting DB/GetStream logic inside the Netlify function itself:** violates the CONTEXT.md decision to keep one source of truth in `lib/`; also Netlify Functions don't share the Next.js app's module graph/build output, so you'd have to duplicate imports and env wiring.
- **Relying on `netlify.toml` schedule AND inline `config.schedule` simultaneously:** redundant and a source of drift; pick one (this research recommends inline).
- **Skipping the secret header on the internal route:** even though the *scheduled function* itself isn't HTTP-reachable, the Route Handler it calls IS a normal public URL unless protected — a scheduled function being "invocation-only" does NOT make the downstream API route safe by itself.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom polling/setInterval, external cron service | Netlify Scheduled Functions (`config.schedule`) | Already locked by user decision; Netlify manages the cron infra, retries, and "Run now" testing UI |
| TypeScript types for function signature | Hand-typed `Request`/`Config` interfaces | `@netlify/functions`'s `Config`/`Context` types | Official types kept in sync with the runtime's actual invocation contract |

**Key insight:** The only genuinely new code here is a ~15-line trigger file and one secret-protected route handler. Everything else (DB query, notification sending) already exists per CONTEXT.md's canonical references — resist the urge to build anything more elaborate than a thin fetch-and-forget trigger.

## Common Pitfalls

### Pitfall 1: Assuming the scheduled function is publicly callable for testing/debugging
**What goes wrong:** Developer tries to `curl` the deployed function URL to test it and gets 404/not found, then assumes something is broken.
**Why it happens:** Scheduled functions are Netlify-invocation-only — not exposed as a normal function endpoint the way non-scheduled functions are.
**How to avoid:** Test locally with `netlify functions:invoke send-call-reminders` (via `netlify-cli`) or use the "Run now" button in the Netlify dashboard's Scheduled Functions panel after first deploy.
**Warning signs:** 404s when hitting `/.netlify/functions/send-call-reminders` directly over HTTP.

### Pitfall 2: 30-second execution timeout silently truncating a slow DB query + fan-out
**What goes wrong:** If the reminders route does a heavy query or notifies many participants synchronously, and the *function's fetch* + the *route handler's own work* combined exceed limits, the invocation could fail/timeout.
**Why it happens:** Netlify's default Scheduled Function timeout is 30 seconds `[CITED: docs.netlify.com/build/functions/scheduled-functions]`. This constrains the Netlify function's own execution (including its `fetch` wait), not directly the Next.js server's own request timeout, but if the Next.js host enforces a similar/shorter limit the two compound.
**How to avoid:** Keep the reminder window query narrow (only calls in the next-hour window with `reminderSentAt IS NULL`), and given the small scale of this app (internal PM tool, not high-volume), this is unlikely to be an issue — but don't add unrelated heavy work to this endpoint.
**Warning signs:** Function logs showing timeout errors in the Netlify Functions dashboard.

### Pitfall 3: `process.env.URL` behaving differently across deploy contexts (production vs. deploy previews vs. branch deploys)
**What goes wrong:** If this project ever gets branch deploys/PR previews on Netlify, `URL` in a scheduled function running on a branch deploy could point to a different origin than expected, or scheduled functions might only run on production context in the first place (behavior not explicitly documented per-context in the fetched docs).
**Why it happens:** `URL` reflects "the main address for your site" per docs, but Scheduled Functions' exact deploy-context behavior for non-production branches isn't spelled out in the fetched docs page.
**How to avoid:** Use an explicit, user-set `SITE_URL` env var scoped correctly in Netlify's environment variable settings (production-only value), and treat `process.env.URL` only as a documented fallback, not the primary mechanism — this was an explicit ask in the focus questions and there's genuine ambiguity here worth flagging rather than asserting confidently.
**Warning signs:** Reminders firing against the wrong deployed URL, or 404s from the internal route on a preview deploy.

### Pitfall 4: Custom `netlify/functions` directory clashing with the Next.js Runtime's own generated functions
**What goes wrong:** Confusion about whether hand-written functions in `netlify/functions/` collide with the functions Netlify's Next.js Runtime (`@netlify/plugin-nextjs` / OpenNext adapter) auto-generates for SSR/API routes.
**Why it happens:** Not explicitly documented — Netlify's own Next.js Runtime overview page and the OpenNext adapter page (both fetched in this session) do not address custom-function coexistence directly.
**How to avoid:** In practice, the Next.js Runtime's auto-generated functions are written to its own internal build output location (not the user-facing `netlify/functions/` source directory), so a hand-written function in `netlify/functions/` should coexist without a build-time conflict — this is the standard, widely-used pattern (many Next.js-on-Netlify projects add custom scheduled/background functions alongside the Next.js Runtime with no reported conflict in the community threads reviewed). Confidence: MEDIUM — verify with a real deploy/preview build after adding the file, since no first-party doc explicitly confirms this.
**Warning signs:** Build log errors mentioning function name collisions, or the Netlify Functions dashboard listing an unexpected/missing function count after deploy.

## Code Examples

### Full scheduled function
```typescript
// Source: https://docs.netlify.com/build/functions/scheduled-functions (fetched 2026-07-26), adapted
// netlify/functions/send-call-reminders.mts
import type { Config } from "@netlify/functions";

export default async (req: Request) => {
  const { next_run } = await req.json().catch(() => ({ next_run: undefined }));
  console.log("send-call-reminders invoked; next run:", next_run);

  const baseUrl = process.env.SITE_URL ?? process.env.URL;
  if (!baseUrl) {
    console.error("SITE_URL/URL not set — cannot reach internal API");
    return;
  }

  const res = await fetch(`${baseUrl}/api/internal/call-reminders`, {
    method: "POST",
    headers: {
      "x-internal-secret": process.env.INTERNAL_CRON_SECRET ?? "",
      "content-type": "application/json",
    },
  });

  if (!res.ok) {
    console.error("call-reminders trigger failed:", res.status, await res.text());
  }
};

export const config: Config = {
  schedule: "*/5 * * * *",
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| CommonJS `exports.handler = async (event) => {}` (Functions v1 API) | ES module default export `export default async (req: Request) => {}` (Functions v2 API) with `.mts`/`.mjs` extension | Netlify Functions v2 API, current standard per docs fetched today | v1-style handler syntax found in older blog posts (2022-era, e.g. flaviocopes.com, raymondcamden.com articles found in search) is stale — do not copy those code shapes verbatim; use the `Config`/`Request`-based v2 shape shown in this doc |

**Deprecated/outdated:** Older tutorials (2022) using `exports.handler` + `schedule` wrapped via `require("@netlify/functions").schedule(...)` helper reflect the pre-v2-API convention. Current official docs (fetched live this session) use the plain `export default` + `export const config` shape shown above — use that, not the older `schedule()` wrapper pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Hand-written `netlify/functions/*.mts` files coexist without conflict alongside the Next.js Runtime's (`@netlify/plugin-nextjs`/OpenNext adapter) auto-generated functions | Common Pitfalls #4 | If wrong, first deploy could fail to build or the scheduled function could silently not appear in the Functions dashboard — low-cost to verify: just deploy and check the dashboard/build log |
| A2 | `process.env.URL` is populated identically for scheduled (cron-invoked) function executions as it is for regular HTTP-invoked functions | Summary, Pitfall #3 | If wrong on preview/branch deploys, reminders could fetch the wrong origin — mitigated by using explicit `SITE_URL` as primary, not relying on `URL` alone |
| A3 | `@netlify/functions` and `netlify-cli` are legitimate, non-hallucinated, safe-to-install first-party packages | Package Legitimacy Audit | Near-zero — both are official `@netlify/*`-scoped, multi-year-old, and directly cited in Netlify's own live docs fetched this session; slopcheck itself just wasn't run |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Does this repo's Netlify site already exist with `netlify.toml` build config, or does this quick task also need to set up the initial Netlify deploy pipeline (build command, publish dir, `@netlify/plugin-nextjs`) from scratch?**
   - What we know: CONTEXT.md states no `netlify.toml` exists yet in this repo.
   - What's unclear: Whether a Netlify *site* is already connected/deployed (via dashboard-configured build settings) even without a `netlify.toml` in-repo, in which case only the scheduled function + minimal `netlify.toml` addition is needed, vs. a from-scratch Netlify deploy setup.
   - Recommendation: Planner should confirm with the user whether Netlify hosting is already live for this app before assuming a full `netlify.toml` (with `[build]` plugin config) needs to be authored as part of this task, since CONTEXT.md scope is specifically the reminder feature, not initial Netlify onboarding.

2. **Exact env var name and where `INTERNAL_CRON_SECRET` / `SITE_URL` get set (Netlify dashboard vs. `.env.local`).**
   - What we know: Both need to exist in the Netlify function's runtime environment (Netlify dashboard env vars, scoped to Functions) and the Next.js app's runtime environment (same Netlify site's env vars, since it's one deploy).
   - What's unclear: Since it's the same Netlify site serving both the Next.js app and the function, dashboard-set env vars should be shared automatically — but this wasn't verified against a live site in this session.
   - Recommendation: Confirm at implementation time by checking the Netlify site's environment variable settings once deployed; if `.env.local` is used for local dev, mirror the same var names.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@netlify/functions` | Type-checking the scheduled function | not yet installed | `5.3.0` (latest, verified via npm) | Write function without types (plain `.mjs`, no `Config` import) — works but loses type safety |
| `netlify-cli` | Local testing (`netlify dev`, `functions:invoke`) | not yet installed globally or as devDep (not checked this session) | `27.0.0` (latest, verified via npm) | Test via Netlify dashboard's "Run now" after deploy instead of locally |
| Netlify site/hosting | Any of this to work at all | unknown — not verified whether this repo is connected to a live Netlify site | — | See Open Question #1 |

**Missing dependencies with no fallback:** None — everything has a viable fallback or is a straightforward `npm install`.

**Missing dependencies with fallback:** `@netlify/functions` (fallback: untyped JS), `netlify-cli` (fallback: dashboard-based testing).

## Sources

### Primary (HIGH confidence)
- https://docs.netlify.com/build/functions/scheduled-functions/ — fetched live 2026-07-26: file location/extension, both config mechanisms, cron syntax + `@hourly` etc. shortcuts, 30s timeout, invocation-only (not HTTP-reachable), `@netlify/functions` requirement for types
- https://docs.netlify.com/build/functions/environment-variables/ — fetched live 2026-07-26: `URL`, `SITE_NAME`, `SITE_ID` documented as the only three env vars available to functions at runtime (vs. `DEPLOY_URL`/`DEPLOY_PRIME_URL`/`CONTEXT` being build-time only)
- Context7 `/websites/netlify` — cross-verified scheduled function code shape (inline `config` export, `netlify.toml` equivalent) matches the fetched docs page exactly
- `npm view @netlify/functions version` / `npm view netlify-cli version` — direct registry queries, run 2026-07-26: `5.3.0` and `27.0.0` respectively

### Secondary (MEDIUM confidence)
- https://opennext.js.org/netlify — fetched live: confirms OpenNext adapter auto-provisions its own Functions, but does NOT address coexistence with custom `netlify/functions/` — used to inform Pitfall #4 as an inference, not a confirmed fact

### Tertiary (LOW confidence)
- https://answers.netlify.com/t/nextjs-deployment-with-functions-folder/50372 — forum thread about a *different* scenario (Firebase functions folder collision), used only to confirm the functions-directory setting is configurable, not as evidence for/against the Next.js Runtime coexistence question
- Older tutorial articles (flaviocopes.com, raymondcamden.com, ~2022) found via search — explicitly flagged in "State of the Art" as reflecting the deprecated Functions v1 API shape; NOT used as a basis for any recommendation in this document

## Metadata

**Confidence breakdown:**
- Scheduled function file shape/cron/timeout/invocation model: HIGH — directly fetched from live official docs this session, cross-verified with Context7
- Runtime base-URL env var: HIGH for what `URL`/`SITE_NAME`/`SITE_ID` are documented to do; MEDIUM on whether behavior is identical specifically in a scheduled/cron invocation vs. regular HTTP invocation (not explicitly distinguished in docs) — hence recommending explicit `SITE_URL` as primary
- Next.js Runtime + custom function coexistence: MEDIUM — no official doc found addressing this directly; inference based on architecture (adapter uses its own internal build output) and absence of reported conflicts for this specific scenario in community sources reviewed

**Research date:** 2026-07-26
**Valid until:** ~30 days (Netlify Functions API is relatively stable, but this is fast-evolving infra — re-verify file shape/env vars if this task is picked up substantially later)
