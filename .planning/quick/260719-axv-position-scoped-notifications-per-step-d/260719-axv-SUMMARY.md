---
quick_id: 260719-axv
status: complete
date: 2026-07-19
commits:
  - 2edf926 feat(notifications): position-scoped step-turn notifications replace the all-super-admin step broadcast; deadlines are strictly per-step
  - e105bb4 fix(audit): PDFs uploaded on workflow steps are now viewable from the timeline View page
---

# Summary — 260719-axv: user-report batch (2026-07-19)

1. **Position-scoped step notifications (2edf926).** New
   `notifyNextStepOfficers` (lib/workflow-graph.ts) fires on every project
   advancement (completeGraphStep + advanceProjectStep + confirmDualRoleStepAs)
   and notifies EXACTLY the officers able to act on the newly-pending step —
   assignee gate > requiredPosition holders (role-checked) > dual-role groups >
   role audience. In-app 'step_turn' rows (bell no-navigate type) + scoped
   email (stepTurnEmail/emailStepTurn). The every-step all-super-admin
   'task completed' email broadcast (d563856) is DELETED; only the one-time
   project-closeout digest still reaches every super admin.
2. **Strictly per-step deadlines (2edf926).** lib/my-work.ts currentDeadline
   no longer falls back to projects.deliveryDate — actors see their own step's
   deadline or none (forcing modal, header pill, countdown). Closeout
   met/missed judges only the final step's own deadline.
3. **Audit View completeness (e105bb4).** PDFs on workflow steps now
   download-viewable from /admin/projects/[id]/audit, strictly prefix-gated
   (data:application/pdf) so T-bpp-03's XSS guard holds; image thumbnails
   gain the download attr (top-frame data: navigation is browser-blocked).
   Live-verified: real project audit renders 28 rows / 11 image thumbnails /
   7 checklist submissions. No PDF uploads exist in live data yet — that
   branch is code-verified only.
4. **Users table full width (2edf926)** — w-full + table-fixed proportional
   columns + truncating email; measured zero horizontal overflow.
5. **'Factory PM' position** added to the live positions table (idempotent
   insert; DB-driven pickers show it immediately).
6. **Verified already-correct (no change):** per-checklist escalation flags
   (both fill surfaces, routing exactly per lib/escalation.ts incl. CPO
   'Obaji' for all factory roles) and mandatory sign-off upload
   (client + server).

Gates: 247 passed + 1 todo, tsc 0 errors, lint 0 errors.
