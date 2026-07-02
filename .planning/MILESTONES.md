# Milestones

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
