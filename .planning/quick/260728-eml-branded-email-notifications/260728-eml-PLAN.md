---
phase: quick-260728-eml
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/email-layout.ts
  - lib/email-layout.test.ts
  - lib/email-templates.ts
  - lib/email-templates.branded.test.ts
  - lib/notify-escalation-email.ts
  - lib/notify-video-call-email.ts
  - lib/notify-video-call-email.test.ts
  - actions/escalation.ts
  - lib/video-calls.ts
autonomous: true
requirements: [EML-01, EML-02, EML-03]
must_haves:
  truths:
    - "Every email TRT PM sends renders as a branded, 600px, table-based HTML message with an orange TRT header band, preheader, footer and a plaintext fallback"
    - "Emails that have an obvious next action carry a bulletproof CTA button whose href is an absolute URL built from APP_URL"
    - "User-controlled strings (project names, user names, checklist labels) are HTML-escaped before interpolation into email HTML"
    - "The officer who raised an escalation receives an email when a supervisor amends their checklist"
    - "Every invited participant of a call scheduled for later receives an email with the time, the scheduler, the participant list and a join CTA"
    - "An email send failure never fails or rolls back the amend or the call creation it reports on"
    - "The operator knows exactly what to change (verify a Resend domain, set EMAIL_FROM, set APP_URL) to make mail reach real recipients"
  artifacts:
    - path: "lib/email-layout.ts"
      provides: "escapeHtml, escapeAttr, absoluteUrl, ctaButton, renderBrandedEmail"
      exports: ["escapeHtml", "escapeAttr", "absoluteUrl", "renderBrandedEmail"]
    - path: "lib/email-templates.ts"
      provides: "7 templates, all rendered through renderBrandedEmail"
      contains: "escalationAmendedEmail"
    - path: "lib/notify-escalation-email.ts"
      provides: "best-effort emailEscalationAmended(recipientId, ...)"
    - path: "lib/notify-video-call-email.ts"
      provides: "best-effort emailVideoCallScheduled(...)"
  key_links:
    - from: "actions/escalation.ts"
      to: "lib/notify-escalation-email.ts"
      via: "call inside the existing 260728-esc recipientId block"
      pattern: "emailEscalationAmended"
    - from: "lib/video-calls.ts"
      to: "lib/notify-video-call-email.ts"
      via: "call after the invitee notifyUser fan-out, gated on scheduledFor"
      pattern: "emailVideoCallScheduled"
    - from: "lib/email-templates.ts"
      to: "lib/email-layout.ts"
      via: "import + render"
      pattern: "renderBrandedEmail"
---

<objective>
Replace TRT PM's five bare-`<p>`-fragment email templates with a single shared branded
HTML email layout (table-based, inline CSS, orange TRT header band, bulletproof CTA
button, preheader, footer, plaintext fallback), and add two new sends on top of it:
**escalation-amended** to the officer who raised the escalation, and
**video-call-scheduled** to every invited participant.

Purpose: today every email TRT PM sends looks like a raw HTML fragment with a naked
`<a>` link. Two real notification moments (a supervisor correcting an escalated
checklist, an admin scheduling a call for later) reach the user in-app only and are
missed entirely when the user is not in the app.

Output: `lib/email-layout.ts` (+ tests), refactored `lib/email-templates.ts` (+ tests),
two best-effort send modules, two one-line wire-ins at existing choke points, and an
operator note in the SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@lib/email.ts
@lib/email-templates.ts
@lib/notify-super-admins-email.ts
@lib/email-templates.completion.test.ts
@tests/lib/email.test.ts
@app/_components/trt-logo.tsx

<verified_facts>
Checked live in the repo at planning time — trust these over memory:

- The exported guard is **`isEmailServiceActive()`**, NOT `isEmailConfigured()`
  (`lib/email.ts:15`). The planning brief named it wrong.
- `sendEmail({ to, subject, html, text })` **throws** when `RESEND_API_KEY` is unset.
  Every caller must guard with `isEmailServiceActive()` first (existing pattern).
- `EMAIL_FROM` defaults to `TRT PM <onboarding@resend.dev>`; `APP_URL` defaults to
  `http://localhost:3000` (`lib/auth/email-flows.ts:12`, `actions/admin-users.ts:71`).
