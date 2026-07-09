---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Configurable Production Workflow Engine
status: executing
stopped_at: Completed 16-03-PLAN.md (workflow graph write engine + server actions)
last_updated: "2026-07-09T11:28:33.349Z"
last_activity: 2026-07-09
progress:
  total_phases: 21
  completed_phases: 1
  total_plans: 10
  completed_plans: 8
  percent: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with role-scoped visibility and read-only Super Admin oversight.
**Current focus:** Phase 16 — Workflow Engine Core

## Current Position

Phase: 16 (Workflow Engine Core) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-07-09

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

| Phase 16 P01 | 25min | 2 tasks | 1 files |
| Phase 16 P02 | 15min | 3 tasks | 4 files |
| Phase 16 P03 | 12min | 2 tasks | 2 files |

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Self-serve signup with role picker (Factory/Site PM only); Super Admin seeded by script
- Super Admin is read-only on operational data
- Template-driven checklist schema (definition → template items → responses) — pending PDFs become data, not code
- Next 16: use `proxy.ts` (not `middleware.ts`); `await` params/cookies/headers
- AUTH PIVOT (2026-06-19): DROPPED Neon Auth/`@neondatabase/auth` → using NextAuth/Auth.js v5 (`next-auth@5.0.0-beta.31`, installed) with Credentials provider + JWT + `role` claim + `@auth/drizzle-adapter` + `bcryptjs`. Real exports verified from node_modules. Phase 1 auth plans (01-02, 01-04) must be re-planned around NextAuth.
- AI PIVOT (2026-06-19): Dave Aredo uses base `@anthropic-ai/sdk` env-configured (Ollama dev ↔ Claude prod via ANTHROPIC_BASE_URL/LLM_MODEL_NAME, already in .env.local) + GSAP fullscreen. Dropped Claude Agent SDK.
- SCOPE CHANGE (2026-06-19): added Resend email, a collaborative Processes diagram editor (React Flow `@xyflow/react` 12.11.0 + Mermaid 11.15.0), and real-time dashboard chat
- Supabase Realtime (`@supabase/supabase-js` 2.108.2) is TRANSPORT ONLY — Neon stays single source of truth; no app data in Supabase
- Collaborative diagram editing = shared, last-write-wins per element for v1 (not CRDT)
- Phase 1 schema now lays ALL tables (incl. conversations, messages, process_diagrams, ai_usage) up front to avoid migration churn; EMAIL-01/02 (Resend) added to Phase 1
- MILESTONE v1.1 (2026-07-02): super-admin governance & accountability. Locked: (1) checklist authoring → super_admin ONLY (tighten `canEditChecklist`/gating in lib/workflow.ts, actions/checklists.ts, checklists/[slug]/page.tsx, checklist-editor.tsx); (2) super-admin alerts IN-APP ONLY (notifications table + panel + header bell + 4s poll like my-work-provider; no Resend); (3) new Sign-Off step 11 by super_admin after Close Out — mind `isProjectComplete` boundary (delivered rows sit at currentStep 11 today); (4) per-step deadlines by Operations at creation (new schema, replace single projects.deliveryDate reads); new `paused` project status. #7 (Design/Production departments) deferred.
- MILESTONE v1.1 EXTENSION (Phase 15, 2026-07-09): #7 delivered — `design` and `production` added to `roleEnum`, each with a dashboard shell (nav + landing page) following the existing role pattern; `userRoleLabel`/`roleDashboard` centralized in `lib/workflow.ts`; departments own no workflow steps yet (additive later, now becoming the basis for v2.0's `design`/`ops_factory`/etc. usage).
- MILESTONE v2.0 (2026-07-09): Configurable Production Workflow Engine. Locked: (1) `WORKFLOW_STEPS` hardcoded array replaced by a DB-driven step graph read by `lib/workflow.ts`; (2) new fulfillment kinds beyond creation/checklist/readiness/ack — yes/no+optional-upload, approval (two-party send/receive), assignment (actor picks a user of a target role); (3) steps can be optional (skippable) vs required, configurable by super admin; (4) the existing parallel/join pair (Delivery Project Checklist + Delivery Readiness → Project Check Report) must be natively representable in the graph, not incidental numbering; (5) every step from Confirmation through Sign Off migrates UNCHANGED (byte-for-byte behavior) — this is the single highest-risk phase (Phase 17), isolated and explicitly verified against pre- and post-migration projects; (6) Workflow Configurator is super-admin-only AND gated behind a separate configuration PIN (default `0000`, changeable, hint shown) — an additional access-control layer on top of super_admin auth, not a replacement; (7) new roles `customer_care`, `ops_factory`, `factory_manager` added to the role enum with dashboard shells following the Phase 15 pattern; super-admin "titles" (Head of Design, MD, ED, COO, CPO, etc.) stay in `users.position`, no new role enum values for them; (8) `projects` gains an independent `paid`/`unpaid` payment status (separate from `not_delivered`/`delivered`/`paused`), with TWO distinct payment gates — initial toggle by Head of Operations gating the design phase, and a second Invoicing checkpoint after Brief Taking gating the Design Stage; (9) 14 new front-of-funnel/production-authorization stages seeded as data in the new engine, split across two phases: Phase 21 (Intake → Design Approval, pre-Confirmation) and Phase 22 (Confirmation2 → Factory Manager QC, inserted ahead of the existing Materials/Accessories Readiness step); (10) reuse existing `checklist_definitions`/`checklist_template_items` tables for checklist-kind step content — only the step *graph* itself becomes data-driven, checklists were already data-driven.
- Phase numbering for v2.0 continues from 15 (last completed phase): 16, 17, 18, 19, 20, 21, 22.
- [Phase 16]: Named 3 long FK constraints explicitly (psc_step_def_id_fk, wse_from_step_id_fk, wss_step_def_id_fk) in db/schema.ts to avoid Postgres 63-char identifier truncation causing drizzle-kit push non-idempotency
- [Phase 16 P02]: GraphStep.role/targetRole cast from DB roleEnum (6 values) to WorkflowRole (4 values) in lib/workflow-graph.ts's row mapper — workflow steps only ever assign the 4 roles that own steps; avoids widening WorkflowRole itself, which existing consumers depend on
- [Phase 16 P03]: completeGraphStep gates non-skip completions of the 3 new fulfillment kinds (yes_no_upload/approval/assignment) on a workflow_step_states row already being status 'complete', throwing step-not-fulfilled otherwise; legacy kinds are trusted as already validated upstream
- [Phase 16 P03]: skip enforcement (required-step-cannot-be-skipped) lives entirely server-side inside completeGraphStep, so a forged skip=true on a required step is rejected before any row is written

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 17 (Confirmation → Sign Off Migration) is explicitly flagged as the highest-risk phase in this milestone — it must be planned and verified with the same rigor as a production data migration: exact key/role/slug/order parity, and side-by-side behavior testing of pre-migration vs post-migration projects.
- Phase 16 (engine core) must land the parallel/join graph representation (WF-05) correctly, or Phase 17's migration of the existing Delivery Project Checklist + Delivery Readiness → Project Check Report join cannot be verified as behaviorally identical.
- Source PDFs for the ~9 original checklists' exact line items are not yet delivered (carried over from v1.0/v1.1); does not block v2.0 phases, which operate on the step *graph*, not checklist content.
- Open product decisions to confirm with stakeholder: final Dave Aredo daily quota (carried over, unrelated to v2.0).

