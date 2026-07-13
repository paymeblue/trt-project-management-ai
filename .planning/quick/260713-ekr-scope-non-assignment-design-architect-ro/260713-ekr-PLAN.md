---
phase: quick/260713-ekr
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [BUGFIX-assignee-scope]
files_modified:
  - lib/workflow-graph.ts
  - actions/workflow-graph.ts
  - app/(app)/workflow/step/page.tsx
  - lib/workflow.ts
  - lib/my-work.ts
  - app/api/my-work/route.ts
  - app/(app)/layout.tsx
  - app/_components/header-project-switcher.tsx
  - tests/lib/workflow-graph-assignee-gate.test.ts
  - scripts/verify-assignee-gate.ts

must_haves:
  truths:
    - "A design/architect user who was NOT the person assigned at the governing assignment step is rejected server-side when they try to complete brief_taking, kickoff_meeting, or design_stage for a project (error 'assignee-mismatch')."
    - "The user who WAS assigned at the governing step can still complete their assigned brief_taking/kickoff_meeting/design_stage."
    - "The 'Action required' forcing modal no longer surfaces an assignee-gated step to a design/architect user who is not the assignee for that project."
    - "The header project switcher only shows 'your turn' / the Act button for an assignee-gated step to the actual assignee."
    - "assign_designer_brief and design_initiation (the assignment-kind steps themselves) remain actionable by the Head Designer exactly as before — the gate is a no-op for them."
    - "admin/timeline, checklists/[slug], factory-pm/readiness, bypass, and ack/dual-role flows are unaffected."
  artifacts:
    - path: "lib/workflow-graph.ts"
      provides: "ASSIGNEE_GATED_STEPS map + assigneeGoverningStepKey(pure) + getStepAssigneeGate(graph,projectId,stepKey)"
      contains: "getStepAssigneeGate"
    - path: "actions/workflow-graph.ts"
      provides: "authorizeStep enforces the assignee gate; 'assignee-mismatch' in ENGINE_ERROR_MESSAGES"
      contains: "assignee-mismatch"
    - path: "lib/my-work.ts"
      provides: "getMyWork(role, userId) filtering pending + emitting gatedToUserId per active project"
      contains: "getStepAssigneeGate"
    - path: "app/_components/header-project-switcher.tsx"
      provides: "viewerUserId prop + gatedToUserId match in mine/youract"
      contains: "viewerUserId"
    - path: "tests/lib/workflow-graph-assignee-gate.test.ts"
      provides: "unit tests for the pure governing-step mapping"
      contains: "assigneeGoverningStepKey"
  key_links:
    - from: "actions/workflow-graph.ts authorizeStep"
      to: "lib/workflow-graph.ts getStepAssigneeGate"
      via: "call with (step.graph, projectId, step.key) after role+position pass"
      pattern: "getStepAssigneeGate"
    - from: "lib/my-work.ts getMyWork"
      to: "lib/workflow-graph.ts getStepAssigneeGate"
      via: "per active project at a gated step, filter pending + compute gatedToUserId"
      pattern: "getStepAssigneeGate"
    - from: "app/(app)/layout.tsx"
      to: "getMyWork + HeaderProjectSwitcher"
      via: "pass session.user.id as userId and viewerUserId"
      pattern: "getMyWork\\("
---

<objective>
Scope the non-assignment design/architect-role steps (brief_taking, kickoff_meeting, design_stage) to the ONE person chosen at the preceding assignment step for that same project — not any user whose role is design or architect.

Purpose: Close a live, security-critical authorization gap. Today `authorizeStep()` (and every "is this mine" UI signal) is purely role-based, so any design/architect user can complete another project's assigned brief/kickoff/design step, and the forcing modal wrongly nags the wrong person (confirmed by the user's screenshot: Amaka got "Brief Taking" for Test Project after assigning a DIFFERENT project's brief to Ifeoma).

Output: A shared server-side assignee-gate function wired into the server authorization boundary (the non-negotiable fix) plus the two live-bug UI-derived "mine" signals (forcing modal / header switcher), with full type-check, lint, test, build, and a read-only live-DB verification.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Confirmed governance mapping (verified against db/workflow-live-steps.ts LIVE_WORKFLOW_STEPS; Task 3 re-verifies against the actual DB before shipping):
- assign_designer_brief (assignment, orderIndex 2) governs brief_taking (yes_no_upload, 3) only. Steps 4 (invoice_upload, customer_care) and 5 (invoice_timeline, operations) break the design arc.
- design_initiation (assignment, orderIndex 6) governs kickoff_meeting (yes_no_upload, 7) and design_stage (yes_no_upload, 8). Step 9 (ops_design_confirmation, operations) ends the arc.

