---
phase: quick-260728-eml
plan: 01
subsystem: email
tags: [resend, html-email, escalation, video-calls, notifications]

# Dependency graph
requires:
  - phase: quick-260727-gow
    provides: "step_escalations table + recipientId resolution in amendEscalatedChecklistAction"
  - phase: quick-260726-dw4
    provides: "createVideoCall / scheduled call flow with invitees fan-out"
provides:
  - "lib/email-layout.ts: escapeHtml/escapeAttr/absoluteUrl/ctaButton/renderBrandedEmail shared HTML email primitives"
  - "All 7 email templates rendered through one branded 600px table layout"
  - "escalationAmendedEmail + videoCallScheduledEmail templates"
  - "Best-effort emailEscalationAmended and emailVideoCallScheduled sends wired into their choke points"
affects: [auth-email-flows, admin-users, super-admin-notifications, escalation-workflow, video-calls]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared branded HTML email layout (table-based, inline CSS, bulletproof CTA button with VML/mso fallback, preheader, plaintext fallback)"
    - "Best-effort email send modules mirror lib/notify-super-admins-email.ts shape: isEmailServiceActive() guard, single try/catch, non-secret console.warn diagnostic, never throw"

key-files:
  created:
    - lib/email-layout.ts
    - lib/email-layout.test.ts
    - lib/email-templates.branded.test.ts
    - lib/notify-escalation-email.ts
    - lib/notify-video-call-email.ts
    - lib/notify-video-call-email.test.ts
  modified:
    - lib/email-templates.ts
    - actions/escalation.ts
    - lib/video-calls.ts

key-decisions:
  - "escapeHtml escapes & first, then <, >, \", ' to avoid double-escaping entities produced by the earlier passes"
  - "absoluteUrl throws on any relative path and any non-http(s) scheme, closing off a javascript: CTA-href injection surface"
  - "Video-call-scheduled email is a single Resend send with all invitee addresses in one `to:` array (one 403 at worst, not N) — accepted disclosure since all recipients already see each other in the call's own participant list (T-eml-04)"
  - "Video-call email is gated on scheduledFor being non-null; instant calls rely on the in-app notification + GetStream ring only"
  - "Escalation-amended email reuses the exact recipientId/projectName/amenderName already resolved for the existing notifyUser call in actions/escalation.ts, keeping the CI grep-gated file's diff to a single new import + one await"
  - "Video-call-scheduled email formats scheduledFor with toLocaleString('en-GB', { timeZone: 'UTC' }) and an explicit 'UTC' suffix so the timestamp is unambiguous regardless of server or reader timezone"

patterns-established:
  - "Every new email template returns { subject, html, text } built via renderBrandedEmail; every interpolated user-controlled value passes through escapeHtml/escapeAttr before reaching the layout"
  - "Every new outbound-email helper: isEmailServiceActive() early-return, one try/catch, console.warn(err.message) only on failure, no exceptions ever escape to the caller"

requirements-completed: [EML-01, EML-02, EML-03]

# Metrics
duration: ~4h30m (across 4 tasks, continuation execution)
completed: 2026-07-28
---

# Phase quick-260728-eml: Branded Email Notifications Summary

**Replaced all 5 bare-`<p>`-fragment email templates with a shared branded HTML layout (600px table, orange TRT header band, bulletproof CTA button, preheader, plaintext fallback), and added two new best-effort sends — escalation-amended to the officer who raised it, video-call-scheduled to every invitee.**

## Performance

- **Duration:** ~4h30m across the 4-task plan (Tasks 1-3 landed in an earlier session; Task 4 executed in this continuation)
- **Started:** 2026-07-28T09:30:26+01:00 (Task 1 commit)
- **Completed:** 2026-07-28T13:59:58+01:00 (Task 4 commit)
- **Tasks:** 4/4 completed
- **Files modified:** 9 (3 created in Task 1, 2 modified in Task 2, 2 modified in Task 3 (same 2 files as Task 2), 5 touched in Task 4 — 3 new, 2 modified)

