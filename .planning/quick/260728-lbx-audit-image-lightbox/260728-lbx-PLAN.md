---
phase: quick-260728-lbx
plan: 01
type: execute
wave: 1
depends_on: [quick-260714-bpp, quick-260716-hys]
files_modified:
  - lib/audit-assets.ts
  - tests/lib/audit-assets.test.ts
  - app/_components/audit-asset-gallery.tsx
  - app/(app)/admin/projects/[id]/audit/page.tsx
autonomous: true
requirements: [LBX-01-lightbox, LBX-02-uncropped-thumbnails, LBX-03-preserve-T-bpp-03]

must_haves:
  truths:
    - "A super admin clicking any image asset on the project audit page sees that image full-size in an in-page overlay instead of the browser downloading the file."
    - "Every image asset on the page (step upload, checklist photo, readiness photo, readiness signature, readiness legacy scan) is openable in that overlay."
    - "Thumbnails show the whole asset unclipped — a wide drawing or a tall document is legible at thumbnail size, not centre-cropped to a square."
    - "The overlay closes on Escape, on backdrop click, and via a visible close button."
    - "The overlay names the asset and its step/submission context so an auditor knows what they are looking at."
    - "A download of the original file is still available from inside the overlay — the capability that existed before is not lost."
    - "A PDF or any other non-image asset behaves exactly as it did before: PDF renders as a download link, anything else renders as filename text, and neither becomes lightbox-openable."
  artifacts:
    - path: "lib/audit-assets.ts"
      provides: "Pure, DB-free asset helpers: AuditAsset type, isImageAsset strict data:image/ prefix gate, imageAssetsOnly filter"
      contains: "isImageAsset"
      min_lines: 25
    - path: "tests/lib/audit-assets.test.ts"
      provides: "Unit coverage for the prefix gate incl. hostile data:text/html and data:image-lookalike inputs"
      contains: "data:text/html"
    - path: "app/_components/audit-asset-gallery.tsx"
      provides: "'use client' thumbnail strip + full-size lightbox overlay with keyboard/backdrop close, download link, prev/next"
      contains: "'use client'"
      min_lines: 80
    - path: "app/(app)/admin/projects/[id]/audit/page.tsx"
      provides: "Server component wiring all five image sites through the gallery while preserving PDF/non-image branches verbatim"
      contains: "AuditAssetGallery"
  key_links:
    - from: "app/(app)/admin/projects/[id]/audit/page.tsx"
      to: "app/_components/audit-asset-gallery.tsx"
      via: "AuditAssetGallery imported and passed already-loaded data URLs as props"
      pattern: "AuditAssetGallery"
    - from: "app/_components/audit-asset-gallery.tsx"
      to: "lib/audit-assets.ts"
      via: "isImageAsset gate before any thumbnail becomes clickable"
      pattern: "isImageAsset"
---

<objective>
Project audit assets currently render as tiny centre-cropped thumbnails, and clicking one downloads the file instead of showing it. Replace that with an in-page lightbox: click any image asset and it opens full-size in an overlay, labelled with its step context, closable by Escape/backdrop/button, with a download link preserved inside.

Purpose: a super admin auditing a project must be able to actually READ the evidence (drawings, signed approval docs, site photos) in the app. Today a drawing renders as an unreadable red square and an approval document as a 64px sliver.

Output: one new pure helper module + unit test, one new `'use client'` gallery/lightbox component, and the audit page rewired to use it at all five image sites.

Non-goals (do NOT do these):
- Do NOT add new data sources. Asset coverage is already complete — `lib/project-audit.ts` reads `workflowStepStates.uploadData`, `checklists.photoData`, and `readinessForms.signatureData`/`.uploadData`/`.photoData`. The `attachments` table is unused by this flow and has 0 rows. This is a rendering problem, not a loading problem.
- Do NOT change `lib/project-audit.ts` queries or return shape.
- Do NOT convert the audit page to a client component. It is and stays a server component.
- Do NOT weaken any non-image handling.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@AGENTS.md

@app/(app)/admin/projects/[id]/audit/page.tsx
@lib/project-audit.ts
@app/_components/escalation-amend-panel.tsx
@app/_components/pending-step-gate.tsx
@app/_components/schedule-call-form.tsx
@tests/lib/project-audit.test.ts

