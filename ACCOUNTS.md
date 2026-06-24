# TRT PM — Accounts & Access

Public self sign-up is **disabled**. Every account is provisioned either by a seed
script (administrators) or by an administrator inside the app (Factory PM / Site PM).

> Security note: real passwords are **not** stored in this repo. They are set at seed
> time via environment variables (see `.env.example`) and, for PMs, generated and
> emailed when an admin creates the account. Fill the table below in your own private
> copy only — never commit real secrets.

## Roles

| Role | How it's created | Can do |
|------|------------------|--------|
| **Super Admin** | `npm run db:seed-admin` (env: `ADMIN_*`) | Everything (read-only oversight, user management, content, timeline, create projects) |
| **Operations** | `npm run db:seed-operations` (env: `OPERATIONS_*`) | Full super-admin rights. Creates projects + sets deadlines. UI shows their **position** (e.g. "Head of Projects") instead of "Super Admin". |
| **Factory PM** | Created in-app by an admin (User Management) | Acts on factory workflow steps; credentials emailed on creation |
| **Site PM** | Created in-app by an admin (User Management) | Acts on site workflow steps; credentials emailed on creation |

## Seeded accounts (fill in for your environment)

| Role | Name | Email | Password | Set via |
|------|------|-------|----------|---------|
| Super Admin | _Super Admin_ | `<ADMIN_EMAIL>` | `<ADMIN_PASSWORD>` | `.env.local` → `db:seed-admin` |
| Operations | _Operations_ | `<OPERATIONS_EMAIL>` | `<OPERATIONS_PASSWORD>` | `.env.local` → `db:seed-operations` |

## Provisioning steps

1. Set the credentials in `.env.local` (copy from `.env.example`):
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, optional `ADMIN_NAME`
   - `OPERATIONS_EMAIL`, `OPERATIONS_PASSWORD`, optional `OPERATIONS_NAME`, `OPERATIONS_POSITION`
2. Apply the schema and seed:
   ```bash
   npm run db:push
   npm run db:seed-admin
   npm run db:seed-operations
   npm run db:seed-workflow-checklists   # Project Check Report, Approval to Commence Installation, Installation Readiness
   ```
3. Sign in as **Operations** (or Super Admin) → **User Management** → create the
   Factory PM and Site PM accounts. Each new user is emailed their email + a temporary
   password (`RESEND_API_KEY` / `EMAIL_FROM` must be configured). If email sending fails,
   the temporary password is shown to the admin once so it can be shared securely. Users
   should change it after first sign-in.

## Project workflow (who acts when)

Operations creates a project (with a deadline). It then moves through these steps; each
role acts on its step from **Projects → select project → modal** (later steps stay locked
until earlier ones complete):

1. New Project — Operations
2. Confirmation — Site PM
3. Materials / Accessories Readiness — Factory PM (first Factory PM step)
4. Delivery Readiness — Site PM
5. Delivery Project Checklist — Factory PM (**requires 2 photos** to submit)
6. Project Check Report — Factory PM
7. Approval to Commence Installation — Operations
8. Installation Readiness — Site PM
9. Sorting — Site PM
10. Close Out — Site PM

Site PM may also raise an **optional Change Request** at any time (from the project
modal) — it's recorded against the project but does not change the step order.

Super Admin / Operations watch progress on **Projects Timeline** (green = delivered on
time, red = past deadline).
