---
phase: quick-260713-bno
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(app)/admin/projects/new/page.tsx
  - app/(app)/admin/projects/new/new-project-form.tsx
  - actions/projects.ts
  - app/(app)/admin/dashboard/page.tsx
  - app/_components/sidebar-nav.tsx
autonomous: true
requirements: [STG-01]

must_haves:
  truths:
    - "Visiting /admin/projects/new no longer resolves to a page (route deleted)"
    - "The admin dashboard no longer shows a 'New Project' tile"
    - "The super_admin sidebar Projects group no longer shows a 'New Project' link"
    - "No dangling imports or references to createProjectAction / NewProjectForm / CreateProjectState remain in application code"
    - "tsc --noEmit, eslint, and npm run build all pass after the removal"
  artifacts:
    - path: actions/projects.ts
      provides: "Project server actions with createProjectAction (and its orphaned helpers) removed, createProjectIntentAction/setInvoiceTimelineAction/toggleProjectStatusAction/pauseProjectAction/resumeProjectAction retained"
      contains: "createProjectIntentAction"
  key_links:
    - from: "app/(app)/admin/dashboard/page.tsx"
      to: "TILES array"
      via: "no /admin/projects/new href"
      pattern: "admin/projects/new"
    - from: "app/_components/sidebar-nav.tsx"
      to: "super_admin NAV Projects group"
      via: "no /admin/projects/new item"
      pattern: "admin/projects/new"
---

<objective>
Remove the legacy `/admin/projects/new` page that let Operations / Super Admin create a project directly, bypassing Customer Care's intent step. This contradicts the v2.0 flow where Customer Care must create the project intent first (STG-01). Remove the page, its form component, the now-dead `createProjectAction` server action (and its helpers), the dashboard tile, and the sidebar nav link.

Purpose: Enforce the v2.0 intake flow — Operations discovers new projects via the existing My Work / dashboard mechanism once Customer Care creates the intent. No replacement UI needed.

Output: Deleted route + form, pruned `actions/projects.ts`, cleaned dashboard tile and sidebar link, all verified green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- What must survive the prune of actions/projects.ts. Do NOT touch these. -->

createProjectAction (lines ~41-113) is the ONLY consumer of these module-level helpers, so all four are removed together:
- `export type CreateProjectState` (line 37)
- `const FIVE_DAY_MAX_STEP_NS` (line 24)
- `const FIVE_DAYS_MS` (line 25)
- `function checkFiveDayCap(...)` (lines 27-35)

KEEP (used by other retained actions — removing them breaks the build):
- `async function triggerEntryAutoAssign(...)` — also called by createProjectIntentAction
- `FIRST_ACTION_STEP` import — used by createProjectIntentAction (currentStep) and triggerEntryAutoAssign
- Every other import (getLiveWorkflowSteps, getGraphSteps, autoAssignIfConfigured, projectStepDeadlines, projectStepCompletions, advanceProjectStep, revalidateProjectBoards, etc.) — still referenced by setInvoiceTimelineAction / pauseProjectAction / createProjectIntentAction
- All other exported actions: createProjectIntentAction, setInvoiceTimelineAction, toggleProjectStatusAction, pauseProjectAction, resumeProjectAction

The `customer_care` sidebar entry `/customer-care/projects/new` is the correct v2.0 replacement — DO NOT remove it. Only the `super_admin` group's `/admin/projects/new` item (line 38) is removed.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reference audit, then delete the legacy route and prune the dead server action</name>
  <files>app/(app)/admin/projects/new/page.tsx, app/(app)/admin/projects/new/new-project-form.tsx, actions/projects.ts</files>
  <action>
First, audit the whole trt-pm codebase for every reference to the artifacts being removed, so nothing is left dangling. Run a grep across the repo (excluding node_modules, .next, .git, and .planning — .planning is historical docs, not built code) for the tokens `/admin/projects/new`, `createProjectAction`, `NewProjectForm`, `new-project-form`, and `CreateProjectState`. Confirm the only application-code hits are the five files in this plan's files_modified list. If any OTHER application file references these tokens, stop and surface it rather than deleting blindly.