<interfaces>
<!-- Contracts the executor needs. Do NOT go exploring for these. -->

From lib/project-audit.ts (READ-ONLY for this task — shapes already delivered to the page):

  export type AuditUpload = {
    dataUrl: string
    name: string | null
    isImage: boolean          // already computed as dataUrl.startsWith('data:image/')
  }

  export type AuditChecklistSubmission = {
    definitionTitle: string
    submittedBy: string | null
    submittedAt: Date | null
    items: AuditChecklistItem[]
    photos: string[]          // raw data URLs
  }

  export type AuditReadinessSubmission = {
    mode: string
    submittedBy: string | null
    submittedAt: Date
    confirmedBy: string | null
    signedDate: string | null
    signatureData: string | null   // data URL or null
    uploadData: string | null      // data URL or null ("legacy upload")
    uploadName: string | null
    photos: string[]               // raw data URLs
  }

  export type AuditRow = {
    n: number
    key: string
    label: string
    // ...
    upload: AuditUpload | null
    checklistSubmissions: AuditChecklistSubmission[]
    readinessSubmissions: AuditReadinessSubmission[]
  }

Existing modal conventions in this repo (follow these, do not invent a new one):
- Overlay shell: `<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={close}>` with an inner panel using `onClick={(e) => e.stopPropagation()}` — see pending-step-gate.tsx:96-102 and schedule-call-form.tsx:88-92.
- Escape handling: `useEffect` registering a `document.addEventListener('keydown', ...)` that checks `e.key === 'Escape'`, with cleanup — see pending-step-gate.tsx:70-78.
- Icons: `<span className="material-symbols-outlined">close</span>` (already loaded globally).
- Inline `<img>` with a data URL requires `{/* eslint-disable-next-line @next/next/no-img-element */}` on the line above (next/image cannot take data URLs here).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure asset helpers + unit tests</name>
  <files>lib/audit-assets.ts, tests/lib/audit-assets.test.ts</files>
  <behavior>
    isImageAsset(dataUrl):
    - 'data:image/png;base64,AAA' -> true
    - 'data:image/jpeg;base64,AAA' -> true
    - 'data:image/svg+xml;base64,AAA' -> true (still an <img> src; never navigated to)
    - 'data:application/pdf;base64,AAA' -> false
    - 'data:text/html;base64,AAA' -> false
    - 'data:text/html,<script>alert(1)</script>' -> false
    - 'DATA:IMAGE/PNG;base64,AAA' -> false (gate is a strict, case-sensitive literal prefix — do not lowercase, do not regex loosely)
    - ' data:image/png;base64,AAA' (leading space) -> false (do not trim)
    - 'https://evil.example/x.png' -> false
    - '' -> false
    - null / undefined -> false

    imageAssetsOnly(assets):
    - returns only entries whose dataUrl passes isImageAsset, preserving input order
    - empty input -> empty array
  </behavior>
  <action>
Create `lib/audit-assets.ts` — a PURE, dependency-free module (no 'server-only', no React, no DB) so it can be imported by both the server page and the client component and unit-tested directly, mirroring how `assembleAuditRows` in lib/project-audit.ts is kept pure and tested.

Export:
- `export type AuditAsset = { dataUrl: string; label: string; context?: string; downloadName?: string }` — `label` is what the asset IS ("Checklist photo 2", "Signature", "Step upload"), `context` is where it came from ("Step 15 — Production Process"), `downloadName` is the filename for the download link (fall back to a derived name at the call site when the DB has none).
- `export function isImageAsset(dataUrl: string | null | undefined): boolean` — returns `dataUrl != null && dataUrl.startsWith('data:image/')`. Nothing more. No trimming, no case folding, no regex.
- `export function imageAssetsOnly(assets: AuditAsset[]): AuditAsset[]` — `assets.filter((a) => isImageAsset(a.dataUrl))`.

Write a dense why-comment above `isImageAsset` recording the security rationale (quick task 260728-lbx, threat T-bpp-03): this strict literal prefix is the ONLY thing that decides whether an asset becomes interactive. Explain that (a) it must stay case-sensitive and untrimmed because any normalisation widens what counts as an image, and (b) a passing asset is only ever rendered as an `<img src>` inside the app's own document — never as an `href` the browser navigates to — because a `data:text/html` document opened in the top frame would execute as the app origin, whereas an `<img>` cannot execute script regardless of payload.

