# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-18)

**Core value:** A PM on the floor or on-site can complete a structured checklist (with photo evidence) on their phone and have it permanently recorded — replacing paper, with role-scoped visibility and read-only Super Admin oversight.
**Current focus:** Phase 1 — Foundation (Auth, Roles, Schema, DAL)

## Current Position

Phase: 1 of 8 (Foundation — Auth, Roles, Schema, DAL)
Plan: 0 of 3 in current phase
Status: Ready to plan
Last activity: 2026-06-18 — Project initialized; research, requirements, and roadmap created

Progress: [░░░░░░░░░░] 0%

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

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- Self-serve signup with role picker (Factory/Site PM only); Super Admin seeded by script
- Super Admin is read-only on operational data
- Template-driven checklist schema (definition → template items → responses) — pending PDFs become data, not code
- Next 16: use `proxy.ts` (not `middleware.ts`); `await` params/cookies/headers
- `@neondatabase/auth` is 0.4.2-beta — pin exact version; verify session/claims API before writing `lib/dal.ts`
- SCOPE CHANGE (2026-06-19): added Resend email, a collaborative Processes diagram editor (React Flow `@xyflow/react` 12.11.0 + Mermaid 11.15.0), and real-time dashboard chat
- Supabase Realtime (`@supabase/supabase-js` 2.108.2) is TRANSPORT ONLY — Neon stays single source of truth; no app data in Supabase
- Collaborative diagram editing = shared, last-write-wins per element for v1 (not CRDT)
- Phase 1 schema now lays ALL tables (incl. conversations, messages, process_diagrams, ai_usage) up front to avoid migration churn; EMAIL-01/02 (Resend) added to Phase 1

### Pending Todos

None yet.

### Blockers/Concerns

- Source PDFs for the ~9 checklists' exact line items are not yet delivered. Mitigated by template-driven schema; Phases 1–3 proceed without them; final content loads in Phase 4/5/10.
- Open product decisions to confirm with stakeholder: Confirmation→Verification rename (platform-wide?), Yes/No vs Yes/No/N/A items (schema supports tri-state regardless), final Dave Aredo daily quota.
- Phase 1 `01-RESEARCH.md` was written BEFORE the scope change — it covers auth/DAL/Drizzle/proxy.ts but NOT Resend email or the chat/diagram tables. The Phase 1 planner must be told to add: Resend email utility (verification/reset) + the conversations/messages/process_diagrams/ai_usage tables. These are straightforward; no re-research required.
- A subagent hit a usage limit (reset ~10:50pm Africa/Lagos on 2026-06-18). Re-verify agent availability before spawning the Phase 1 planner/checker.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Collaboration | Super Admin direct-message to a user (COLLAB-01) | v2 | Init |

## Session Continuity

Last session: 2026-06-19
Stopped at: Scope expanded (email, diagram editor, chat) → roadmap revised to 10 phases (62 reqs). Phase 1 research done (pre-scope-change). Awaiting re-approval of revised roadmap before spawning Phase 1 planner.
Resume file: None
