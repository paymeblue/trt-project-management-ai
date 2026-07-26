# Quick Task 260726-dw4: Schedule Call button/modal + 1-hour reminders - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Task Boundary

Two follow-ups to the scheduling feature added in quick task 260724-alz:
1. Make scheduling discoverable via a dedicated "Schedule Call" button + modal (replacing the buried inline checkbox).
2. Add a reminder notification ~1 hour before a scheduled call's start time.

</domain>

<decisions>
## Implementation Decisions

### Reminder trigger mechanism
- User chose: **Netlify Scheduled Function**, running every 5 minutes.
- This repo has NO `netlify.toml` and NO Netlify functions directory today — both must be created from scratch. No prior convention to follow in this repo; this is genuinely new infrastructure, hence research is warranted (unlike quick task 260724-alz which only extended existing patterns).
- The scheduled function should NOT duplicate the DB/GetStream/notification logic — it should be a thin trigger that calls into the existing Next.js app (an internal, secret-protected API route) so there's one source of truth for the reminder logic, consistent with how this app already centralizes GetStream/DB access in `lib/`.

### Schedule Call entry point
- A separate, always-visible "Schedule Call" button (admin-only) next to "Start a call" on `/calls` — NOT a checkbox buried inside the "Start a call" form (that's the discoverability bug being fixed).
- Opens a **modal** (not an inline expand) containing title, participant picker (reuse `new-call-form.tsx`'s picker logic/UI), and a date+time picker.
- "Clock UI" is satisfied by native `<input type="date">` + `<input type="time">` — no new date-picker dependency needed; the native time input already renders a clock-style picker on most platforms/browsers.
- The existing inline "Schedule for later" checkbox in `new-call-form.tsx` is REMOVED entirely — `new-call-form.tsx` goes back to being a pure "start now" flow. There is exactly one way to schedule a call going forward: the new dedicated button/modal.

### Reminder notification scope
- Reuses the exact same invitee set as the original "scheduled" notification (participants minus the creator) — not a new/different audience.
- A NEW, distinct notification (the original "you were invited to a scheduled call" notification sent at creation time is untouched/unchanged) — this is an additional, later reminder, not a replacement.
- Idempotent: each call must be reminded at most once. A `reminderSentAt` column gates this — once set, that call is never reminded again even if the cron function runs many times while the call is still inside the "next hour" window.

### Claude's Discretion
- Exact Netlify scheduled-function file path/extension and manifest format — planner/researcher should confirm the CURRENT correct convention (Netlify's scheduled-functions docs/format may have changed since training data) rather than guessing.
- How the scheduled function determines the deployed site's own base URL to call the internal route (Netlify-provided env var vs. an explicit configured URL) — verify current Netlify behavior rather than assuming.
- Whether to factor out shared picker JSX between `new-call-form.tsx` and the new schedule-call component, or duplicate minimally — whichever is cleaner given the actual amount of shared logic.
- Exact notification title/body wording for the reminder.

</decisions>

<specifics>
## Specific Ideas

No mockups. Modal should match this codebase's existing visual conventions (Tailwind utility classes, rounded-xl cards, `border-primary/30 bg-primary/5` accents already used in `new-call-form.tsx`).

</specifics>

<canonical_refs>
## Canonical References

`lib/video-calls.ts`'s `createVideoCall` and `actions/video-calls.ts`'s `createVideoCallAction` (both already handle `scheduledFor`, unchanged by this task) are canonical for the existing scheduling backend. `lib/notifications.ts`'s `notifyUser` is canonical for how to send a notification. This task's genuinely new territory is Netlify Scheduled Functions — a dedicated research pass is warranted here, unlike the prior quick task.

</canonical_refs>
