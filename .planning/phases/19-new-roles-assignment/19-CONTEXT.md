# Phase 19: New Roles & Assignment - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Two new roles — `ops_factory` and `factory_manager` — get dashboard shells following the existing pattern (customer_care/design/production). The generic `assignment` fulfillment kind, already partially built in Phase 16 (schema `targetRole`, a minimal picker component `AssignmentStep`, `assignUserAction`), is completed: real candidate picker UX, in-app notification to the assignee, and reassignment support. No new workflow steps are added — Phase 21/22 will be the first to actually wire an `assignment`-kind step into the live graph; this phase makes the mechanic itself production-ready.

</domain>

<decisions>
## Implementation Decisions

### New role dashboards (ROLE-01)
- **D-01:** ops_factory and factory_manager dashboards match the Phase 15 pattern exactly — nav entry + landing page with an honest "steps not yet configured for your role yet" blurb, same as design/production today. No preview of Phase 22's upcoming steps.
- **D-02:** Display labels: "Factory Ops" and "Factory Manager". Routes: `/factory-ops` and `/factory-manager`. Add both to `roleEnum` in `db/schema.ts`, and to `userRoleLabel`/`roleDashboard` in `lib/workflow.ts` (the same centralization point used for design/production/customer_care).

### Assignment notifications (ROLE-02)
- **D-03:** In-app only, no email — consistent with the standing v1.1 decision that alerts stay in-app (no Resend plumbing). Reuse the existing `notifications` table (already per-recipient, not actually super-admin-exclusive by schema) and its bell/panel/poll delivery pattern.
- **D-04:** Notification content names the project and step (e.g. "You've been assigned to Design Stage on Usuma"), linking directly to that step — not a generic "new assignment, check your dashboard" message.
- **D-05:** `assignUserAction` fires the notification on every successful assign call, including reassignment (see D-07) — the newly assigned user gets notified each time.

### Assignment picker UX (ROLE-02)
- **D-06:** Upgrade the current plain `<select>` (`AssignmentStep`, built as an intentionally minimal renderer in Phase 16) to include all of:
  - Search/filter by name over the candidate list
  - A workload indicator per candidate — count of their active (not-yet-delivered) projects
  - Candidate avatar/initials badge — reuse the existing initials-avatar pattern already present in `app/_components/mobile-sidebar.tsx` rather than inventing a new one

### Reassignment / correction (ROLE-02)
- **D-07:** The actor can change the assignment any time before the step is marked complete — re-running the assign action swaps the assignee. The newly assigned user gets notified (D-05); the previously assigned (now removed) user does NOT get a separate "you were un-assigned" notification, to avoid confusing noise.

### Claude's Discretion
None — every gray area presented was explicitly decided by the user (no "you decide" selections).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs or ADRs for this phase — requirements fully captured in `.planning/REQUIREMENTS.md` (ROLE-01, ROLE-02, ROLE-03) and the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `roleEnum` in `db/schema.ts` (line 15): currently `['factory_pm', 'site_pm', 'super_admin', 'operations', 'design', 'production', 'customer_care']` — needs `ops_factory` and `factory_manager` appended.
- `app/(app)/customer-care/dashboard/page.tsx` + `app/(app)/customer-care/projects/new/page.tsx`: most recent example of the Phase 15 dashboard-shell pattern (added in commit `f72573d`, unpushed) — closest template to copy for the two new roles.
- `userRoleLabel` / `roleDashboard` in `lib/workflow.ts`: single centralization point for role → label and role → dashboard-route mapping. New roles register here.
- `app/_components/sidebar-nav.tsx`: where nav entries per role are added.
- `notifications` table (`db/schema.ts` ~line 424) + `lib/notifications.ts` + `actions/notifications.ts`: per-recipient (`recipientId`), `type`/`title`/`body`/`projectId`/`actorId`/`readAt` — already generic despite being used only for super-admin alerts so far. The bell/panel/4s-poll UI already exists and reads this table.
- `app/_components/mobile-sidebar.tsx`: existing initials/avatar rendering pattern to reuse for the picker's candidate avatars.
- `db/schema.ts` line 94: `targetRole` column on `workflow_step_definitions`, set only when `fulfillmentKind = 'assignment'` — already there from Phase 16.

### Established Patterns
- Dashboard shells (Phase 15 precedent): nav + landing page, additive — a role can exist and log in before it owns any live workflow steps.
- Server-side candidate filtering: `app/(app)/workflow/step/page.tsx` (`case 'assignment':`) already queries `users` filtered by `step.targetRole` and passes `candidates` as a prop into `AssignmentStep` — the picker upgrade (D-06) extends this existing data flow, doesn't replace it.
- `assignUserAction` in `actions/workflow-graph.ts` (~line 136): calls `authorizeStep` then `assignUser`, then `revalidateBoards()`. Notification firing (D-03/D-05) slots in here, mirroring how other actions in `actions/projects.ts`/`actions/issues.ts` already call into `lib/notifications.ts`.

### Integration Points
- `app/_components/workflow-kinds/assignment-step.tsx`: the client component to upgrade per D-06 (search, workload count, avatars) — currently a bare `<select>` + Assign/Complete buttons.
- `lib/workflow.ts`: role label/dashboard-route registration point for the two new roles.
- `app/_components/sidebar-nav.tsx`, `app/(app)/about/page.tsx` (ROLES organogram), `app/_components/trt-flow-diagram.tsx` (`ROLE_COLOR` map): per the STATE.md "Pending Todos" note, every new role needs an entry here too or the About page/flow diagram silently renders incomplete.

</code_context>

<specifics>
## Specific Ideas

No specific visual/copy references given beyond what's captured in the decisions above — user deferred exact wording/styling to implementation, keeping only the structural choices (labels, routes, notification content shape, picker feature set) locked.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Workload-aware picker and avatar reuse were raised as part of the in-scope Assignment picker UX area, not deferred.)

</deferred>

---

*Phase: 19-New Roles & Assignment*
*Context gathered: 2026-07-12*