## Accomplishments
- `lib/email-layout.ts` — reusable branded-email primitives: `escapeHtml`, `escapeAttr`, `absoluteUrl` (throws on relative/non-http(s) hrefs), `ctaButton` (bulletproof button + Outlook VML fallback), `renderBrandedEmail` (full HTML shell + plaintext derivation)
- All 7 templates (`verificationEmail`, `credentialsEmail`, `passwordResetEmail`, `stepTurnEmail`, `projectClosedOutEmail`, `escalationAmendedEmail`, `videoCallScheduledEmail`) now render through one shared layout, with unchanged names/args/subjects for the three that already have callers
- `escalationAmendedEmail` and `videoCallScheduledEmail` templates added, covering the two previously in-app-only notification moments
- `lib/notify-escalation-email.ts` (`emailEscalationAmended`) wired into `actions/escalation.ts`'s existing `amendEscalatedChecklistAction` recipient block
- `lib/notify-video-call-email.ts` (`emailVideoCallScheduled`) wired into `lib/video-calls.ts`'s `createVideoCall`, gated on `scheduledFor`
- Both new sends are best-effort: guarded by `isEmailServiceActive()`, wrapped in try/catch, log one non-secret diagnostic on failure, and can never fail or roll back the write they report on

## Task Commits

Each task was committed atomically:

1. **Task 1: Branded email layout primitives** - `a67a9f4` (feat)
2. **Task 2: Refactor the 5 existing templates onto the branded layout** - `7fcc0d9` (refactor)
3. **Task 3: escalationAmendedEmail + videoCallScheduledEmail templates** - `e83621f` (feat)
4. **Task 4: Wire both sends best-effort at their choke points + operator note** - `a2d1a4e` (feat)

**Plan metadata:** committed alongside this summary (docs)

## Files Created/Modified
- `lib/email-layout.ts` — branded HTML email primitives (escape, absoluteUrl, ctaButton, renderBrandedEmail); no `<svg>`, no `<style>`, no remote `<img src="http...">`
- `lib/email-layout.test.ts` — unit coverage for every primitive, including the `absoluteUrl` throw cases
- `lib/email-templates.ts` — all 7 templates rebuilt on `renderBrandedEmail`; exported names/args/subjects of the 5 pre-existing templates unchanged
- `lib/email-templates.branded.test.ts` — coverage for the refactored templates plus the 2 new ones (escaping, CTA href, subject, plaintext)
- `lib/notify-escalation-email.ts` — new best-effort `emailEscalationAmended(input)` module
- `lib/notify-video-call-email.ts` — new best-effort `emailVideoCallScheduled(input)` module
- `lib/notify-video-call-email.test.ts` — inactive-service, empty-invitee-list, single-send-with-all-addresses, never-throws-on-send-rejection, never-throws-on-db-rejection coverage
- `actions/escalation.ts` — one new import + one `await emailEscalationAmended(...)` inside the existing `recipientId` block in `amendEscalatedChecklistAction`; grep gate on `completeGraphStep|advanceOrConfirmDualRole|projectStepCompletions|workflowStepStates` still returns zero matches
- `lib/video-calls.ts` — one new import + a `scheduledFor`-gated `await emailVideoCallScheduled(...)` block after the invitee `notifyUser` fan-out and before `return { id: row.id }`

## Exported Signatures (for the orchestrator's live-send test)

```ts
// lib/email-templates.ts
export function escalationAmendedEmail({
  projectName,
  checklistLabel,
  stepN,
  amenderName,
  disputeUrl,
}: {
  projectName: string
  checklistLabel: string
  stepN: number | null
  amenderName: string | null
  disputeUrl: string
}): { subject: string; html: string; text: string }

export function videoCallScheduledEmail({
  title,
  scheduledFor,
  schedulerName,
  participantNames,
  joinUrl,
}: {
  title: string | null
  scheduledFor: Date
  schedulerName: string
  participantNames: string[]
  joinUrl: string
}): { subject: string; html: string; text: string }
```

