---
phase: quick-260728-cfn
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [GAP-1, GAP-2, GAP-3, MSG-1]
files_modified:
  - lib/workflow-graph.ts
  - actions/workflow.ts
  - actions/checklists.ts
  - actions/readiness.ts
  - app/(app)/checklists/[slug]/page.tsx
  - app/(app)/factory-pm/readiness/page.tsx
  - lib/projects-board.ts
  - app/api/projects/route.ts
  - app/(app)/factory-pm/projects/page.tsx
  - app/(app)/site-pm/projects/page.tsx
  - app/_components/project-steps-board.tsx
  - tests/lib/workflow-graph-assignee-gate.test.ts
  - tests/actions/workflow.test.ts
  - tests/actions/readiness.test.ts

must_haves:
  truths:
    - "A site_pm who is NOT the assignee opening /checklists/{slug}?projectId&step for a gated step sees an amber notice instead of the wizard — before filling anything in"
    - "A site_pm who is NOT the assignee opening /factory-pm/readiness?projectId&step for a gated step sees the same amber notice instead of the form"
    - "On the projects board, a gated current step shows no 'Open …' link, no ack button and no 'NEEDS YOU' marker for a non-assignee officer"
    - "The assignee themself is unaffected everywhere: link, form and NEEDS YOU marker all still appear"
    - "A factory_pm acting on their own half of the dual-role materials_readiness step is never blocked by the site_pm-scoped gate"
    - "Pre-submit and post-submit wording for the assignee gate come from ONE exported constant, so they cannot drift"
    - "No authorization behaviour changes: all 5 write-path gates reject exactly the same callers as before this task"
  artifacts:
    - path: "lib/workflow-graph.ts"
      provides: "stepAssigneeMismatch() + ASSIGNEE_MISMATCH_MESSAGE — the shared read-side gate helper and its single message string"
      contains: "export async function stepAssigneeMismatch"
    - path: "tests/lib/workflow-graph-assignee-gate.test.ts"
      provides: "Coverage for stepAssigneeMismatch: not-assignee / assignee / unassigned / non-gated-role (zero queries)"
      contains: "stepAssigneeMismatch"
  key_links:
    - from: "app/(app)/checklists/[slug]/page.tsx"
      to: "stepAssigneeMismatch"
      via: "workflowNotice else-if chain, after the stepPositionMismatch branch"
      pattern: "stepAssigneeMismatch"
    - from: "app/(app)/factory-pm/readiness/page.tsx"
      to: "stepAssigneeMismatch"
      via: "workflowNotice else-if chain, after the stepPositionMismatch branch"
      pattern: "stepAssigneeMismatch"
    - from: "lib/projects-board.ts"
      to: "app/_components/project-steps-board.tsx"
      via: "BoardProject.gatedToUserId prop + viewerUserId prop, consumed in `mine` and `needsViewer`"
      pattern: "gatedToUserId"
---

<objective>
Close the assignee-gate STRANDING gap: the three pre-submit surfaces that check
role (`canActOnGraphStep`) and position (`stepPositionMismatch`) but never the
assignee gate, so a non-assigned officer is currently shown an actionable step
and is only rejected after submitting.

Purpose: the write side is already correct and complete (verified at all 5 write
paths). Nothing here changes who CAN act — it changes who is TOLD they can act,
so a non-assignee never fills a multi-step checklist that can never advance.

Output: one shared server helper (`stepAssigneeMismatch`) + one shared message
constant (`ASSIGNEE_MISMATCH_MESSAGE`) in `lib/workflow-graph.ts`, wired into the
two form pages' `workflowNotice` chains, plus a `gatedToUserId` thread from the
board's server parents into the client board's `mine`/`needsViewer` computation.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md
@.planning/STATE.md

