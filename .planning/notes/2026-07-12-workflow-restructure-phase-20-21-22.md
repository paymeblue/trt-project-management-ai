---
date: "2026-07-12 21:41"
promoted: false
---

Workflow restructure spec — supersedes assumptions baked into Phase 20/21/22 (STG-01..14, PAY-02) in ROADMAP.md/REQUIREMENTS.md as of 2026-07-12. User-confirmed final ("its fine") after two rounds of correction in chat. NOT YET applied to ROADMAP.md/REQUIREMENTS.md or the live graph — capture only. Whoever plans/executes Phase 20/21/22 next MUST read this before trusting the current STG-01..14 wording, which is stale on several points (step 9/10 area, the merged invoice+timeline step, the Materials/Delivery Readiness dual-role merge, and the Installation Readiness removal).

Live graph baseline this was checked against: 23 steps in `workflow_step_definitions` (graph='live'), checked 2026-07-12. Phase 21/22 have not been planned or executed yet (no phase dirs, no plans).

## Final reconciled 23-step sequence (post-restructure)

| # | Step | Role | Change from current live graph |
|---|---|---|---|
| 1 | Project Intent | customer_care | unchanged |
| 2 | Assign Designer/Architect for Brief | design (head_designer) | unchanged — deadline auto-set at project creation, +1 day |
| 3 | Brief Taking | design | unchanged — deadline auto-set at project creation, +2 days |
| 4 | **Invoice & Timeline** (merged, 2-part wizard) | **head_of_operations** | MERGES current live steps `invoice_upload` (4, was customer_care) + `invoice_timeline` (5, operations). New: ONE step, ONE submit, performed entirely by Head of Operations: part 1/2 = upload invoice, part 2/2 = timeline UI listing all remaining steps needing a deadline (excludes steps 2 & 3, already auto-set). Deadline for step 4 itself is the "Invoicing 2 days" one — auto-set at project creation same as 2 & 3. |
| 5 | Design Initiation | design (head_designer) | was live step 6 |
| 6 | Kickoff Meeting | design | was live step 7 |
| 7 | Design Stage | design | was live step 8 |
| 8 | **Assign PM to Project** | **super_admin, requiredPosition: head_of_projects** | NEW. Assigns the Site PM who later confirms at step 10. |
| 9 | **Print Confirmation Document** | operations (Operations Admin), **yes/no + upload** | NEW — replaces current live step `ops_design_confirmation` ("Operations Confirmation (Design Approved)", step 9), which is deleted. Confirmed NOT a system-generated document — a human yes/no-with-upload action. |
| 10 | Confirmation *(Site PM confirms project details)* | site_pm | MOVED from current live step 15 (`confirmation`) — unchanged content, just relocated in sequence, now right after PM assignment/print-confirmation. |
| 11 | Confirmation Correction (Upload Drawing) | design | was live step 10 (`confirmation_correction`) |
| 12 | Internal Approval (Upload Approved Drawing) | operations (head_of_operations) | was live step 11 (`internal_approval`) |
| 13 | Send for Production | operations → CPO | was live step 12 (`send_for_production`) |
| 14 | Project Review & Authorisation | CPO | was live step 13 (`project_review_authorisation`) |
| 15 | Production Process | factory_operations | was live step 14 (`production_process`) |
| 16 | **Factory Manager Approval** | factory_manager | RENAMED from "Factory Manager Readiness Forms" (live step 16, `factory_manager_readiness`) |
| 17 | Materials / Accessories Readiness *(dual: factory_pm + site_pm)* | factory_pm + site_pm | was live step 17 (`materials_readiness`) — **already merged in production** (2026-07-11 quick task, dual_roles={factory_pm,site_pm}). Installation Readiness's checklist items still need to fold into THIS step's checklist (not yet done — see below). |
| 18 | **Delivery** | factory_pm | RENAMED from "Delivery & Project Check" (live step 18, `delivery_project_check`) |
| 19 | **Approval to Commence Installation — pt 1** *(operations admin or head_of_operations approves, which prompts Site PM)* | operations | SPLIT half of live step 19 (`approval_installation`). Confirmed: actor is operations role, either generic Operations Admin position or head_of_operations — not narrowed further. This IS the approval action; it fires the prompt to Site PM. |
| 20 | **Approval to Commence Installation — pt 2** *(resolved when Site PM acknowledges)* | site_pm | SPLIT half of live step 19. Current live step 20 (`installation_readiness`, standalone "Installation Readiness") is DELETED entirely — its 3 checklist items ("Is the installation area clear and accessible?", "Are services (power, water, etc.) available as required?", "Are all tools and the installation team on site?") need to be folded into step 17's (merged Materials/Delivery Readiness) checklist instead. |
| 21 | **Installation** *(checklist gains "Has the item been sorted?")* | site_pm | RENAMED from "Sorting" (live step 21, `sorting`). Its existing checklist item "Have all delivered items been sorted by room / zone?" is close but the exact wording requested is "Has the item been sorted?" — clarify exact wording wanted vs. reuse existing item before implementing. |
| 22 | Close Out | site_pm | was live step 22 (`close_out`) |
| 23 | Sign Off | super_admin | was live step 23 (`sign_off`) |