Codebase sweep already performed (assignedUserId / canActOnGraphStep / canRoleActOnStep across the whole repo). Surfaces that DO need the fix for the live bug: authorizeStep, workflow/step page load, getMyWork, header-project-switcher. Surfaces confirmed UNAFFECTED and NOT to be changed:
- app/(app)/admin/timeline/page.tsx — already narrows canAct to step.role === 'operations' (assignee-gated steps are design role, never match).
- app/(app)/checklists/[slug]/page.tsx and app/(app)/factory-pm/readiness/page.tsx — gate checklist/readiness kinds only; the assignee-gated steps are all yes_no_upload, never routed here.
- actions/bypass.ts — only checklist/readiness bypass; assignee-gated kinds never reach it.
- actions/workflow.ts (ack / confirmDualRoleStep) — ack/dual-role steps, not assignee-gated.

DELIBERATELY OUT OF SCOPE for this quick task: app/_components/project-steps-board.tsx (+ lib/projects-board.ts and the factory-pm/site-pm projects pages). The board's only current viewers are factory_pm/site_pm, whose role never matches a design-role gate — so canActOnGraphStep is already false for them and the board does NOT expose this bug today. Wiring gatedToUserId through the board would be pure defense-in-depth / future-proofing for a design-role board that doesn't yet exist, and would push this security-critical fix to the upper edge of quick-task scope (4 tasks / 14 files). It is intentionally deferred; add it in a follow-up if/when a design-role projects board ships.

super_admin: no bypass is added. canRoleActOnStep already gives super_admin NO access to design-role steps, so a super_admin is denied at the role gate before the assignee gate is ever reached — consistent with every existing gate in this codebase. Do NOT invent an admin-bypass here.

<interfaces>
From lib/workflow-graph.ts (existing, server-only):
  export async function getStepByKey(graph: string, key: string): Promise<GraphStep | undefined>
  export async function getStepById(id: string): Promise<GraphStep | undefined>
  // workflow_step_states row carries: projectId, stepDefId, status, assignedUserId (uuid|null)
  // UNIQUE(projectId, stepDefId). assignment rows set status='complete', assignedUserId set.

From actions/workflow-graph.ts (existing):
  async function authorizeStep(stepDefId: string, forReceive = false): Promise<StepAuth>
  // StepAuth = { ok: true; userId: string } | { ok: false; message: string }
  // Called by: completeStepAction, submitYesNoUploadAction, sendApprovalAction,
  // receiveApprovalAction(forReceive=true), assignUserAction — ALL have input.projectId.

From lib/workflow.ts (existing):
  export type ActiveProject = { id: string; name: string; stepN: number; deadline: string | null }
  export type MyWork = { activeProjects: ActiveProject[]; pending: PendingWork[] }
  export function canActOnGraphStep(step, userRole): boolean   // role-only — DO NOT change its signature
  export function findStep<T>(steps: T[], n: number): T | undefined   // matches by .n (orderIndex)

From lib/dal.ts:  verifySession(): Promise<{ userId, role }>
LiveWorkflowStep (getLiveWorkflowSteps) carries .key and .n (=orderIndex).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server-side assignee gate — the security boundary</name>
  <files>lib/workflow-graph.ts, actions/workflow-graph.ts, app/(app)/workflow/step/page.tsx, tests/lib/workflow-graph-assignee-gate.test.ts</files>
  <action>
In lib/workflow-graph.ts, add a hardcoded, targeted mapping with a self-contained comment explaining that this is a deliberately narrow, hardcoded lookup (NOT a generic framework): the three non-assignment design steps keyed to the assignment step that governs each. `const ASSIGNEE_GATED_STEPS: Record<string, string> = { brief_taking: 'assign_designer_brief', kickoff_meeting: 'design_initiation', design_stage: 'design_initiation' }`. Export a PURE helper `assigneeGoverningStepKey(stepKey: string): string | null` returning `ASSIGNEE_GATED_STEPS[stepKey] ?? null`. Export an async `getStepAssigneeGate(graph: string, projectId: string, stepKey: string): Promise<string | null>`: resolve the governing key via the pure helper (return null if none); look up the governing step def via getStepByKey(graph, governingKey) (return null if not found); select workflowStepStates.assignedUserId for (projectId, that step def id); return the assignedUserId or null if no row / not yet assigned. Never throw on the not-yet-assigned case.