Create `tests/lib/audit-assets.test.ts` covering every case in <behavior>, following the existing vitest style in tests/lib/project-audit.test.ts (plain `describe`/`it`/`expect`, no jsdom pragma needed — this module is pure).
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx vitest run tests/lib/audit-assets.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>All listed cases pass. `lib/audit-assets.ts` imports nothing. `npx tsc --noEmit` is clean.</done>
</task>

<task type="auto">
  <name>Task 2: AuditAssetGallery client component (thumbnails + lightbox)</name>
  <files>app/_components/audit-asset-gallery.tsx</files>
  <action>
Create `app/_components/audit-asset-gallery.tsx`, a `'use client'` component. It receives ALREADY-LOADED data URLs as props from the server page — it must not fetch, and the page must not become a client component.

Props:
  { assets: AuditAsset[]; thumbClassName?: string }
`thumbClassName` lets a caller size a thumbnail differently (the step-upload cell is smaller than a photo strip). Default it to `'h-24 w-24'`.

Rendering — thumbnail strip:
- Compute `const images = imageAssetsOnly(assets)` ONCE at the top (from '@/lib/audit-assets'). Render nothing (`return null`) when `images.length === 0`.
- IMPORTANT: index the lightbox against `images`, not `assets`. Non-image entries are dropped here and are re-rendered by the caller (the audit page) in their existing non-clickable form — this component never renders a non-image asset at all.
- Each thumbnail is a real `<button type="button">` (keyboard-focusable, Enter/Space activate for free, correct semantics now that it is interactive) wrapping an `<img>`:
  - img classes: `${thumbClassName} rounded-md border border-gray-200 bg-gray-50 object-contain` — `object-contain` (NOT `object-cover`) so a non-square asset is shown whole, with the neutral `bg-gray-50` filling the letterbox.
  - button classes: add a hover affordance, e.g. `group relative rounded-md transition hover:opacity-90 hover:ring-2 hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`.
  - `title` and the img `alt` both come from the asset's `label` (plus `context` when present).
- Wrap the strip in `<div className="flex flex-wrap gap-2">`.

Rendering — lightbox overlay (only when `openIndex !== null`):
- State: `const [openIndex, setOpenIndex] = useState<number | null>(null)`.
- Shell follows the repo convention exactly: `<div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 p-4" onClick={close}>` with an inner container using `onClick={(e) => e.stopPropagation()}`. Use z-[70] so it sits above pending-step-gate's z-[60].
- The image: `<img src={current.dataUrl} alt={current.label} className="max-h-[85vh] max-w-[90vw] rounded-md object-contain" />`.
- Header/caption bar inside the panel: the asset's `label` in bold and its `context` in a lighter line, plus a close button (`material-symbols-outlined` `close`) with `aria-label="Close"`.
- Download link inside the overlay, preserving the existing capability: `<a href={current.dataUrl} download={current.downloadName ?? current.label} rel="noreferrer">Download original</a>`. This is the SAME `<a download>` mechanism the page already used — no new navigation surface.
- Prev/next: render only when `images.length > 1`. Two buttons (`chevron_left` / `chevron_right`) that move `openIndex` within `images`, wrapping around, plus an "n of N" counter. Also bind ArrowLeft/ArrowRight in the same keydown effect.
- Keydown effect: one `useEffect` gated on `openIndex !== null`, registering `document.addEventListener('keydown', ...)` handling Escape (close), ArrowLeft, ArrowRight; cleanup on unmount/close — mirror pending-step-gate.tsx:70-78.

Comments to write (dense, why-focused, tagged `quick task 260728-lbx`):
1. Above the overlay `<img>`: the security reasoning verbatim in spirit — rendering `<img src="data:image/...">` inside the app's own document is safe because an `<img>` cannot execute script; the original `<a download>` existed because browsers BLOCK top-frame navigation to `data:` URLs and a `data:text/html` upload opened in a tab would execute as the app origin (T-bpp-03). The lightbox therefore satisfies "let me see the image" without ever navigating to a data: URL, so T-bpp-03 is preserved, not relaxed.
2. Above the `imageAssetsOnly` call: only `data:image/` assets ever reach this component's interactive path; PDFs and anything else stay in the caller's non-clickable branches.
3. Above `object-contain`: why the swap from `object-cover` — cover centre-crops a wide drawing to a meaningless coloured square, which is exactly the reported bug.