@lib/workflow-graph.ts
@lib/my-work.ts
@app/(app)/checklists/[slug]/page.tsx
@app/(app)/factory-pm/readiness/page.tsx
@app/_components/project-steps-board.tsx
@lib/projects-board.ts
@app/_components/header-project-switcher.tsx
@tests/lib/workflow-graph-assignee-gate.test.ts
</context>

<audit_findings>
Established as FACT by today's audit — do not re-investigate, do not re-derive:

- `ASSIGNEE_GATED_STEPS` (lib/workflow-graph.ts ~line 154) coverage is COMPLETE.
  Do NOT add, remove or re-scope any entry. Do NOT add factory_pm /
  factory_manager / operations to it.
- WRITE-SIDE ENFORCEMENT IS COMPLETE AND CORRECT at all 5 paths:
  `actions/workflow.ts` advanceProjectStep (~line 70) + confirmDualRoleStepAs
  (~182), `actions/readiness.ts` (~96), `actions/checklists.ts` (~180),
  `actions/workflow-graph.ts` authorizeStep (~94). A non-assigned officer can
  never actually complete a step today. Do NOT weaken, duplicate or restructure
  these gates.
- The gap is PRE-SUBMIT VISIBILITY only, at exactly 3 surfaces:
  1. `app/(app)/checklists/[slug]/page.tsx` workflowNotice chain (~76-107)
  2. `app/(app)/factory-pm/readiness/page.tsx` workflowNotice chain (~39-69)
  3. `app/_components/project-steps-board.tsx` `mine` (~350) and `needsViewer` (~528)
</audit_findings>

<interfaces>
<!-- Existing contracts the executor builds against. No exploration needed. -->

Existing in lib/workflow-graph.ts (the pattern to mirror exactly — added by
quick task 260727-g7a for this identical anti-stranding purpose):

  export const POSITION_MISMATCH_MESSAGE: string
  export async function stepPositionMismatch(
    userId: string,
    step: { requiredPosition?: string | null },
  ): Promise<boolean>

Existing gate primitives (reuse, do not reimplement):

  export function assigneeGatedRoles(stepKey: string): WorkflowRole[]
  export async function getStepAssigneeGate(
    graph: string, projectId: string, stepKey: string,
  ): Promise<string | null>

The exact inline shape the 5 write paths already implement (this is the logic
the new helper encapsulates — semantics must be identical):

  if (assigneeGatedRoles(step.key).includes(role as WorkflowRole)) {
    const gateUserId = await getStepAssigneeGate('live', projectId, step.key)
    if (gateUserId && gateUserId !== userId) { /* reject */ }
  }

Board data contract (app/_components/project-steps-board.tsx):

  export type BoardProject = {
    id: string; name: string; location: string | null
    deliveryDate: string | null; currentStep: number
    status: 'delivered' | 'not_delivered' | 'paused'
    stepDeadlines?: Record<string, string>
  }

  export default function ProjectStepsBoard(props: {
    projects: BoardProject[]; viewerRole: UserRole
  })

Board producer (lib/projects-board.ts):

  export async function getBoardProjects(): Promise<BoardProject[]>
  Consumers: app/(app)/factory-pm/projects/page.tsx,
             app/(app)/site-pm/projects/page.tsx,
             app/api/projects/route.ts   (the 4s poll that REPLACES board state)

Client-side precedent for the same computation (app/_components/header-project-switcher.tsx ~102/162):

  const mine = canActOnGraphStep(step, viewerRole)
    && (selected.gatedToUserId === null || selected.gatedToUserId === viewerUserId)
    && matchesPosition(step, viewerPosition)