- **The Resend account has ZERO verified domains.** Any send to an address other than
  `uzochukwubenamara@gmail.com` returns HTTP 403. This is expected in this
  environment and MUST NOT break the app — hence best-effort everywhere.
- vitest `include` is `['tests/**/*.test.{ts,tsx}', 'lib/**/*.test.ts', 'app/**/*.test.ts']`
  with `environment: 'node'` — new tests belong in `lib/*.test.ts`.
- `lib/email-templates.ts` has **no** `import 'server-only'` and must keep it that way,
  otherwise the unit tests cannot import it. Same rule for the new `lib/email-layout.ts`.
- No packages to install: `resend` is already a dependency. Package Legitimacy Gate
  is N/A for this task (zero package-manager installs).
</verified_facts>

<existing_templates>
`lib/email-templates.ts` currently exports 5 functions, each returning
`{ subject, html, text }` where `html` is a bare `<p>` fragment:

| Function | Args | Natural CTA |
|---|---|---|
| `verificationEmail` | `{ name, verifyUrl }` | "Verify email" -> `verifyUrl` (already absolute) |
| `credentialsEmail` | `{ name, email, password, roleLabel, loginUrl }` | "Sign in to TRT PM" -> `loginUrl` (already absolute) |
| `passwordResetEmail` | `{ name, resetUrl }` | "Reset password" -> `resetUrl` (already absolute) |
| `stepTurnEmail` | `{ projectName, stepLabel }` | none today — add "Open TRT PM" -> `/` (needs `absoluteUrl`) |
| `projectClosedOutEmail` | `{ projectName, metDeadline }` | none today — add "Open TRT PM" -> `/` (needs `absoluteUrl`) |

Callers (do NOT change their call signatures): `lib/auth/email-flows.ts`,
`actions/admin-users.ts` (2 sites), `lib/notify-super-admins-email.ts` (2 sites).
</existing_templates>

<brittle_existing_assertions>
Two existing test files pin behavior the refactor must not break:

- `lib/email-templates.completion.test.ts:23` — `expect(html).not.toMatch(/PAST/)`.
  **The new layout must not emit the uppercase string `PAST` anywhere** (no
  `PASSWORD`-in-caps, no `PAST` in the footer). Case-sensitive regex.
- `tests/lib/email.test.ts:110-142` — `expect(result.html).toContain(verifyUrl)` /
  `toContain(resetUrl)`. Attribute-escaping turns `&` into `&amp;`, which would break
  this — but the real URLs are `${APP_URL}/verify-email?token=...` and
  `${APP_URL}/reset-password?token=...` with **no `&`**, and the test fixtures have no
  `&` either. Keep `escapeAttr` escaping `&`/`"`/`<`/`>` (correct behavior) and note
  the constraint in a comment. Do not "fix" the tests.
- `expect(html).toContain('Acme Villa')` — escaping must leave plain alphanumeric
  strings byte-identical.
</brittle_existing_assertions>

<escalation_choke_point>
`actions/escalation.ts` (492 lines). Quick task **260728-esc already landed** — the
tail of `amendEscalatedChecklistAction` (approx. lines 444-487) contains:

- `const recipientId = escalation.createdBy` — deliberately extracted into its own
  variable, with a comment saying a follow-up email send should reuse it. That is this task.
- A `if (recipientId && recipientId !== userId) { try { ... } catch {} }` block that
  already resolves `projectName` (from `projects`), `amenderName` (from `users`),
  `stepSuffix` (from `escalation.stepN`) and calls `notifyUser({ type: 'escalation_amended', ... })`.

**Read this block fresh at execution time** — line numbers will have drifted.

Hard constraint: `actions/escalation.ts` is CI grep-gated to contain **zero**
references to `completeGraphStep`, `advanceOrConfirmDualRole`, `projectStepCompletions`,
`workflowStepStates`. Do not add any. To keep the diff in that file to a single
statement, recipient-EMAIL resolution lives in the new `lib/notify-escalation-email.ts`,
not here — mirroring how `lib/notify-super-admins-email.ts` owns its own recipient query.
</escalation_choke_point>