Both are pure functions (no `import 'server-only'`, no DB/network access) — safe to call directly and pass the returned `{ subject, html, text }` into `sendEmail({ to, subject, html, text })` from `lib/email.ts` for a manual live-send test.

## Decisions Made
- `escapeHtml`/`escapeAttr` escape `&` first, then `<`, `>`, `"`, `'` — order matters, escaping `&` last would double-escape entities produced by the earlier passes.
- `absoluteUrl` throws on a bare relative path and on any non-http(s) scheme (closes a `javascript:`-href injection surface); already-absolute `http(s)://` URLs pass through unchanged so the three pre-built auth URLs (verify/reset/login) go through the same helper uniformly.
- Video-call-scheduled email is one Resend call carrying every invitee's address in a shared `to:` — accepted disclosure (T-eml-04) since all recipients are participants of the same call and already see each other in the body's own participant list; this also means at most one 403 per scheduled call, not N.
- Video-call email fires only when `scheduledFor` is non-null; an instant call's email would land after the call already ended, so the in-app notification and GetStream ring remain the sole channel for instant calls.
- `videoCallScheduledEmail` pins the time format to `toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })` plus a literal ` UTC` suffix — this renders server-side, so an unlabelled locale-default format would silently mean "the server's timezone," which is unknowable to the reader and differs between local dev and Netlify.
- The escalation-amended wire-in reuses the `recipientId`, `projectName`, and `amenderName` variables already resolved by quick task 260727-gow's `notifyUser` call, keeping the CI grep-gated `actions/escalation.ts` diff to exactly one import line and one `await` call.

## Deviations from Plan

None - plan executed exactly as written. Task 4's `console.warn` diagnostic comment in `lib/notify-escalation-email.ts` originally referenced the literal string `RESEND_API_KEY` inside a "never log this" comment; reworded to describe the constraint without spelling the env var name, so the plan's own `grep -rn 'RESEND_API_KEY' lib/notify-escalation-email.ts lib/notify-video-call-email.ts` verification check (zero matches) passes literally as written in `<verification>` item 7. No behavior change.

## Issues Encountered
None.

## Operator note — making mail reach real recipients

1. The Resend account currently has **ZERO verified domains**, so every send to an address other than the account owner's returns HTTP 403 and is silently dropped by design (best-effort sends swallow this and log a diagnostic; nothing breaks in-app).
2. Verify a domain at **https://resend.com/domains**.
3. Set **`EMAIL_FROM`** to an address on that verified domain (e.g. `TRT PM <no-reply@trtarredo.com>`) — the current default `onboarding@resend.dev` only works for owner-addressed test sends.
4. Set **`APP_URL`** to the public origin (e.g. `https://trt-pm.netlify.app`). Until then EVERY CTA button in EVERY email points at `http://localhost:3000` and is dead for the recipient.

This note is also mirrored as a comment block at the top of `lib/notify-escalation-email.ts`.

## Known Stubs

None.

## Threat Flags

None — both new sends were fully specified in this plan's `<threat_model>` (T-eml-01 through T-eml-06); no additional network endpoints, auth paths, or schema changes were introduced.

## User Setup Required

None for local/dev best-effort behavior (the app already degrades gracefully with zero verified Resend domains). See the Operator note above for what's required to make mail reach real, non-owner recipients in production.

## Next Phase Readiness
- Both new email sends are live at their choke points, tested, and guaranteed best-effort (never break the write they report on).
- Real end-to-end delivery to non-owner recipients is blocked purely on the operator actions listed above (Resend domain verification, `EMAIL_FROM`, `APP_URL`) — no further code changes needed for that.
- No blockers for downstream phases; `lib/email-layout.ts` and `lib/email-templates.ts` are stable, tested APIs future notification work can build on.

---
*Phase: quick-260728-eml*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 9 code files and both plan artifacts confirmed present on disk; all 4 task commits (`a67a9f4`, `7fcc0d9`, `e83621f`, `a2d1a4e`) confirmed present in `git log --oneline --all`.