Server-side prefetch precedent (lib/my-work.ts ~100-117): the gate is resolved
ONCE per active project, and only when `assigneeGatedRoles(step.key).includes(role)`
— most projects pay zero extra queries.
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Shared stepAssigneeMismatch helper + ASSIGNEE_MISMATCH_MESSAGE constant</name>
  <files>lib/workflow-graph.ts, actions/workflow.ts, actions/checklists.ts, actions/readiness.ts, tests/lib/workflow-graph-assignee-gate.test.ts, tests/actions/workflow.test.ts, tests/actions/readiness.test.ts</files>
  <behavior>
    stepAssigneeMismatch(userId, projectId, step, role):
    - Test 1: gated role + gate held by a DIFFERENT user => true
    - Test 2: gated role + gate held by the caller => false
    - Test 3: gated role + no assignment recorded yet (gate resolves null) => false
    - Test 4: role NOT in assigneeGatedRoles(step.key) (factory_pm on the
      dual-role materials_readiness step) => false, AND zero db queries issued
      (assert the mocked select/limit was never called)
  </behavior>
  <action>
In lib/workflow-graph.ts, directly BELOW the existing POSITION_MISMATCH_MESSAGE /
stepPositionMismatch block (~lines 207-242), add a sibling section mirroring its
shape exactly:

1. `export const ASSIGNEE_MISMATCH_MESSAGE` — one role-NEUTRAL sentence. The
   three legacy write paths currently hardcode a site_pm-specific string
   ('This step is assigned to a specific Site PM for this project.') while the
   same gate also covers design/architect steps, so generalize to something
   like 'This step is assigned to a specific person for this project — only
   they can act on it.' Changing the message TEXT is in scope; changing gate
   LOGIC is not.

2. `export async function stepAssigneeMismatch(userId, projectId, step, role, graph = 'live'): Promise<boolean>`
   where `step` is typed structurally as `{ key: string }` (mirroring
   stepPositionMismatch's `{ requiredPosition?: string | null }`) so both
   GraphStep and LiveWorkflowStep satisfy it, and `role` is `UserRole`.
   Body: return false immediately when `!assigneeGatedRoles(step.key).includes(role as WorkflowRole)`
   (zero queries — the fast path that keeps ungated steps byte-identical to
   today); otherwise resolve `getStepAssigneeGate(graph, projectId, step.key)`
   and return `gateUserId !== null && gateUserId !== userId`.

   Dense why-comment (quick task 260728-cfn) covering: (a) this is the READ-side
   twin of the gate the 5 write paths already enforce inline — it exists to stop
   STRANDING (a non-assignee filling an entire checklist and being rejected only
   at submit), never as an authorization boundary; (b) `role` is a REQUIRED
   parameter, not an optimization: materials_readiness is dual-role and gated to
   the site_pm party ONLY, so consulting the gate without first checking
   assigneeGatedRoles would wrongly block a factory_pm acting on their own half;
   (c) a null gate means "not assigned yet" = no restriction, matching
   getStepAssigneeGate's documented contract.

3. Message-only adoption at the three legacy write paths — replace the literal
   'This step is assigned to a specific Site PM for this project.' with
   ASSIGNEE_MISMATCH_MESSAGE at actions/workflow.ts (~188, confirmDualRoleStepAs),
   actions/readiness.ts (~101) and actions/checklists.ts (~185), adding
   ASSIGNEE_MISMATCH_MESSAGE to each file's existing import from
   '@/lib/workflow-graph'. Leave the surrounding
   `if (assigneeGatedRoles(...).includes(role)) { ... }` blocks structurally
   UNCHANGED — do not refactor them to call the new helper. Add a one-line
   why-comment recording that deliberate choice: the write paths keep their own
   inline, individually-tested gates (defense in depth); only the user-facing
   STRING is shared, which is what pre/post-submit drift actually comes from.
   Do NOT touch actions/workflow-graph.ts's ENGINE_ERROR_MESSAGES or
   app/(app)/workflow/step/page.tsx — the graph engine has its own consistent
   pair and is out of scope.

Tests:
- tests/lib/workflow-graph-assignee-gate.test.ts: this file currently stubs
  `vi.mock('@/db', () => ({ db: {} }))`. Replace that stub with a chainable
  db mock built via `vi.hoisted`, following the shape already used in
  tests/actions/workflow.test.ts (`select: () => ({ from: () => ({ where: () => ({ limit: selectLimitMock }) }) })`).
  Keep every existing pure test in the file passing untouched. Add a
  `describe('stepAssigneeMismatch (quick task 260728-cfn)')` block covering the
  four cases in <behavior>. stepAssigneeMismatch issues two sequential
  single-row reads on the gated path (getStepByKey, then the
  workflow_step_states row), so queue mock resolutions accordingly via
  `mockResolvedValueOnce`.
- tests/actions/workflow.test.ts (~line 393): the asserted message string
  changes to the new constant's text. Update the literal.
- tests/actions/readiness.test.ts (~lines 35-39): its `@/lib/workflow-graph`
  mock factory enumerates the module's exports (it already stubs
  POSITION_MISMATCH_MESSAGE). Add ASSIGNEE_MISMATCH_MESSAGE with the same text
  as the real constant so the action's import resolves. Update any asserted
  message literal in that file to match.