Do NOT add any dependency. No portal library, no focus-trap library — this is a small in-page overlay consistent with the four existing modals in this repo.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>Component compiles and lints clean (including the required `@next/next/no-img-element` disable comments). It imports `isImageAsset`/`imageAssetsOnly` from '@/lib/audit-assets' and adds no new package.</done>
</task>

<task type="auto">
  <name>Task 3: Wire the gallery into all five audit-page image sites</name>
  <files>app/(app)/admin/projects/[id]/audit/page.tsx</files>
  <action>
Rewire the audit page (still a server component, still `export const dynamic = 'force-dynamic'`, still `await params` + `requireRole('super_admin')` — do not touch those) so every image site renders through `AuditAssetGallery`. Import `AuditAssetGallery` and the `AuditAsset` type.

Thread step context so the lightbox caption is meaningful. `ChecklistSubmissionDetails` and `ReadinessSubmissionDetails` are currently called from `AuditTableRow`, which has `row.n` and `row.label` in hand — add a `stepContext: string` prop to both, passed as `` `Step ${row.n} — ${row.label}` ``. Do NOT change `lib/project-audit.ts` to carry a label; the page already has it.

Five sites:

1. ChecklistSubmissionDetails photos (currently lines ~35-47, `h-20 w-20 object-cover`): build
   `submission.photos.map((src, i) => ({ dataUrl: src, label: \`Checklist photo ${i + 1}\`, context: \`${stepContext} · ${submission.definitionTitle}\`, downloadName: \`checklist-photo-${i + 1}\` }))`
   and render `<AuditAssetGallery assets={...} thumbClassName="h-24 w-24" />`. Delete the inline `<img>` map.

2. ReadinessSubmissionDetails signature (currently ~69-79, `h-20 w-40 object-contain`): keep its "Signature" label paragraph, render a single-asset gallery with `label: 'Signature'`, `context: stepContext`, `downloadName: 'signature'`, `thumbClassName="h-20 w-40"`.

3. ReadinessSubmissionDetails legacy upload (currently ~80-97): keep the `legacyUploadIsImage` branch structure, but replace the local `startsWith` check with `isImageAsset(submission.uploadData)` from '@/lib/audit-assets' so ONE gate governs the whole page. Image branch -> single-asset gallery (`label: submission.uploadName ?? 'Legacy upload'`, `context: stepContext`, `downloadName: submission.uploadName ?? 'upload'`, `thumbClassName="h-24 w-24"`). The else branch — the filename-text-only span AND its T-bpp-03 comment (lines 91-93) — must be preserved BYTE-FOR-BYTE.

4. ReadinessSubmissionDetails photos (currently ~98-110): same treatment as site 1, `label: \`Readiness photo ${i + 1}\``, `context: stepContext`.

5. UploadCell (currently ~116-150): keep the function's exact branch order and both existing security comments.
   - `if (upload.isImage)`: replace the `<a href download><img object-cover></a>` with a single-asset `<AuditAssetGallery assets={[{ dataUrl: upload.dataUrl, label: upload.name ?? 'Uploaded file', context: stepContext, downloadName: upload.name ?? 'upload' }]} thumbClassName="h-20 w-20" />`. UpdateCell needs `stepContext` too — add it as a second prop, passed from `AuditTableRow`. Rewrite the comment at lines 119-122: it currently justifies `download` on the thumbnail; it must now explain that the thumbnail OPENS a lightbox (an `<img>` in this document, which cannot execute script) while the download link moved INSIDE the lightbox, and that top-frame navigation to a data: URL is still never performed (T-bpp-03 intact).
   - The `data:application/pdf` branch (lines 136-147) and its comment: UNCHANGED, byte-for-byte.
   - The final filename-only fallback (lines 148-149) and its comment: UNCHANGED, byte-for-byte.