<video_call_choke_point>
`lib/video-calls.ts` -> `createVideoCall({ creatorId, creatorName, title, participantUserIds, scheduledFor })`,
approx. lines 120-190. Relevant facts:

- `memberIds = [creatorId, ...participantUserIds]` (deduped); `scheduledFor` is
  `Date | null`.
- Around line 175 it already computes
  `const invitees = memberIds.filter((id) => id !== opts.creatorId)` and fans out
  `notifyUser` to exactly those. **Reuse `invitees` verbatim** — this is the documented
  answer to "do not email the scheduler a copy addressed as if they were invited by
  someone else": the creator is excluded by construction, so no self-invite is possible.
- The GetStream/chat setup above it is already wrapped in a try/catch that DELETES the
  row and re-throws on failure. The email send goes strictly AFTER that block, so a
  send only ever happens for a call that fully exists.
- `users` is already imported here (`@/db/schema`), and the file already has
  `import 'server-only'`.
- The action layer (`actions/video-calls.ts:54-64`) only allows `scheduledFor` for
  admin roles and rejects past timestamps, so a non-null `scheduledFor` is always a
  validated future date.

Gate: **only send when `scheduledFor` is non-null.** An instant call's email would land
after the call is over; the in-app notification and the GetStream ring already cover it.
</video_call_choke_point>