Then grep for any remaining occurrence of the old site_pm-specific literal in
app/, actions/, lib/ and tests/ and confirm only intentionally-untouched
graph-engine strings remain.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm &amp;&amp; npx vitest run tests/lib/workflow-graph-assignee-gate.test.ts tests/actions/workflow.test.ts tests/actions/readiness.test.ts &amp;&amp; grep -rn "assigned to a specific Site PM" --include='*.ts' --include='*.tsx' app actions lib tests | grep -v '^$' | wc -l | grep -qx 0</automated>
  </verify>
  <done>stepAssigneeMismatch + ASSIGNEE_MISMATCH_MESSAGE exported from lib/workflow-graph.ts; four new unit tests pass; the three legacy write paths return the shared constant with their gate blocks structurally unchanged; zero occurrences of the old site_pm-specific literal remain in app/actions/lib/tests.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the gate into both form pages' workflowNotice chains</name>
  <files>app/(app)/checklists/[slug]/page.tsx, app/(app)/factory-pm/readiness/page.tsx</files>
  <action>
Both pages already build a `workflowNotice` else-if chain that ends with the
`stepPositionMismatch` branch added by quick task 260727-g7a. Add ONE new branch
to each, placed immediately AFTER the position branch and BEFORE the final
`else` that sets workflowProjectId/workflowStepN (so a stranded caller never
reaches the wizard/form render path):

  } else if (await stepAssigneeMismatch(userId, projectId, step, role as UserRole)) {
    workflowNotice = ASSIGNEE_MISMATCH_MESSAGE
  }

- app/(app)/checklists/[slug]/page.tsx: insert after the branch at ~line 91-96.
  `projectId` is non-null inside this block (the enclosing `if (projectId && stepN)`).
- app/(app)/factory-pm/readiness/page.tsx: insert after the branch at ~line 52-57.

Extend each file's existing `@/lib/workflow-graph` import with
`stepAssigneeMismatch` and `ASSIGNEE_MISMATCH_MESSAGE` (both already import
stepPositionMismatch/POSITION_MISMATCH_MESSAGE from there).

Add a dense why-comment on each new branch (quick task 260728-cfn) in the same
voice as the 260727-g7a comment directly above it: the authoritative gate lives
in actions/checklists.ts / actions/readiness.ts / actions/workflow.ts and is
unchanged; this branch exists so a non-assigned officer is told BEFORE filling a
multi-step checklist or readiness form, not after submitting one that can never
advance the step. Note that the branch runs AFTER the role check, so the helper's
role-scoped fast path means a factory_pm on the dual-role materials_readiness
step never triggers it.