## Quick Tasks Completed

| Date | Slug | Description | Status |
|------|------|-------------|--------|
| 2026-06-27 | analytics-delivery-speed | Super Admin Analytics page — ECharts delivery-speed-per-project chart (Bar/Ranked/Line/Pie) + stat cards + sidebar link | complete ✓ |
| 2026-06-27 | overview-stats-file-input | Overview: Operations user card + Completed/In Progress project cards; bigger process-flow file upload zone | complete ✓ |
| 2026-06-29 | editable-checklist-text | Inline "Edit checklist questions" on /checklists/[slug] — Site/Factory PMs edit item label/help text + add items, authorized by definition target_role | complete ✓ |
| 2026-07-05 | checklist-authoring-crud | Full super-admin checklist authoring CRUD — delete/reorder items, per-item field editing (type/options/photo-required), and checklist_definitions create/rename/retarget/deactivate-restore | complete ✓ |
| 2026-07-06 | slack-like-group-chat-group-conversation | Slack-like group chat — group conversations with title, emoji picker + reactions, typing indicator, GSAP fullscreen expand (like Paul Arredo) | complete ✓ |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Collaboration | Super Admin direct-message to a user (COLLAB-01) | v2 | Init |

## Session Continuity

Last session: 2026-07-09T11:28:33.343Z
Stopped at: Completed 16-03-PLAN.md (workflow graph write engine + server actions)
Resume file: None