Then delete the entire legacy route directory `app/(app)/admin/projects/new/` (both `page.tsx` and `new-project-form.tsx`) — use `git rm` on both files.

Then edit `actions/projects.ts` to remove the now-orphaned `createProjectAction` server action and its exclusive helpers: the exported `CreateProjectState` type, `FIVE_DAY_MAX_STEP_NS`, `FIVE_DAYS_MS`, and `checkFiveDayCap`. Preserve `triggerEntryAutoAssign` (shared with createProjectIntentAction), the `FIRST_ACTION_STEP` import, and every other export and import — do not remove any import that is still referenced by a retained action (see the &lt;interfaces&gt; block). After editing, ensure no import in the file is left unused (eslint will catch it in Task 2, but prune obvious ones now).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && test ! -e "app/(app)/admin/projects/new" && ! grep -rn "createProjectAction\|NewProjectForm\|CreateProjectState" --include="*.ts" --include="*.tsx" app actions lib db && grep -q "createProjectIntentAction" actions/projects.ts && grep -q "triggerEntryAutoAssign" actions/projects.ts && echo PRUNE_OK</automated>
  </verify>
  <done>The `app/(app)/admin/projects/new/` directory is gone; `actions/projects.ts` no longer defines createProjectAction / CreateProjectState / checkFiveDayCap / FIVE_DAY_MAX_STEP_NS / FIVE_DAYS_MS but still exports createProjectIntentAction and the other four retained actions and keeps triggerEntryAutoAssign.</done>
</task>

<task type="auto">
  <name>Task 2: Remove the dashboard tile and sidebar link, then verify green</name>
  <files>app/(app)/admin/dashboard/page.tsx, app/_components/sidebar-nav.tsx</files>
  <action>
In `app/(app)/admin/dashboard/page.tsx`, remove the `TILES` entry whose `href` is `/admin/projects/new` (the `{ title: 'New Project', ... }` object, line ~11). Leave the rest of the TILES array intact.

In `app/_components/sidebar-nav.tsx`, remove the single item `{ href: '/admin/projects/new', icon: 'add_box', label: 'New Project' }` from the `super_admin` NAV entry's `Projects` group (line ~38). Leave the Timeline and Approvals items in that group, and leave the `customer_care` group's `/customer-care/projects/new` item untouched.

Then run the full verification suite from the trt-pm root: `npx tsc --noEmit`, `npm run lint`, and `npm run build`. All three must pass with zero errors. If eslint flags a now-unused import in `actions/projects.ts` from Task 1, remove it and re-run.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && ! grep -rn "admin/projects/new" --include="*.ts" --include="*.tsx" app actions lib db && npx tsc --noEmit && npm run lint && npm run build && echo VERIFY_OK</automated>
  </verify>
  <done>No application code references `/admin/projects/new`; the admin dashboard TILES array and super_admin sidebar Projects group no longer contain a New Project entry; tsc --noEmit, eslint, and next build all pass.</done>
</task>

</tasks>

<verification>
- `test ! -e "app/(app)/admin/projects/new"` — route directory deleted
- Repo-wide grep (excluding node_modules/.next/.git/.planning) for `/admin/projects/new`, `createProjectAction`, `NewProjectForm`, `CreateProjectState` returns no application-code hits
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npm run build` passes
</verification>

<success_criteria>
- Legacy `/admin/projects/new` page and form deleted
- `createProjectAction` and its exclusive helpers removed from `actions/projects.ts`; all other actions retained and compiling
- Dashboard "New Project" tile removed
- Super_admin sidebar "New Project" link removed (customer_care's own New Project link untouched)
- tsc, eslint, and build all green
</success_criteria>

<output>
Create `.planning/quick/260713-bno-remove-the-legacy-admin-projects-new-pag/260713-bno-SUMMARY.md` when done
</output>