Ordering matters and must not change: project/step existence -> slug match ->
currentStep match -> role -> position -> assignee. Do not reorder existing
branches. Do not touch the banner JSX, the dual-role copy, or any other render
logic — the existing `workflowNotice` amber block already renders the new text
verbatim.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm &amp;&amp; npx tsc --noEmit &amp;&amp; grep -c "stepAssigneeMismatch" "app/(app)/checklists/[slug]/page.tsx" "app/(app)/factory-pm/readiness/page.tsx"</automated>
  </verify>
  <done>Both pages import and call stepAssigneeMismatch in their workflowNotice chain after the position branch; tsc clean; a non-assignee's request sets workflowNotice and therefore leaves workflowProjectId/workflowStepN null (form renders without workflow binding).</done>
</task>

<task type="auto">
  <name>Task 3: Thread gatedToUserId + viewerUserId into the client projects board</name>
  <files>lib/projects-board.ts, app/api/projects/route.ts, app/(app)/factory-pm/projects/page.tsx, app/(app)/site-pm/projects/page.tsx, app/_components/project-steps-board.tsx</files>
  <action>
project-steps-board.tsx is a CLIENT component and lib/workflow-graph.ts is
`server-only`, so the gate MUST be resolved server-side and passed down. Follow
header-project-switcher.tsx's precedent (it already consumes a `gatedToUserId`
produced by lib/my-work.ts) and my-work.ts's bounded-prefetch discipline. Do NOT
add any client-side db call and do NOT issue a query per render loop iteration.

1. app/_components/project-steps-board.tsx — extend the exported `BoardProject`
   type with `gatedToUserId?: string | null` (optional, so no consumer breaks),
   and add a `viewerUserId: string` prop to `ProjectStepsBoard`'s props (thread
   it into the modal component that owns the step list, alongside the existing
   `viewerRole`).

2. lib/projects-board.ts — give `getBoardProjects` an optional
   `viewerRole?: UserRole` parameter and populate `gatedToUserId` per project.
   Resolve the project's CURRENT step via `getLiveWorkflowSteps()` + `findStep`
   (call getLiveWorkflowSteps ONCE, outside the per-project loop), then set the
   gate only when `viewerRole` is supplied AND the project is neither paused nor
   complete AND `assigneeGatedRoles(step.key).includes(viewerRole as WorkflowRole)`
   — otherwise `null`, with no query. Mirror lib/my-work.ts's loop comment
   verbatim in spirit: most projects skip the DB round trip entirely because
   assigneeGatedRoles returns []. When `viewerRole` is omitted, behaviour is
   byte-identical to today (every gatedToUserId null).

3. app/api/projects/route.ts — capture the session role
   (`const { role } = await verifySession()`) and pass it to
   `getBoardProjects(role as UserRole)`. This poll REPLACES board state every 4s,
   so omitting it here would silently un-gate the board a few seconds after
   load — this line is load-bearing, note that in a why-comment.

4. app/(app)/factory-pm/projects/page.tsx and app/(app)/site-pm/projects/page.tsx
   — capture `const { userId, role } = await verifySession()` (both currently
   discard the result), pass the role into `getBoardProjects(...)` and pass
   `viewerUserId={userId}` to `<ProjectStepsBoard />`. Keep the existing
   hardcoded `viewerRole` props as they are.