In actions/workflow-graph.ts: (1) add `'assignee-mismatch': 'This step is assigned to a specific person — only they (or the Head Designer, by reassigning) can act on it.'` to ENGINE_ERROR_MESSAGES; (2) change authorizeStep signature to `authorizeStep(stepDefId: string, projectId: string, forReceive = false)`; after the existing role gate and requiredPosition/receiver checks pass, call `getStepAssigneeGate(step.graph, projectId, step.key)` and, if it returns a non-null userId that !== the acting userId, return `{ ok: false, message: engineErrorMessage(new Error('assignee-mismatch')) }`; (3) update all five call sites to pass input.projectId (receiveApprovalAction keeps forReceive=true as the third arg). Import getStepAssigneeGate.

In app/(app)/workflow/step/page.tsx (defense-in-depth + clean denial so the wrong designer never even sees the form): after the existing requiredPosition check, call getStepAssigneeGate(graph, projectId!, step.key) and if it returns a non-null id !== userId, `return denied('This step is assigned to a specific person — only they can act on it.')`. Import getStepAssigneeGate from '@/lib/workflow-graph'.

Add tests/lib/workflow-graph-assignee-gate.test.ts: pure unit tests for assigneeGoverningStepKey (brief_taking→assign_designer_brief; kickoff_meeting & design_stage→design_initiation; assign_designer_brief, design_initiation, and any unrelated key → null). Do not import the DB-touching getStepAssigneeGate in the unit test — keep the test pure (import only the pure helper).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npx vitest run tests/lib/workflow-graph-assignee-gate.test.ts</automated>
  </verify>
  <done>getStepAssigneeGate + assigneeGoverningStepKey exist and are exported; authorizeStep rejects a non-assignee on brief_taking/kickoff_meeting/design_stage with 'assignee-mismatch' and passes through for null-gate steps; all 5 authorizeStep call sites pass projectId; the workflow/step page denies non-assignees; new unit test passes; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Fix the forcing modal + header switcher (the live bug)</name>
  <files>lib/workflow.ts, lib/my-work.ts, app/api/my-work/route.ts, app/(app)/layout.tsx, app/_components/header-project-switcher.tsx</files>
  <action>
In lib/workflow.ts: extend `ActiveProject` to `{ id: string; name: string; stepN: number; deadline: string | null; gatedToUserId: string | null }`. (This is pure type/data — lib/workflow.ts stays server-import-free.)

In lib/my-work.ts: change `getMyWork(role: UserRole)` to `getMyWork(role: UserRole, userId: string)`. Import getStepAssigneeGate from '@/lib/workflow-graph'. For each active project, resolve its current step via findStep(steps, p.currentStep); if that step exists and assigneeGoverningStepKey(step.key) is non-null, compute `gate = await getStepAssigneeGate('live', p.id, step.key)` (only do the DB lookup for gated steps — most active projects skip it), else gate = null. Emit `gatedToUserId: gate` on each activeProjects entry. In the `pending` filter, keep the existing canActOnGraphStep(step, role) check AND additionally exclude the project when `gate` is non-null and `gate !== userId`. Reuse the per-project gate value for both activeProjects and pending (compute once per project).

In app/api/my-work/route.ts: destructure `{ role, userId }` from verifySession() and call `getMyWork(role as UserRole, userId)`.

In app/(app)/layout.tsx: pass `session.user.id` to getMyWork as the second arg (`getMyWork(role as UserRole, session.user.id!)` — session.user.id is already fetched above); pass `viewerUserId={session.user.id!}` to <HeaderProjectSwitcher> alongside viewerRole.

In app/_components/header-project-switcher.tsx: add a `viewerUserId: string` prop. In both the `mine` (line ~57) and `youract` (line ~111) computations, AND the existing canActOnGraphStep(step, viewerRole) result with `(project.gatedToUserId === null || project.gatedToUserId === viewerUserId)` — i.e. a gated project is only "mine"/"your turn" when the viewer IS the assignee. PendingStepGate needs no change: it reads the now-filtered `pending`.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npx eslint lib/my-work.ts lib/workflow.ts app/api/my-work/route.ts "app/(app)/layout.tsx" app/_components/header-project-switcher.tsx</automated>
  </verify>
  <done>getMyWork takes (role, userId); pending excludes assignee-gated projects the caller isn't assigned to; each activeProject carries gatedToUserId; both getMyWork call sites pass userId; HeaderProjectSwitcher receives viewerUserId and gates mine/youract on it; tsc + eslint clean.</done>
</task>

<task type="auto">
  <name>Task 3: Full verification gate + read-only live-DB check</name>
  <files>scripts/verify-assignee-gate.ts</files>
  <action>