<routes>
CTA destinations that exist today (verified):
- `app/(app)/disputes/[projectId]/page.tsx` -> `/disputes/{projectId}` (escalation CTA)
- `app/(app)/calls/[id]/page.tsx` -> `/calls/{callId}` (join-call CTA)
- `/sign-in` (credentials email, already passed in as `loginUrl`)
</routes>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Branded email layout primitives (escape, absolute URL, CTA button, shell)</name>
  <files>lib/email-layout.ts, lib/email-layout.test.ts</files>
  <behavior>
    escapeHtml:
    - `escapeHtml('Tom & Jerry <b>')` -> `Tom &amp; Jerry &lt;b&gt;`
    - escapes `&` FIRST, then `<`, `>`, `"`, `'` (order matters — escaping `&` last
      would double-escape the entities produced by the others)
    - `escapeHtml('Acme Villa')` -> `Acme Villa` (byte-identical for plain text)
    - coerces non-strings safely; `escapeHtml(null)`/`undefined` -> `''`
    escapeAttr:
    - same entity set, used for href/attribute contexts
    absoluteUrl:
    - `absoluteUrl('/calls/abc')` with APP_URL=`https://trt.example.com` ->
      `https://trt.example.com/calls/abc`
    - joins without producing a double slash when APP_URL has a trailing slash
    - THROWS on a path that is not absolute-from-root and not already an absolute
      http(s) URL (e.g. `absoluteUrl('calls/abc')` throws) — a relative href in an
      email client resolves against the mail client's own origin and is always a bug
    - passes an already-absolute `https://...` URL through unchanged (so the three
      auth templates that receive a pre-built URL can go through the same helper)
    - rejects a non-http(s) scheme (`javascript:...`) — injection surface
    renderBrandedEmail:
    - returns `{ html, text }`
    - html contains `<!DOCTYPE`, `role="presentation"` tables, `max-width:600px`,
      the brand orange `#f97316`, the wordmark text `TRT ARREDO`, the preheader
      string, every body paragraph, and the footer
    - html contains NO `<style>` block, NO flexbox/grid, NO `<svg`, NO remote `<img`
    - when `cta` is provided the html contains an `<a` whose href is the CTA url and
      an Outlook VML fallback (`v:roundrect`) wrapped in `<!--[if mso]>`
    - when `cta` is omitted no button markup is emitted
    - html does NOT contain the uppercase string `PAST` (guards the existing
      projectClosedOutEmail assertion)
    - the returned `text` contains each paragraph's plain text and, when a cta exists,
      its label and raw url
    - interpolated paragraph content is NOT re-escaped by the layout (callers escape;
      assert `renderBrandedEmail` passes `<strong>` through so templates can bold)
  </behavior>
  <action>
    Create `lib/email-layout.ts`. NO `import 'server-only'` (it must be unit-testable
    and is imported by the pure template module).

    Export, with dense why-comments explaining the email-client constraint behind each
    decision (quick task id 260728-eml):

    1. `escapeHtml(value: unknown): string` and `escapeAttr(value: unknown): string`.
       Comment WHY: project names, user names and checklist labels are user-authored
       free text that lands inside email HTML — this is a real injection surface, and
       a stray `<` also silently eats the rest of a paragraph in most clients.
       Escape `&` first.

    2. `absoluteUrl(pathOrUrl: string): string`. Reads `process.env.APP_URL ?? 'http://localhost:3000'`
       at CALL time (not module load — tests stub the env per-case). Throws
       `Error('absoluteUrl: refusing to emit a relative email link: ...')` for a bare
       relative path, and for any non-http(s) scheme. Comment WHY: an email is read
       outside the app's origin, so a relative href has nothing to resolve against.

    3. `ctaButton({ label, url }): string` — "bulletproof button": an outer
       `role="presentation"` table with a background-coloured `<td>` (border-radius,
       padding) wrapping a white-text `<a>`, preceded by an
       `<!--[if mso]><v:roundrect ...><![endif]-->` VML fallback (Outlook's Word
       rendering engine ignores CSS padding/border-radius on anchors).

    4. `renderBrandedEmail({ preheader, heading, paragraphs, cta?, footNote?, textBody? }): { html, text }`
       Structure, all inline-styled, no `<style>` block:
       - `<!DOCTYPE html>` + `<html lang="en">` + `<meta name="viewport">` +
         `<meta name="color-scheme" content="light dark">` and
         `<meta name="supported-color-schemes" content="light dark">` (dark-mode-safe:
         tells Apple Mail/Outlook not to blind-invert).
       - Hidden preheader span: `display:none;max-height:0;overflow:hidden;mso-hide:all`
         followed by ~40 `&#8203;&nbsp;` pairs so the client does not spill body text
         into the inbox preview line.
       - Full-width `role="presentation"` wrapper table, `background-color:#f4f4f5`,
         containing a centered 600px table with `background-color:#ffffff` and an
         explicit `border:1px solid #e4e4e7` (a visible edge means the card never
         disappears when a dark-mode client inverts the page background).
       - Header band `<td>` with `background-color:#9d4300` and the wordmark rendered
         as STYLED TEXT: `TRT ARREDO` in `letter-spacing:2px;font-weight:700;color:#ffffff`
         plus a smaller `Project Management` sub-line. Comment WHY no SVG (Outlook and
         Gmail drop inline SVG entirely) and WHY no remote image (images are blocked by
         default in most clients, and APP_URL is localhost in this environment so the
         src would 404 for every recipient anyway). Use the two-stop brand ramp as a
         `background-image:linear-gradient(135deg,#f97316,#9d4300)` layered ON TOP of the
         solid `background-color` so gradient-unaware clients still get brand orange.
       - Body `<td>` padding 32px, `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`,
         `color:#18181b`, `font-size:16px;line-height:1.6`. Heading as `<h1>` at 20px.
         Each entry of `paragraphs` becomes a `<p>` (callers pass pre-escaped HTML —
         document this contract loudly in the JSDoc).
       - Optional CTA row via `ctaButton`.
       - Optional `footNote` in muted `#52525b` at 14px.
       - Footer `<td>`: "You are receiving this because you have a TRT PM account."
         plus "TRT Arredo Project Management". Muted `#71717a` on `#fafafa`.
       - `text`: `textBody` if supplied, else derived from heading + paragraphs with
         tags stripped and entities un-escaped, plus `\n\n{label}: {url}` for the CTA
         and a footer line. EVERY template gets a plaintext fallback this way.

    Then write `lib/email-layout.test.ts` covering the behaviors above. Follow
    `lib/email-templates.completion.test.ts` conventions (`describe`/`it`, named imports
    from `@/lib/...`, `vitest`). For APP_URL cases use `vi.stubEnv('APP_URL', ...)` with
    `vi.unstubAllEnvs()` in `afterEach`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run lib/email-layout.test.ts</automated>
  </verify>
  <done>
    `lib/email-layout.test.ts` passes. `absoluteUrl('calls/x')` throws.
    `grep -c '<svg\|<style' lib/email-layout.ts` returns 0 for both patterns.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Refactor the 5 existing templates onto the branded layout</name>
  <files>lib/email-templates.ts, lib/email-templates.branded.test.ts</files>
  <behavior>
    - All 5 existing templates return html that goes through `renderBrandedEmail`:
      contains `<!DOCTYPE`, `TRT ARREDO`, `max-width:600px`
    - `verificationEmail` / `credentialsEmail` / `passwordResetEmail` each emit a CTA
      whose href is the URL they were passed
    - `stepTurnEmail` and `projectClosedOutEmail` each emit a CTA pointing at an
      absolute `APP_URL`-derived link
    - `stepTurnEmail({ projectName: '<img src=x onerror=1>', stepLabel: 'A & B' })`
      produces html containing NO raw `<img` and containing `&amp;` — proof the escape
      is wired into the templates, not just available
    - every template's `text` is non-empty and contains its key facts
    - subjects are UNCHANGED from today (byte-for-byte)
  </behavior>
  <action>
    Refactor `lib/email-templates.ts` so each of the 5 existing functions builds its
    body through `renderBrandedEmail` from `lib/email-layout`. Keep every exported
    function's NAME, ARGS and SUBJECT exactly as they are — `lib/auth/email-flows.ts`,
    `actions/admin-users.ts` and `lib/notify-super-admins-email.ts` call these and must
    not need a change.

    Per template:
    - `verificationEmail` — heading "Confirm your email address", CTA
      `{ label: 'Verify email', url: absoluteUrl(verifyUrl) }`, footNote about ignoring
      it if they did not sign up. Escape `name`.
    - `credentialsEmail` — heading "Your TRT PM account is ready", paragraphs with the
      escaped `roleLabel`/`email`/`password` in a bordered credentials block, CTA
      `{ label: 'Sign in to TRT PM', url: absoluteUrl(loginUrl) }`, footNote urging a
      password change. Add a why-comment: the temporary password stays in the body
      because that is the only channel the recipient has — do not "improve" it into a
      link without a token flow to back it.
    - `passwordResetEmail` — heading "Reset your password", CTA
      `{ label: 'Reset password', url: absoluteUrl(resetUrl) }`, footNote "This link
      expires in 1 hour."
    - `stepTurnEmail` — heading "It's your turn", body naming the escaped `stepLabel`
      and `projectName`, CTA `{ label: 'Open TRT PM', url: absoluteUrl('/') }`.
    - `projectClosedOutEmail` — heading "Project closed out", keep the three
      `metDeadline` sentences VERBATIM (existing tests match `/PAST/`,
      `/within its final step deadline/i`, `/could not be determined/i`), CTA
      `{ label: 'Open TRT PM', url: absoluteUrl('/') }`.

    Wrap the pre-built auth URLs in `absoluteUrl()` too — they are already absolute, so
    it is a pass-through, but it makes the "no relative link ever ships" rule uniform
    and catches a future caller that forgets the origin.

    Write `lib/email-templates.branded.test.ts` for the behaviors above. Do NOT edit
    `lib/email-templates.completion.test.ts` or `tests/lib/email.test.ts` — they are the
    regression net proving the refactor preserved semantics.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run lib/email-templates.branded.test.ts lib/email-templates.completion.test.ts tests/lib/email.test.ts</automated>
  </verify>
  <done>
    All three test files green, including the two pre-existing ones unmodified.
    `git diff --stat lib/email-templates.completion.test.ts tests/lib/email.test.ts`
    shows zero changes.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: escalationAmendedEmail + videoCallScheduledEmail templates</name>
  <files>lib/email-templates.ts, lib/email-templates.branded.test.ts</files>
  <behavior>
    escalationAmendedEmail({ projectName, checklistLabel, stepN, amenderName, disputeUrl }):
    - subject contains the checklist label and the project name and reads as an update
      to an escalation the recipient raised
    - html contains project name, checklist label, `Step {n}` when stepN is non-null and
      no step line when it is null, and the amender's name
    - falls back to "a supervisor" when `amenderName` is null
    - CTA label mentions the escalation/dispute and href === the passed disputeUrl
    - `text` contains the project name and the raw url
    - a project name of `Villa & Sons <script>` appears escaped, with no raw `<script`

    videoCallScheduledEmail({ title, scheduledFor, schedulerName, participantNames, joinUrl }):
    - subject names the call and reads as a scheduled invitation
    - html contains the formatted date/time AND an explicit timezone label
    - html lists every participant name, escaped
    - falls back to "Video call" when `title` is null/blank
    - CTA label is a join label and href === joinUrl
    - `text` contains the time string and the raw url
  </behavior>
  <action>
    Append two templates to `lib/email-templates.ts`, both built on `renderBrandedEmail`,
    both escaping every interpolated value, both returning `{ subject, html, text }`.

    `escalationAmendedEmail` — heading "Your escalated checklist was updated". Body:
    who amended it, which checklist, which project, which step (omit the step sentence
    entirely when `stepN` is null — readiness-form escalations carry no checklist step).
    CTA `{ label: 'View the escalation', url: absoluteUrl(disputeUrl) }`.
    Why-comment: until 260728-esc this moment was invisible to the officer who filed the
    escalation; the email is the out-of-app half of that same notification.

    `videoCallScheduledEmail` — heading "You're invited to a scheduled call".
    `scheduledFor` is a `Date`. Format with
    `toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })`
    and append the literal ` UTC`. Why-comment, prominently: this renders on the SERVER,
    so a locale-default format would silently mean "the server's timezone", which is
    unknowable to the reader and differs between local dev and Netlify. Pinning to UTC
    and stating it makes the string unambiguous for every recipient. (`lib/video-calls.ts`
    already formats its in-app notification title with an unlabelled local
    `toLocaleString` — do NOT copy that; leave it alone, it is out of scope.)
    Body also lists the scheduler and the participant names (comma-joined, escaped).
    CTA `{ label: 'Join the call', url: absoluteUrl(joinUrl) }`.
    footNote: "The call room opens at the scheduled time."

    Extend `lib/email-templates.branded.test.ts` with the behaviors above.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run lib/email-templates.branded.test.ts</automated>
  </verify>
  <done>
    Both new templates exported, tested for subject + CTA href + plaintext + escaping,
    and the timezone label is asserted present.
  </done>
