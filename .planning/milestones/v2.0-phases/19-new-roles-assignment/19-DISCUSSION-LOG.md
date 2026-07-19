# Phase 19: New Roles & Assignment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 19-New Roles & Assignment
**Areas discussed:** New role dashboards, Assignment notifications, Assignment picker UX, Reassignment / correction

---

## New role dashboards

| Option | Description | Selected |
|--------|-------------|----------|
| Match Phase 15 exactly | Nav + landing page with honest "steps not yet configured" blurb, same as design/production today | ✓ |
| Preview of what's coming | Same shell, but blurb names the actual upcoming Phase 22 steps | |
| You decide | Let Claude pick | |

**User's choice:** Match Phase 15 exactly

| Option | Description | Selected |
|--------|-------------|----------|
| "Factory Ops" / "Factory Manager" | Routes /factory-ops and /factory-manager | ✓ |
| "Ops Factory" / "Factory Manager" | Routes /ops-factory and /factory-manager, mirrors enum value literally | |
| You decide | Let Claude pick | |

**User's choice:** "Factory Ops" / "Factory Manager"

---

## Assignment notifications

| Option | Description | Selected |
|--------|-------------|----------|
| In-app only | Reuse existing notifications table + bell/panel + poll pattern, consistent with v1.1 alerts decision | ✓ |
| In-app + email | Also send a Resend email | |
| You decide | Let Claude pick | |

**User's choice:** In-app only

| Option | Description | Selected |
|--------|-------------|----------|
| Project + step name | e.g. "You've been assigned to Design Stage on Usuma", links to that step | ✓ |
| Generic + link only | e.g. "New assignment" with a link to dashboard | |
| You decide | Let Claude pick | |

**User's choice:** Project + step name

---

## Assignment picker UX

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is | Dropdown works, role rosters are small, polish premature until Phase 21/22 wire a real step live | |
| Upgrade now | Add search/autocomplete and workload visibility | ✓ |
| You decide | Let Claude judge | |

**User's choice:** Upgrade now

**Follow-up — what to include (multiSelect):**

| Option | Description | Selected |
|--------|-------------|----------|
| Search/filter by name | Type-ahead filter over candidate list | ✓ |
| Workload indicator | Active-project count per candidate | ✓ |
| Candidate avatar/initials | Initials badge, reuse existing pattern if present | ✓ |

**User's choice:** All three
**Notes:** Confirmed an initials/avatar pattern already exists in `app/_components/mobile-sidebar.tsx` — reuse rather than invent new.

---

## Reassignment / correction

| Option | Description | Selected |
|--------|-------------|----------|
| Allow change until step completes | Actor can re-run assign to swap assignee any time before completion; new notification to new assignee only | ✓ |
| Locked after first pick | Only super admin can change, via override — mirrors Phase 18 Configurator reorder's bounded-scope philosophy | |
| You decide | Let Claude pick | |

**User's choice:** Allow change until step completes

---

## Claude's Discretion

None — every gray area was explicitly decided by the user.

## Deferred Ideas

None — discussion stayed within phase scope.