First re-confirm the governance mapping against the ACTUAL live DB (not just the seed file): query workflow_step_definitions for graph='live' ordered by orderIndex and confirm assign_designer_brief immediately precedes brief_taking with no other design-role step between, and design_initiation immediately precedes kickoff_meeting then design_stage. If the live order differs from ASSIGNEE_GATED_STEPS, STOP and report — do not ship a stale mapping.

CRITICAL — server-only shim (this script statically depends on lib/workflow-graph.ts, which begins with `import 'server-only'`; that package throws unconditionally when required outside Next's webpack build, so the script will crash on import unless you shim it first). Mirror the EXACT pattern already used by scripts/verify-live-workflow.ts (and scripts/verify-role-assignment.ts) at the very top of the file, BEFORE any other require/import that reaches into lib/:
  1. `import { config } from 'dotenv'; config({ path: '.env.local' })`.
  2. Install a `node:module` `_load` monkeypatch: grab `const NodeModule = require('node:module') as { _load: ... }`, save `originalLoad`, then reassign `NodeModule._load` so that `request === 'server-only'` returns `{}` (and, if you end up reaching into anything that calls next/cache, `request === 'next/cache'` returns `{ revalidatePath: () => {} }`), else delegate to `originalLoad.apply(this, [request, ...rest])`.
  3. Pull in the engine via a PLAIN `require` AFTER the patch is installed — `const wg = require('../lib/workflow-graph') as typeof import('../lib/workflow-graph')` — NOT a static `import`. This ordering is load-bearing: tsx's ESM→CJS transform hoists static imports above other top-level statements, which would run the throwing `require('server-only')` before the patch could apply. Copy the `// eslint-disable-next-line @typescript-eslint/no-require-imports` comments verbatim from verify-live-workflow.ts so lint stays clean.
  4. Everything else (neon/drizzle/schema) may use normal static imports.

Write scripts/verify-assignee-gate.ts as a READ-ONLY script (SELECT statements only — absolutely no INSERT/UPDATE/DELETE; this runs against the live production DB): (1) load the live step defs and assert the two governing→governed adjacencies above; (2) find any in-flight project currently sitting at brief_taking, kickoff_meeting, or design_stage (or, if none is live, pick a project that has a completed assignment row for assign_designer_brief/design_initiation) and print `wg.getStepAssigneeGate('live', projectId, stepKey)` alongside the assignedUserId recorded on the governing assignment step's workflow_step_states row, asserting they match; (3) assert getStepAssigneeGate returns null for a non-gated step key (e.g. 'invoice_upload'). Log a clear PASS/FAIL summary and exit non-zero on any mismatch.

Then run the full verification suite from the repo root.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint && npm test && npx tsx scripts/verify-assignee-gate.ts && npm run build</automated>
  </verify>
  <done>Live DB step order matches ASSIGNEE_GATED_STEPS; the read-only script (with the server-only shim, so it imports without crashing) confirms a real project's gated step resolves to the correct assignedUserId and that a non-gated step resolves to null; tsc, eslint, vitest, and next build all pass.</done>
</task>

</tasks>

<verification>
- Server boundary: a design/architect user who is not the assignee cannot complete brief_taking/kickoff_meeting/design_stage — authorizeStep returns 'assignee-mismatch' (Task 1). The assignment steps themselves and all non-gated steps are unaffected (null gate).
- Live bug: the forcing modal (via getMyWork pending filter) and header switcher (via gatedToUserId + viewerUserId) no longer surface an assignee-gated step to the wrong person (Task 2).
- Deferred (out of scope, documented in context): the projects board defense-in-depth — its factory_pm/site_pm viewers never match a design-role gate today, so it exposes no live bug; add gatedToUserId wiring only when a design-role board ships.
- Unaffected surfaces confirmed by the pre-planning sweep: admin/timeline, checklists/[slug], factory-pm/readiness, bypass, ack/dual-role — none changed.
- Full gate: tsc --noEmit, npm run lint, npm test, npm run build all pass; read-only live-DB script confirms correct assignee resolution (Task 3).
</verification>

<success_criteria>
- getStepAssigneeGate exists in lib/workflow-graph.ts and is the single source of the assignee restriction.
- authorizeStep enforces it (the non-negotiable security fix); 'assignee-mismatch' engine message present.
- getMyWork(role, userId) filters pending and emits gatedToUserId; header switcher gates its "mine" signal on the viewer's userId.
- No super_admin bypass introduced; canRoleActOnStep/canActOnGraphStep signatures unchanged.
- tsc, eslint, vitest, build pass; live-DB read-only verification passes.
</success_criteria>

<output>
Create `.planning/quick/260713-ekr-scope-non-assignment-design-architect-ro/260713-ekr-SUMMARY.md` when done.
</output>
