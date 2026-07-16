---
phase: quick-260716-hgy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/_components/confetti-burst.ts
  - app/_components/workflow-kinds/yes-no-upload-step.tsx
  - app/(app)/workflow/step/page.tsx
autonomous: true
requirements: [QUICK-260716-hgy]
must_haves:
  truths:
    - "Completing the sign_off step (the final step) successfully fires a GSAP confetti burst client-side"
    - "The success message for sign_off reads as project delivery, not the generic step-completed text"
    - "No other yes_no_upload step (e.g. invoice_upload/payment_confirmation wizard) shows confetti or the delivery message"
    - "Confetti fires only on real completion success, never on failure or validation error"
    - "The confetti container is removed from the DOM after the animation completes (no leaked nodes)"
  artifacts:
    - path: "app/_components/confetti-burst.ts"
      provides: "Self-contained gsap-based fireConfetti() burst with DOM lifecycle cleanup"
      exports: ["fireConfetti"]
    - path: "app/_components/workflow-kinds/yes-no-upload-step.tsx"
      provides: "celebrateOnComplete prop wiring confetti + delivery message into both success paths"
      contains: "celebrateOnComplete"
    - path: "app/(app)/workflow/step/page.tsx"
      provides: "Passes celebrateOnComplete={step!.key === 'sign_off'} on the plain yes_no_upload branch only"
      contains: "celebrateOnComplete"
  key_links:
    - from: "app/(app)/workflow/step/page.tsx"
      to: "YesNoUploadStep celebrateOnComplete prop"
      via: "step!.key === 'sign_off'"
      pattern: "celebrateOnComplete=\\{step!\\.key === 'sign_off'\\}"
    - from: "app/_components/workflow-kinds/yes-no-upload-step.tsx"
      to: "app/_components/confetti-burst.ts"
      via: "fireConfetti() called in both submit() and complete() success branches when celebrateOnComplete"
      pattern: "fireConfetti\\(\\)"
---

<objective>
Add a GSAP-based confetti celebration that fires client-side the moment the final workflow step (`stepKey: 'sign_off'`) completes successfully — the completion that flips `projects.status` to `'delivered'`. Purely additive, client-side visual delight keyed off data already present in the existing render path.

Purpose: Give the Site PM a clear, satisfying "project delivered" moment, replacing the generic step-completed confirmation for this one milestone step.
Output: New `app/_components/confetti-burst.ts` (or `.tsx`), a `celebrateOnComplete` prop wired through `yes-no-upload-step.tsx`, and a one-line change in `workflow/step/page.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Confirmed via source read — executor should use these directly, no exploration needed. -->

YesNoUploadStep current props (app/_components/workflow-kinds/yes-no-upload-step.tsx):
```typescript
{
  projectId: string
  stepDefId: string
  redirectTo?: string
  completeOnSubmit?: boolean  // default true
}
```
- `REDIRECT_DELAY_MS = 1400` — success message stays this long before router.push(redirectTo).
- Success pattern (appears in BOTH submit() completeRes.ok branch AND complete() res.ok branch):
  `setMessage(`✓ Step completed.${redirectTo ? ' Redirecting…' : ''}`)` → `setOk(true)` → `scheduleRedirect()`.

Server render dispatch (app/(app)/workflow/step/page.tsx, ~line 171, inside `async function renderKind(kind: StepKind)`):
```tsx
case 'yes_no_upload':
  return <YesNoUploadStep projectId={projectId!} stepDefId={step!.id} redirectTo={dashboard} />
