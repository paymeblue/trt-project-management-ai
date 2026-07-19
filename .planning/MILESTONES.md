# Milestones

## v2.0 Configurable Production Workflow Engine (Shipped: 2026-07-19)

**Phases completed:** roadmap phases 16-22 + inserted 20.1 (24 formally-planned plans, 55 tasks) plus ~30 tracked quick tasks delivered ad hoc

**Key accomplishments:**

- The hardcoded 11-step `WORKFLOW_STEPS` array is fully retired: workflow steps, edges, and per-step state live in Postgres (7 fulfillment kinds incl. two-party approval, assignment, dual-role confirmation), with byte-identical migration of the legacy tail proven by a repeatable parity harness (`npm run verify:live-workflow`).
- Self-service, PIN-gated Workflow Configurator: super admins add/edit/reorder steps, roles, exact-position gates, assignee pools, dual roles, and receiver roles without code changes — the live graph grew 11 → 21 steps entirely through data.
- The full TRT production flow is live as data: Customer Care intake → payment/timeline gating → two-moment design pipeline → Confirmation → correction/internal approval → two-party Send for Production → CPO review → Production Process → Factory Manager QC → readiness/delivery/installation → Sign Off (STG-01..14; STG-04 cut by design).
- Roles & positions system: 11 permission roles each with a dashboard shell, plus a rename-safe data-driven `positions` table powering exact-position step gates (Operations Admin, CPO, Head of Design, …).
- Per-tab independent auth sessions — multiple users in one browser, hard-refresh-safe (pre-paint restore bounce + bound-token Server Actions with compile-time enforcement), user-confirmed working after a hard-fought debugging saga.
- Position-scoped notification engine (step-turn alerts to exactly the responsible officer; the all-super-admin step broadcast is gone), strictly per-step deadlines, per-checklist escalation to fixed superiors, and a super-admin audit View with full photo/PDF evidence.

**Known deferred items at close:** 37 (see STATE.md Deferred Items — notably Phase 18.1 composed-block renderer is Partial; 34 are historical quick-task bookkeeping-format gaps, all recorded complete).

---

## v1.1 — Super-admin governance & accountability (2026-07-02)

**Goal:** Give super admins central control and escalation power, and make every
actor accountable via per-step deadlines and a final sign-off.

**Shipped (REQ-G01…G10), phases 11–14 on branch `milestone/v1.1-governance`:**

| Phase | Delivered |
|-------|-----------|
| 11 Permissions & Quick Wins | Checklist authoring → super_admin only (G01); distinct per-project analytics colours (G02); Issue Log mapped to a project — required `project_id` + selector/filter (G03) |
| 12 Workflow Extensions | super_admin Sign-Off step 11 after Close Out, completion boundary → step 12 with data migration (G04); per-step deadlines set by Operations at creation, surfaced in board/header/my-work (G05) |
| 13 Alerts Foundation | `notifications` table + fan-out + `/api/notifications` + polled header bell/panel (G06); `paused` project status suspending the gate (G07) |
| 14 Escalation Flows | Pause/flag → notify all super admins + pause + super-admin resume (G08); higher-authority approval to skip a checklist step via `/admin/approvals`, audited advance (G09); escalate issues to all super admins + per-project dispute thread `/disputes/[id]` (G10) |

**New tables:** `project_step_deadlines`, `notifications`, `step_bypass_requests`,
`project_disputes` (+ `issues.project_id` NOT NULL, `issues.escalated_at`,
`project_status` gains `paused`). All pushed via `drizzle-kit push`.

**Decisions:** in-app alerts only (no email) · checklists super_admin-only ·
sign-off by super_admin · phase numbering continued 11–14.

**Deferred:** #7 multi-department extensibility (future Design/Production roles).

**Verification:** full `tsc` + `eslint` clean; production `next build` succeeds;
key flows (checklist lock, notifications, paused, pause/flag→notify, bypass
approve-advances, dispute/escalate) verified via live server + SSR/DB checks.

**Not yet merged to `main`.**
