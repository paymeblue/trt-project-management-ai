---
date: "2026-07-14 14:40"
promoted: false
---

Workflow restructure batch 2 — owner's requirements dictated 2026-07-14, against the live 22-step graph (post invoice-merge, post approval-rework). Supersedes conflicting parts of the 2026-07-12 note. NOT yet applied.

## Step-graph changes (in current live order)

1. **Step 4 UN-MERGES, new semantics** (reverses part of quick-260713-rb2 with different ownership):
   - New step 4 "Invoicing" — **customer_care**, 2-phase like the approval pattern: 1/2 "I have sent this client the invoice" (upload invoice), 2/2 "The client has finally paid" (marks projects.paymentStatus=paid). Nothing else in this step.
   - New step 5 "Set Delivery Timeline" — **operations admin** (role operations, no position narrowing), the timeline-setting UI as it exists today.
   - Step 6 Design Initiation unchanged.
2. **Step 8 (ops_design_confirmation) REPLACED**: becomes "Assign Site PM for Site Confirmation" — **Head of Projects** (super_admin w/ head_of_projects position — position may need adding) assignment-kind step targeting site_pm.
3. **Site Confirmation MOVES**: current step 14 'confirmation' (site_pm checklist) relocates to immediately AFTER new step 8 (assign site pm) and BEFORE confirmation_correction ("CC reupload drawing"). Sequence: assign site pm → site confirmation → confirmation_correction → internal_approval → send_for_production → ...
4. **"Only send front page"**: a stated instruction/help text about sending only the front page — RESOLVED 2026-07-14: help text on Confirmation Correction (the designer reupload) — only the front page of the drawing is to be sent/uploaded.
5. **Remove step 19 installation_readiness** (site_pm) — step 18 approval_installation already covers it. (Matches 2026-07-12 note.)
6. **Step 20 sorting → "Installation Process"** checklist containing sorting, execution, and close-out sections. RESOLVED 2026-07-14: YES — close_out folds into the Installation Process checklist and the standalone step is removed. Flow: ... → Installation Process → Sign Off.
7. **Step 22 sign_off**: site_pm (NOT super_admin), uploads a sign-off document (yes_no_upload), replacing the super_admin ack.

## SLA / deadline changes (auto-deadlines at creation + copy)
- Assign Designer: 1 day (already +1d; fix any lingering "5-day" copy in trt-flow-diagram)
- Brief Taking: 2 days (already +2d; fix "5-day max" copy)
- Operations Admin (timeline step): 1 day (currently the merged step gets +2d — becomes +1d on the new step 5; invoicing step 4 deadline TBD by owner, keep +2d unless said otherwise)

## Position rename
- head_designer label → "Head of Design" — do via the positions-rename feature (quick-260714-bpq, planned+checker-passed, awaiting execution). Execute bpq FIRST, then rename.
- May need a new head_of_projects position for item 2.

## Timeline screen (admin/timeline) — proper data table
- Group/filter by month (e.g. "June 2026") or by year, and by steps.
- Advanced-data-table filtering: date, date range, steps, search, etc.

## Execution order (agreed with self, obeys dependencies)
1. quick-260714-bpq (positions table migration) — prerequisite for renames + head_of_projects.
2. Graph restructure batch (items 1-3, 5-7 + SLA copy/deadline tweaks) — one migration + UI task.
3. Timeline data-table rework.
