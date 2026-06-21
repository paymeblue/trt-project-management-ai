# TRT Arredo — Project Management Platform

A digital platform that replaces the paper checklists TRT Arredo uses on the
factory floor and on installation sites. It is the single system of record for
delivery checklists, site assessments, production QA, verifications, readiness
forms, and uploaded photo/file evidence — with an AI assistant (**Paul Arredo**)
that answers project-management questions grounded in PMI thinking and the
company's own processes.

> **Core value:** a PM on the floor or on-site completes a structured checklist
> (with photo evidence) on their phone and has it permanently recorded —
> replacing paper, with each role seeing only what's theirs.

---

## Roles

The app has three roles. Each shares one app shell but sees only its own flows
(gated in `proxy.ts` optimistically and re-checked in the DAL `verifySession()`
inside every server component / action / route).

| Role | Slug | What they do |
|---|---|---|
| **Factory PM** | `factory_pm` | Manufacturing-floor side. Delivery Project Checklist, Product Readiness, and the **Materials / Accessories Readiness Form** (upload a signed scan or sign a digital version). Manages factory-floor projects and their Delivered / Not-Delivered status. |
| **Site PM** | `site_pm` | On-site side. Confirmation / Verification, the full **Project Production Checklist** (Kitchen / Closet / Toilet Vanity / TV Units), Delivery Site Readiness, Sorting, Change Request and Close-Out checklists, plus a spreadsheet-style **Issue Log**. |
| **Super Admin** | `super_admin` | Oversight. Sees everything (largely read-only), manages users and static content (About TRT, email formats), and authors process flow charts. Created via CLI only. |

All roles can use **Paul Arredo** (AI), browse **Processes & Flow Charts**, edit
their **Profile**, and read **About TRT**.

---

## End-to-end flow

1. **Sign in** (`/sign-in`) — Auth.js v5 (JWT) with a Credentials provider and a
   custom `role` claim. `proxy.ts` does an optimistic cookie redirect; the DAL
   does the authoritative role check.
2. **Role dashboard** (`/factory-pm/dashboard`, `/site-pm/dashboard`,
   `/admin/dashboard`) — a grid of tiles routes to that role's flows.
3. **Checklists** (`/checklists/[slug]`) — rendered from data
   (`checklist_definitions` + `checklist_template_items`). A multi-step **wizard**
   groups items by `step`/`sectionTitle`, captures Yes/No/N·A + notes per item,
   and submits via a Server Function (`useActionState`). Submissions are stored
   in `checklists` + `checklist_responses` and listed under "Your submissions".
4. **Readiness form** (`/factory-pm/readiness`) — two tabs: **Upload** a photo of
   the signed paper form, or **Create Digital Version** and sign on-screen
   (`react-signature-canvas`). Stored in `readiness_forms`; each submission has a
   detail/view page.
5. **Processes & flow charts** (`/processes`, `/processes/[slug]`) — any PM can
   draw a flow chart visually with **React Flow** (`@xyflow/react`): add steps,
   connect them, Save (persisted to `processes.diagram` as JSON). Legacy Mermaid
   blocks still render as a fallback.
6. **Issue Log** (`/site-pm/issues`) — spreadsheet-style grid; log issues and
   toggle Open / Closed.
7. **Paul Arredo** (floating button → fullscreen) — Claude-style chat with a
   conversation **sidebar** (past sessions), Markdown rendering, **mic** input
   (Web Speech API), and a typing animation. Backed by `/api/chat`
   (`chat_sessions` + `chat_messages`) and the Anthropic SDK with a PMI-certified
   project-manager system persona.

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** + **Tailwind v4**.
  - Next 16 specifics: middleware is `proxy.ts` (not `middleware.ts`); `params`,
    `cookies()`, `headers()` are async (`await` them).
- **Postgres on Neon** + **Drizzle ORM** (`drizzle-orm/neon-http`).
- **Auth.js v5** (`next-auth@5`) JWT sessions, `@auth/drizzle-adapter`, `bcryptjs`.
- **AI:** `@anthropic-ai/sdk`, env-swappable between local Ollama (dev) and
  Anthropic (prod) via `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY` / `LLM_MODEL_NAME`.
- **Flow charts:** `@xyflow/react`. **Signatures:** `react-signature-canvas`.
  **Markdown:** `react-markdown` + `remark-gfm`. **Email:** `resend`.

---

## Getting started

```bash
npm install
# Configure .env.local: DATABASE_URL, AUTH_SECRET, ANTHROPIC_* , RESEND_API_KEY …
npm run db:push                          # sync schema to Neon
npx tsx db/seed-checklists.ts            # seed the core checklists
npx tsx db/seed-production-checklist.ts  # seed the Project Production Checklist
npm run dev                              # http://localhost:3000
```

### Create a Super Admin (CLI only)

`super_admin` is never writable over HTTP. Provision it from the CLI:

```bash
ADMIN_EMAIL="you@trt.com" ADMIN_PASSWORD="your-strong-password" ADMIN_NAME="Your Name" \
  npm run db:seed-admin
```

Then sign in at `/sign-in`. Re-running with an existing email is a no-op; use a
new email to add another admin.

---

## Useful scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:push` | Push the Drizzle schema to Neon |
| `npm run db:studio` | Drizzle Studio (DB browser) |
| `npm run db:seed-admin` | Provision a Super Admin (see above) |
| `npm test` | Vitest |

---

## Project layout

```
app/
  (auth)/        sign-in, sign-up, reset-password
  (app)/         authenticated shell (sidebar + topbar) and all role flows
    factory-pm/  dashboard, projects, product-readiness, readiness form
    site-pm/     dashboard, projects, issues
    admin/       overview, users, content
    checklists/[slug]   data-driven checklist wizard
    processes/   list + [slug] flow-chart editor
  api/chat/      Paul Arredo endpoints (sessions + messages)
  _components/   shared UI (sidebar, wizard, paul-arredo, readiness-form, …)
actions/         Server Functions (mutations)
db/              schema.ts, drizzle client, seed scripts
lib/dal.ts       verifySession() + role guards
```