Verify no `object-cover` remains anywhere in this file and no `<a href={...dataUrl}` remains outside the PDF branch.
  </action>
  <verify>
    <automated>cd /Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm && grep -c 'object-cover' 'app/(app)/admin/projects/[id]/audit/page.tsx' | grep -qx 0 && grep -q 'T-bpp-03' 'app/(app)/admin/projects/[id]/audit/page.tsx' && grep -c 'data:application/pdf' 'app/(app)/admin/projects/[id]/audit/page.tsx' | grep -qx 1 && npx tsc --noEmit && npm run lint && npm test</automated>
  </verify>
  <done>`npx tsc --noEmit` clean, `npm run lint` clean, `npm test` green with at least the prior 346 passing plus the Task 1 additions. No `object-cover` in the audit page; the PDF branch, the two non-image fallbacks, and every T-bpp-03 comment still present.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| stored upload -> super-admin browser | `uploadData`/`photoData`/`signatureData` are data URLs originally supplied by a PM's file picker. Their MIME prefix is attacker-influenced content rendered back into an admin's session. |
| client component props | The audit page (server) hands raw data URLs to a `'use client'` component; the component decides what becomes interactive. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bpp-03 (inherited) | Elevation of Privilege | audit page asset rendering | mitigate | Strict, case-sensitive `data:image/` literal prefix gate in `isImageAsset` (lib/audit-assets.ts) is the sole thing that makes an asset interactive; a passing asset is only ever an `<img src>` inside the app document, never an `href` the top frame navigates to. A `data:text/html` payload can therefore never execute as the app origin. Unit-tested against `data:text/html`, uppercase-prefix, and leading-whitespace lookalikes. |
| T-lbx-01 | Elevation of Privilege | AuditAssetGallery download link | mitigate | The in-overlay download link uses the SAME `<a download>` mechanism already shipped (browser saves the file, does not navigate/render it) and is only reachable for assets that already passed the image gate. No new navigation surface. |
| T-lbx-02 | Tampering | non-image branches (PDF, filename fallback) | mitigate | Both branches and their existing security comments are preserved byte-for-byte; Task 3's automated gate asserts exactly one `data:application/pdf` occurrence and the continued presence of the T-bpp-03 comment. |
| T-lbx-03 | Information disclosure | lightbox caption / alt text | accept | `label`/`context` are constructed server-side from step number, step label, and checklist definition title already rendered on the same page — no new data reaches the client, and React escapes them as text nodes. |
| T-lbx-SC | Tampering | npm/pip/cargo installs | n/a (accept) | This task installs NO packages — no portal, focus-trap, or lightbox dependency. The Package Legitimacy Gate is not triggered. If an executor finds itself reaching for a dependency, stop and re-read Task 2. |
</threat_model>

<verification>
Full gate, run from `/Users/uzochukwuamara/Code/PayMeBlue/trt-project-manager/trt-pm`:

```
npx tsc --noEmit
npm run lint
npm test
```

Baseline is 346 passing; expect that plus the new `tests/lib/audit-assets.test.ts` cases. Do not unit-test the gallery UI — this repo does not test server/client components (jsdom is used only for the TabSessionProvider suite).

Security regression greps on `app/(app)/admin/projects/[id]/audit/page.tsx`:
- `grep -c 'object-cover'` -> 0
- `grep -c 'data:application/pdf'` -> 1 (PDF branch intact)
- `grep -c 'T-bpp-03'` -> unchanged or higher (comments preserved)

Manual check (optional, orchestrator's call): sign in as a super admin, open `/admin/projects/{id}/audit` for a project with a drawing upload and checklist photos. Confirm the thumbnails show whole images, clicking opens the overlay full-size with a caption, Escape/backdrop/close all dismiss it, arrows move between photos in the same submission, and the PDF row still downloads exactly as before.
</verification>

<success_criteria>
- Clicking any image asset on the audit page opens a full-size in-page overlay; nothing downloads on that click.
- All five image sites (step upload, checklist photos, readiness photos, readiness signature, readiness legacy scan) are lightbox-openable.
- Thumbnails use `object-contain` over a neutral background; zero `object-cover` remains in the audit page.
- Overlay closes on Escape, backdrop click, and the close button; arrows navigate within the same submission group when more than one image is present.
- A "Download original" link is reachable inside the overlay.
- PDF and other non-image assets are byte-for-byte unchanged, including their comments; `isImageAsset` is the single gate and is unit-tested against hostile lookalikes.
- `npx tsc --noEmit`, `npm run lint`, `npm test` all green.
- `lib/project-audit.ts` diff is empty.
</success_criteria>

<output>
Create `.planning/quick/260728-lbx-audit-image-lightbox/260728-lbx-SUMMARY.md` when done.
</output>