5. project-steps-board.tsx gate application — two sites, same predicate:
   - `mine` (~line 350, inside the modal's step map): AND in
     `(!current || project.gatedToUserId == null || project.gatedToUserId === viewerUserId)`.
     The `!current ||` guard is deliberate and must be commented: gatedToUserId
     is resolved for the project's CURRENT step only, so it must never be
     applied to a done/locked row.
   - `needsViewer` (~line 528, drives the ' • NEEDS YOU' dropdown marker): AND in
     `(p.gatedToUserId == null || p.gatedToUserId === viewerUserId)` (this
     function already operates on the current step exclusively).

   Effect: a non-assigned officer's gated current step loses its 'Open …' link,
   its AckComplete button and its BypassRequest control (all already nested
   under `mine`), and falls through to the existing amber 'Waiting on …' line.
   Do NOT change any copy in this component — new wording would be a second,
   drift-prone source of the gate message. The assignee themself and every
   ungated step render exactly as today.

Dense why-comments throughout, quick task id 260728-cfn. No emojis. Preserve
Next 16 conventions (await verifySession/params, server components stay async).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm &amp;&amp; npx tsc --noEmit &amp;&amp; npm run lint &amp;&amp; npm test</automated>
  </verify>
  <done>getBoardProjects populates gatedToUserId for the viewer's role only (bounded, no per-render queries); both projects pages and the /api/projects poll pass role + viewerUserId; `mine` and `needsViewer` both consult the gate; tsc, lint and the full suite (346+ tests) green with no regressions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> server component render | Attacker-controlled `projectId`/`step` query params drive the workflowNotice chain |
| browser -> /api/projects | Authenticated poll returning board data, now including an assignee userId |
| client board state -> Server Action | Rendered links/buttons are hints only; every action re-authorizes server-side |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cfn-01 | Elevation of Privilege | New read-side gate mistaken for the authorization boundary | mitigate | All 5 write-path gates left structurally unchanged (Task 1 explicitly forbids refactoring them); why-comments state the read-side helper is anti-stranding only |
| T-cfn-02 | Elevation of Privilege | stepAssigneeMismatch called without role scoping | mitigate | `role` is a required parameter; dual-role safety test (factory_pm on materials_readiness => false, zero queries) pins the behaviour |
| T-cfn-03 | Information Disclosure | gatedToUserId (an internal user id) sent to the client via /api/projects | accept | Same id already shipped to the client by lib/my-work.ts -> header-project-switcher; opaque uuid, authenticated recipients only, no PII |
| T-cfn-04 | Denial of Service | Per-project gate resolution on a board listing every project | mitigate | Gate resolved only for non-paused, non-complete projects whose CURRENT step is gated for the viewer's role; getLiveWorkflowSteps hoisted out of the loop (my-work.ts prefetch discipline) |
| T-cfn-05 | Tampering | Forged `gatedToUserId` in a modified client bundle | accept | Client state is display-only; actions/workflow.ts, actions/checklists.ts, actions/readiness.ts and authorizeStep re-check the gate server-side on every write |
| T-cfn-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies introduced by this task — nothing to audit |
</threat_model>

<verification>
1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npm test` — full suite green, 346+ passing, zero regressions.
4. `grep -rn "assigned to a specific Site PM" app actions lib tests` — no hits.
5. `grep -n "ASSIGNEE_GATED_STEPS" -A 14 lib/workflow-graph.ts` — the map is
   byte-identical to its pre-task content (8 entries, same governingKey/gatedRoles).
6. Manual (optional, graph='test' per the concurrent-session note): sign in as a
   site_pm who is NOT the assignee on a project sitting at `confirmation`, open
   the project on /site-pm/projects — no 'Open …' link, no NEEDS YOU marker;
   hand-navigate to /checklists/{slug}?projectId=…&step=… — amber notice, no
   workflow binding. Repeat as the actual assignee — everything works as before.
</verification>

<success_criteria>
- A non-assigned officer can no longer be shown an actionable gated step at any
  of the 3 audited surfaces, and is told why before investing any form-filling.
- The assignee, and every officer on an ungated step, sees no behavioural change.
- A factory_pm on the dual-role materials_readiness step is never gated.
- Exactly one exported constant supplies the assignee-gate wording to both the
  pre-submit notices and the legacy write-path rejections.
- `ASSIGNEE_GATED_STEPS` and all 5 write-path gates are unchanged in behaviour.
- tsc, lint and the full test suite are green.
</success_criteria>

<output>
Create `.planning/quick/260728-cfn-enforce-assignee-gate-pages/260728-cfn-SUMMARY.md` when done
</output>