</task>

<task type="auto">
  <name>Task 4: Wire both sends best-effort at their choke points + operator note</name>
  <files>lib/notify-escalation-email.ts, lib/notify-video-call-email.ts, lib/notify-video-call-email.test.ts, actions/escalation.ts, lib/video-calls.ts</files>
  <action>
    RE-READ `actions/escalation.ts` and `lib/video-calls.ts` before editing — quick task
    260728-esc has already landed in escalation.ts and other tasks are in flight.

    **A. `lib/notify-escalation-email.ts`** (new). `import 'server-only'`. Mirror
    `lib/notify-super-admins-email.ts` exactly in shape:

      export async function emailEscalationAmended(input: {
        recipientId: string
        projectId: string
        projectName: string
        checklistLabel: string
        stepN: number | null
        amenderName: string | null
      }): Promise<void>

    Body: `if (!isEmailServiceActive()) return`, then inside one try/catch — select the
    recipient's `email` from `users` by id, return if absent, build
    `escalationAmendedEmail({ ..., disputeUrl: absoluteUrl('/disputes/' + projectId) })`,
    `await sendEmail(...)`. Catch swallows, but log ONE non-secret diagnostic line:
    `console.warn('[260728-eml] escalation-amended email not delivered:', err instanceof Error ? err.message : 'unknown')`.
    Why-comment: with zero verified Resend domains every non-owner recipient 403s in
    this environment, and a silent swallow would make that look like a code bug — the
    message is Resend's own text and contains no key. NEVER log the API key, the full
    error object, or `process.env`.

    **B. Wire into `actions/escalation.ts`.** Inside the EXISTING
    `if (recipientId && recipientId !== userId) { try { ... } catch {} }` block in
    `amendEscalatedChecklistAction`, immediately AFTER the `await notifyUser({...})`
    call, add ONE await:

      await emailEscalationAmended({
        recipientId, projectId: escalation.projectId, projectName,
        checklistLabel: escalation.checklistLabel, stepN: escalation.stepN,
        amenderName,
      })

    reusing the `recipientId`, `projectName`, `amenderName` variables already resolved
    there (that is exactly what 260728-esc's comment reserved them for). Add the import
    at the top. Add NOTHING else to this file — the CI grep gate requires it stays free
    of `completeGraphStep`, `advanceOrConfirmDualRole`, `projectStepCompletions`,
    `workflowStepStates`. The helper is internally best-effort, and the surrounding
    try/catch is a second net, so the checklist write can never be reported as failed
    because of email.

    **C. `lib/notify-video-call-email.ts`** (new). `import 'server-only'`.

      export async function emailVideoCallScheduled(input: {
        callId: string
        title: string | null
        scheduledFor: Date
        schedulerName: string
        inviteeIds: string[]
      }): Promise<void>

    Guard on `isEmailServiceActive()` and on `inviteeIds.length === 0`. In one try/catch:
    one `db.select({ id, name, email }).from(users).where(inArray(users.id, ids))` for
    the invitees, build `participantNames` from those rows plus the scheduler, build
    `videoCallScheduledEmail({ ..., joinUrl: absoluteUrl('/calls/' + callId) })`, and
    `sendEmail({ to: <all invitee emails> , ... })` as a SINGLE send — one Resend call,
    one 403 at worst, not N. Why-comment: the recipients are all internal colleagues who
    are on the same call and already see each other in the participant list, so a shared
    `to:` leaks nothing they do not already have. Same non-secret `console.warn` on failure.

    **D. Wire into `lib/video-calls.ts`.** In `createVideoCall`, AFTER the existing
    `await Promise.all(invitees.map(...notifyUser...))` and BEFORE `return { id: row.id }`:

      if (scheduledFor) {
        await emailVideoCallScheduled({
          callId: row.id, title, scheduledFor,
          schedulerName: opts.creatorName, inviteeIds: invitees,
        })
      }

    Why-comment covering both decisions: (1) gated on `scheduledFor` because an instant
    call's email would arrive after the call ended — the in-app notification and the
    GetStream ring already cover that case; (2) `invitees` already excludes the creator,
    so the scheduler never receives a copy addressed as if someone invited them.
    Placement is after the GetStream try/catch that deletes-and-rethrows, so an email
    only ever describes a call that fully exists.

    **E. `lib/notify-video-call-email.test.ts`.** Follow
    `lib/notify-super-admins-email.test.ts` conventions exactly: `vi.hoisted` mocks for
    the db select chain, `vi.mock('@/lib/email', () => ({ sendEmail: sendEmailMock, isEmailServiceActive: isActiveMock }))`,
    and `vi.mock('server-only', () => ({}))` if that file needs it. Cover:
    (1) no send when the service is inactive; (2) no send when `inviteeIds` is empty;
    (3) one single `sendEmail` call carrying every invitee email; (4) **never throws
    when `sendEmail` rejects** — the critical best-effort assertion.

    **F. Operator note.** In the SUMMARY, a top-level `## Operator note — making mail
    reach real recipients` section stating verbatim:
      1. The Resend account currently has ZERO verified domains, so every send to an
         address other than the account owner's returns HTTP 403 and is silently
         dropped by design.
      2. Verify a domain at https://resend.com/domains.
      3. Set `EMAIL_FROM` to an address on that verified domain (e.g.
         `TRT PM <no-reply@trtarredo.com>`) — the current default
         `onboarding@resend.dev` only works for owner-addressed test sends.
      4. Set `APP_URL` to the public origin (e.g. `https://trt-pm.netlify.app`).
         Until then EVERY CTA button in EVERY email points at `http://localhost:3000`
         and is dead for the recipient.
    Also mirror it as a comment block at the top of `lib/notify-escalation-email.ts`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npx vitest run && grep -c -E 'completeGraphStep|advanceOrConfirmDualRole|projectStepCompletions|workflowStepStates' actions/escalation.ts; test $? -eq 1 && echo GREP_GATE_OK</automated>
  </verify>
  <done>
    `npx tsc --noEmit` clean, `npm run lint` clean, full `npx vitest run` green with NO
    regressions vs the pre-task baseline (baseline is ~360 and rising because another
    task is in flight — record before/after counts, assert zero failures and a net
    increase, not an exact total). Grep gate on `actions/escalation.ts` still returns
    zero matches. Operator note present in the SUMMARY.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DB free-text -> email HTML | Project names, user names and checklist labels are user-authored and land inside an HTML document rendered by a third-party mail client |
| App -> Resend API | Secret-bearing outbound call whose failures are attacker-observable via timing/logs |
| Email recipient list | Addresses resolved from `users`; a wrong resolution leaks project data to the wrong person |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-eml-01 | Tampering | `lib/email-templates.ts` interpolation | mitigate | `escapeHtml`/`escapeAttr` on every interpolated value; unit-tested with an `<img src=x onerror=1>` project name in Task 2 and a `<script>` name in Task 3 |
| T-eml-02 | Elevation of Privilege | `absoluteUrl` | mitigate | Reject non-http(s) schemes so a `javascript:` value can never become a CTA href (Task 1) |
| T-eml-03 | Information Disclosure | `console.warn` on send failure | mitigate | Log only `err.message`; never the error object, `process.env`, or `RESEND_API_KEY`. Explicit rule in Task 4 |
| T-eml-04 | Information Disclosure | shared `to:` on the call invite | accept | All recipients are participants of the same call and already see each other in the body's participant list; no new exposure |
| T-eml-05 | Denial of Service | email send inside a write path | mitigate | Every send is `isEmailServiceActive()`-guarded and try/catch-wrapped; `lib/notify-video-call-email.test.ts` asserts it never throws when `sendEmail` rejects |
| T-eml-06 | Repudiation | escalation-amended recipient resolution | mitigate | Recipient is `escalation.createdBy` read fresh from the DB, never client-supplied; self-notify is skipped by the existing `recipientId !== userId` guard |
| T-eml-SC | Tampering | npm/pip/cargo installs | N/A | Zero package installs in this task — `resend` is already a dependency. No legitimacy checkpoint required |
</threat_model>

<verification>
1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npx vitest run` — zero failures; total count >= the pre-task baseline (~360, rising).
4. `git diff --stat lib/email-templates.completion.test.ts tests/lib/email.test.ts` — empty
   (the pre-existing regression net was not weakened to make the refactor pass).
5. `grep -E 'completeGraphStep|advanceOrConfirmDualRole|projectStepCompletions|workflowStepStates' actions/escalation.ts`
   — zero matches (260728-esc's grep gate intact).
6. `grep -n '<svg\|<style\|src="http' lib/email-layout.ts` — zero matches.
7. `grep -rn 'RESEND_API_KEY' lib/notify-escalation-email.ts lib/notify-video-call-email.ts`
   — zero matches (no key touched in the new modules).
</verification>

<success_criteria>
- All 7 templates render through one shared branded 600px table layout with an orange
  TRT header band, preheader, footer and plaintext fallback.
- CTA buttons are table-cell based with a VML/mso fallback and always carry an absolute
  `APP_URL`-derived href; `absoluteUrl` throws on a relative path or a non-http(s) scheme.
- Every interpolated user-controlled value is HTML-escaped, proven by tests using
  markup-bearing fixtures.
- Amending an escalated checklist emails the officer who raised it, at the same choke
  point as the in-app notification, reusing its resolved recipient.
- Creating a call with `scheduledFor` emails every invitee (never the scheduler) with
  the time, an explicit `UTC` label, the participant list and a join CTA.
- No email failure can fail or roll back an amend or a call creation; failures log one
  non-secret diagnostic.
- The SUMMARY carries the operator note (verify a Resend domain, set `EMAIL_FROM`, set
  `APP_URL`).
</success_criteria>

<output>
Create `.planning/quick/260728-eml-branded-email-notifications/260728-eml-SUMMARY.md` when done,
including the `## Operator note — making mail reach real recipients` section.
</output>
