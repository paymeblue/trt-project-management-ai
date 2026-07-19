# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Configurable Production Workflow Engine

**Shipped:** 2026-07-19
**Phases:** 16-22 + inserted 20.1 | **Plans:** 24 formal (+~30 tracked quick tasks) | **Timeline:** 2026-07-09 → 2026-07-19

### What Was Built

- DB-driven workflow graph (definitions/edges/states, 7 fulfillment kinds) fully replacing the hardcoded `WORKFLOW_STEPS` array, with a byte-identical migration of the legacy tail proven by a repeatable parity harness.
- PIN-gated self-service Workflow Configurator; the live graph grew 11 → 21 steps entirely through data (full intake → design → production-authorization → QC → delivery → sign-off flow).
- 11 permission roles + a rename-safe data-driven positions table powering exact-position and assignee step gates.
- Per-tab independent auth sessions (multi-user in one browser, refresh-safe), position-scoped step notifications, strictly per-step deadlines, escalation flags, full-evidence audit view.

### What Worked

- **Parity harnesses as the migration safety net.** `verify:live-workflow` (PARITY + dual-role orders) caught real regressions repeatedly — including a live Configurator drift (`brief_taking` role flipped to `architect`) found at milestone close that would have locked out design-role assignees.
- **Ad hoc delivery with honest reconciliation.** Most of Phases 20-22 shipped as demo-driven ad hoc work days ahead of formal planning; the reconciliation pass (requirements vs live graph) kept the docs truthful instead of re-planning shipped work.
- **Compile-time contracts for security-sensitive plumbing.** Making `tabToken` a required first parameter on every Server Action turned an entire class of silent identity bugs into TypeScript errors.
- **Live-browser verification with real seeded accounts** (agent-browser + QA logins) caught what unit tests could not — layout-cache reuse, cross-identity writes, cookie-clobbering flows.

### What Was Inefficient

- **The per-tab auth saga burned four fix rounds** (router.refresh → push+replace → restore route → pre-paint script). Two lessons compounded: Next's client Router Cache semantics were misjudged repeatedly, and every "verified fixed" was tested only in a clean browser while the user's DOM-mutating extension broke hydration-dependent fixes. Testing under adversarial client conditions from round one would have saved days.
- **Requirement/decision drift between sessions.** STG-04 was cut and step order restructured live, but docs lagged until milestone close; the stale `verify-design-pipeline.ts` harness stayed red for a week for the same reason.
- **SDK state handlers clobbered STATE.md frontmatter** (known issue since 19-01), forcing manual direct edits for the rest of the milestone.

### Patterns Established

- Bound-token Server Action pattern (`verifySessionForAction` / `requireAdminForAction` + `TabTokenForm` / `getTabToken()`); pre-paint inline scripts for identity-critical client behavior.
- One-time data repairs as idempotent, guard-railed `scripts/fix-*.ts` / `migrate-*.ts` files run against live Neon, always followed by the parity harness.
- Position-scoped recipient resolution (`notifyNextStepOfficers`): assignee gate > requiredPosition > dualRoles > role audience.
- Quick tasks tracked in `.planning/quick/` with atomic commits + STATE.md rows, even when executed directly.

### Key Lessons

1. Never trust a clean-browser pass as proof for client-side fixes — the user's environment (extensions, throttled background tabs, idle-expired tokens) is the real test matrix.
2. When the browser fights per-tab state (cookies are browser-wide), get the correction *out of the framework entirely* — inline pre-paint scripts beat React-lifecycle fixes for correctness-critical redirects.
3. A live-editable system (Configurator) needs drift detection against its canonical seed — schedule the parity harness after any configurator session, not just at milestone close.
4. Fail-closed auth paths need an audit of *where they fail to* — "redirect to /sign-in" silently became "become the cookie user" via the signed-in redirect.

### Cost Observations

- Sessions: multiple long autonomous sessions; heaviest spend on the per-tab auth debugging rounds (live browser QA loops).
- Notable: direct execution with GSD tracking (no subagent round-trips) was markedly cheaper than agent-delegated planning for continuation work where context already existed.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Notable |
| --------- | ------ | ----- | ------- |
| v1.0 MVP | 1-10 | — | Foundation-first; schema laid in full up front paid off (few migrations later) |
| v1.1 Governance | 11-15 | — | Small, well-scoped phases; smooth |
| v2.0 Workflow Engine | 16-22 + 20.1 | 24 (+~30 quick tasks) | Highest-risk migration (17) went clean via parity harness; unplanned auth phase (20.1) dominated debugging time |