Net step count: 23 → 23 (unchanged count; composition changed substantially — see per-row deltas above).

## Cross-cutting requirements (not steps in the sequence)

1. **Site PM reassignment**: Super admin can reassign the Site PM on a project at any time, regardless of current step. Checked 2026-07-12 — no such action currently exists in `actions/workflow.ts` or `actions/workflow-graph.ts`.
2. **Audit "View" screen**: New "View" button on the project timeline, visible to all super admins, linking to a detail screen showing a table of every step's responses, checklists, attachments/images, and which officer/user completed it. Not yet designed — needs a discuss-phase pass of its own (what exactly renders per step kind, pagination, etc.) before planning.
3. **Configurator reliability**: The Workflow Configurator (Phase 18) must handle add/edit/reorder of steps and checklists without bugs — explicitly called out because this restructure will likely be executed through it. No specific bug reports given — this is a general quality bar, not a specific fix. Should be verified (manual QA pass or targeted tests) before/while executing this restructure through the Configurator.

## Deadline auto-set logic (clarified over 2 rounds)

- At project creation (step 1, Customer Care), the system auto-stamps deadlines for step 2 (+1 day), step 3 (+2 days), and step 4/Invoice (+2 days) from the creation timestamp — no manual entry required, doesn't wait on Customer Care to do anything extra.
- Step 4 (merged Invoice & Timeline, Head of Operations) is a 2-part wizard: 1/2 upload invoice, 2/2 set timeline for all remaining steps — single submit at the end. The timeline UI in part 2/2 excludes steps 2 & 3 (already auto-set) from the list of steps needing a deadline.

## Known conflicts / things to reconcile before formal planning

- REQUIREMENTS.md's current STG-02..14 wording (Phase 21/22, both still "Pending") does not reflect any of this — it still describes the old un-restructured 24-step draft (Invoicing as separate stage, no "Assign PM to Project", no "Print Confirmation Document", legacy Confirmation still at old position, Installation Readiness still standalone, no split Approval-to-Commence-Installation).
- ROADMAP.md Phase 20's PAY-02 description ("gated via requireAdmin(), not narrowed to requiredPosition = head_of_operations") should be re-examined against the new merged step 4 (Invoice & Timeline is now explicitly Head of Operations only, single step) — may simplify or resolve part of PAY-02's remaining gap.
- "Head of Projects" as a super-admin position/title is new to this conversation — not previously listed among the known super-admin titles in STATE.md's decision log (Head of Design/Operations, MD, ED, COO, CPO). Confirm it's an intentional addition to the position enum (ROLE-04's Postgres enum) before implementing step 8.
- Given trt-pm runs in autonomous `mode: yolo` and has been actively planning/executing/shipping ahead of manual sessions today (Phase 19 went from nothing to fully shipped between two check-ins, and a same-day quick task independently did the Materials/Delivery Readiness dual-role merge that's item 9a here) — **re-verify the live graph state before formally planning off this note**, in case more of this has already landed autonomously by the time it's picked up.