```
- `step` is an already-resolved `GraphStep` with a `.key` field (from getStepByKey) — no extra fetch needed.
- OTHER call site (line 153, invoice/payment 2-phase wizard) passes `completeOnSubmit={false}` — MUST remain untouched; it must not receive celebrateOnComplete (defaults false).

gsap is already installed (`gsap@^3.15.0`), imported as `import gsap from 'gsap'`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build confetti burst + wire celebrateOnComplete through the render path</name>
  <files>app/_components/confetti-burst.ts, app/_components/workflow-kinds/yes-no-upload-step.tsx, app/(app)/workflow/step/page.tsx</files>
  <action>
Create `app/_components/confetti-burst.ts` exporting a single plain function `fireConfetti(): void` (no React needed — a plain TS module keeps it simplest). It must: (a) create a temporary `<div>` appended to `document.body` styled fixed/full-viewport, `pointer-events: none`, high `z-index`, `overflow: hidden`, so it renders above everything and never blocks clicks; (b) spawn ~40-60 small colored square `<div>` pieces near the top-center of the viewport using a small varied palette (reuse the app brand palette if trivially discoverable in globals CSS / Tailwind theme, otherwise a simple 4-6 color array — this is a minor visual detail); (c) use `import gsap from 'gsap'` to animate each piece falling downward with randomized horizontal drift, rotation, slight stagger, and fade-out near the end, total duration ~1.5-2.5s; (d) use a `gsap.timeline({ onComplete })` (or onComplete on a representative tween) to remove the temporary container from the DOM when the animation finishes — no leaked nodes across repeated calls. Only gsap + plain DOM APIs; add NO new npm dependency. A `typeof document === 'undefined'` early return is optional — this is only ever called from an event handler in a `'use client'` component, so a guard is not strictly needed; add one only if it matches an existing `app/_components/` client-component convention (do not over-engineer).

In `app/_components/workflow-kinds/yes-no-upload-step.tsx`: add a new optional prop `celebrateOnComplete?: boolean` (default `false` in the destructure — existing callers must not need to pass it). Import `fireConfetti` from `../confetti-burst`. In BOTH success branches — `submit()`'s `completeRes.ok` branch AND `complete()`'s `res.ok` branch — when (and only when) `celebrateOnComplete` is true: call `fireConfetti()` right where `setOk(true)` is set (before `scheduleRedirect()`), and set the message to `🎉 Project delivered!${redirectTo ? ' Redirecting…' : ''}` instead of the generic `✓ Step completed.…`. Keep the generic message and behavior byte-for-byte for the non-celebrating case. Do NOT call fireConfetti on any failure branch, the `!completeOnSubmit` "✓ Recorded." branch, or validation errors.

In `app/(app)/workflow/step/page.tsx`: change ONLY the plain `case 'yes_no_upload':` branch (~line 171) to pass `celebrateOnComplete={step!.key === 'sign_off'}` alongside the existing props. Leave the invoice/payment wizard `<YesNoUploadStep ... completeOnSubmit={false} />` call site (~line 153) and every other call site completely untouched — they default celebrateOnComplete to false.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>fireConfetti exists as a gsap-only self-cleaning burst; celebrateOnComplete flows page.tsx (sign_off only) → YesNoUploadStep → fireConfetti in both success paths with the delivery message; the invoice/payment call site is unchanged; tsc passes.</done>
</task>

<task type="auto">
  <name>Task 2: Typecheck + lint verification</name>
  <files></files>
  <action>Run the project's typecheck and lint over the changed files. Fix any type or lint errors introduced by Task 1. No new test file is required (pure visual effect, no business logic); the sole logic — `step!.key === 'sign_off'` — is covered by the typecheck and is self-evidently correct from the diff. Do a final diff review to confirm: no other `<YesNoUploadStep>` call site changed, no new dependency added to package.json, confetti container cleanup is present (onComplete removes the node), and fireConfetti is never called on a failure/validation/`✓ Recorded.` branch.</action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>tsc --noEmit and npm run lint both pass clean; diff review confirms scope boundaries (single page.tsx branch, no new deps, DOM cleanup present, no confetti on failure paths).</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- `git diff --stat` shows exactly the three intended files (plus this plan); `package.json`/lockfile unchanged.
- Manual sanity (optional): grep confirms `celebrateOnComplete` appears on only the one page.tsx branch and `fireConfetti()` is inside `if (celebrateOnComplete)`-guarded success blocks only.
</verification>

<success_criteria>
- Completing the sign_off step successfully triggers a visible GSAP confetti burst and a "🎉 Project delivered!" message.
- No other yes_no_upload step shows confetti or the delivery message.
- Confetti never fires on failure, validation error, or the `✓ Recorded.` (completeOnSubmit=false) path.
- The confetti DOM container is removed after the animation; no leaked nodes on repeat.
- No new npm dependency added; only gsap + plain DOM used.
- tsc and lint pass.
</success_criteria>

<output>
Create `.planning/quick/260716-hgy-add-a-confetti-celebration-when-a-projec/260716-hgy-SUMMARY.md` when done
</output>
