# Architecture Research

**Domain:** Multi-role checklist/PM web app (Next.js 16 App Router + Postgres/Drizzle + Neon Auth + S3 + Claude Agent SDK)
**Researched:** 2026-06-18
**Confidence:** HIGH (Next.js 16 patterns from bundled docs; schema from established Drizzle/Postgres conventions; S3/AI patterns from domain knowledge with medium confidence)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Factory PM │  │  Site PM   │  │ Super Admin│  │ Dave Aredo    │  │
│  │  Shell     │  │  Shell     │  │  Shell     │  │ Chat Overlay  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └──────┬────────┘  │
└────────┼───────────────┼───────────────┼────────────────┼───────────┘
         │               │               │                │
┌────────▼───────────────▼───────────────▼────────────────▼───────────┐
│                    Next.js 16 App Router (Server)                    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │   proxy.ts — optimistic auth/role check, route gating        │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│  ┌────────────────────────────▼─────────────────────────────────┐    │
│  │   Data Access Layer (DAL) — verifySession + role checks      │    │
│  │   Server Actions / Route Handlers — mutate + upload + chat   │    │
│  └────────────────────────────┬─────────────────────────────────┘    │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
┌────────▼───────┐   ┌──────────▼──────────┐  ┌───────▼──────────┐
│  Neon Postgres  │   │     S3-compatible   │  │  Anthropic API   │
│  (Drizzle ORM)  │   │     Bucket          │  │  (Claude Agent   │
│  all app data   │   │     photos/files    │  │   SDK)           │
└─────────────────┘   └─────────────────────┘  └──────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `proxy.ts` | Optimistic route-level auth gate; redirect unauthenticated users; **does NOT** do DB checks | Next.js 16 Proxy (successor to `middleware.ts`) with JWT cookie read only |
| DAL (`lib/dal.ts`) | Verified session decode, role extraction, re-usable `verifySession()` and role guard helpers, memoized with React `cache()` | `server-only` module; used by Server Components, Server Actions, Route Handlers |
| Route Groups | Isolate Factory PM, Site PM, Super Admin route trees under separate layouts | `app/(factory-pm)/`, `app/(site-pm)/`, `app/(admin)/` route groups |
| Server Actions (`actions/`) | All mutations: create/update checklist responses, submit wizard steps, request presigned URLs, manage users | `'use server'` functions; re-verify role in every action regardless of UI gating |
| Route Handlers (`api/`) | S3 presigned URL generation, AI chat streaming endpoint, file metadata registration | `app/api/upload/presign/route.ts`, `app/api/chat/route.ts` |
| Drizzle schema (`db/schema.ts`) | Single source of truth for all tables; template-driven checklist model | Drizzle ORM with Neon serverless driver |
| S3 client (`lib/s3.ts`) | Presigned PUT URL generation, presigned GET URL generation for viewing | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; `server-only` |
| AI endpoint (`api/chat/route.ts`) | Receive message, load role-scoped context, call Claude, persist to `chat_messages`, stream response | Claude Agent SDK; route handler with streaming response |

---

## Template-Driven Checklist Data Model

The core schema problem: nine named checklist types, exact line items TBD from PDFs, binary or tri-state items, multistep wizard groupings. One table per checklist type is the wrong model — it couples code to the specific checklist's structure and requires a migration and new component every time a checklist type is added or modified. The right model is three tiers: **definition** (what the checklist is), **template item** (what questions it asks), and **response** (what a user answered on a specific instance).

### Drizzle Schema Shape

```typescript
// db/schema.ts

import {
  pgTable, pgEnum, text, integer, boolean,
  timestamp, uuid, jsonb, varchar
} from 'drizzle-orm/pg-core'

// ── Roles ────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['factory_pm', 'site_pm', 'super_admin'])

// ── Users ────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:             uuid('id').primaryKey().defaultRandom(),
  authId:         text('auth_id').notNull().unique(), // Neon Auth external ID
  email:          text('email').notNull().unique(),
  name:           text('name').notNull(),
  position:       text('position'),
  role:           roleEnum('role').notNull(),
  idCardS3Key:    text('id_card_s3_key'),            // S3 object key for ID card image
  idCardUpdatedAt: timestamp('id_card_updated_at'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

// ── Projects ─────────────────────────────────────────────────────────
// Shared across both PM roles; ownership tied to creator
export const projectStatusEnum = pgEnum('project_status', ['not_delivered', 'delivered'])

export const projects = pgTable('projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  name:          text('name').notNull(),
  location:      text('location'),
  deliveryDate:  timestamp('delivery_date'),
  status:        projectStatusEnum('status').default('not_delivered').notNull(),
  createdBy:     uuid('created_by').notNull().references(() => users.id),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Definitions (the "type" catalogue) ──────────────────────
// One row per named checklist type. Super Admin can add new ones.
export const targetRoleEnum = pgEnum('target_role', ['factory_pm', 'site_pm', 'both'])

export const checklistDefinitions = pgTable('checklist_definitions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  slug:         text('slug').notNull().unique(),  // e.g. 'delivery_project', 'sorting'
  name:         text('name').notNull(),           // human label
  targetRole:   targetRoleEnum('target_role').notNull(),
  isActive:     boolean('is_active').default(true).notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// Seed slugs (line items loaded from PDFs later):
// 'delivery_project', 'product_readiness', 'confirmation_verification',
// 'delivery_site_readiness', 'issue_log', 'sorting',
// 'change_request', 'close_out', 'project_site_assessment'

// ── Template Items (the questions) ───────────────────────────────────
// Each row is one line item on one checklist type.
// `step` groups items into wizard pages.
export const itemTypeEnum = pgEnum('item_type', ['radio', 'text', 'file'])
export const responseOptionsEnum = pgEnum('response_options', ['yes_no', 'yes_no_na'])

export const checklistTemplateItems = pgTable('checklist_template_items', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  definitionId:       uuid('definition_id').notNull()
                        .references(() => checklistDefinitions.id),
  step:               integer('step').notNull().default(1), // wizard page number
  sortOrder:          integer('sort_order').notNull().default(0),
  label:              text('label').notNull(),              // the line item text
  itemType:           itemTypeEnum('item_type').default('radio').notNull(),
  responseOptions:    responseOptionsEnum('response_options').default('yes_no').notNull(),
  isPhotoAllowed:     boolean('is_photo_allowed').default(true).notNull(),
  isPhotoRequired:    boolean('is_photo_required').default(false).notNull(),
  helpText:           text('help_text'),
  isActive:           boolean('is_active').default(true).notNull(),
})

// ── Checklist Instances ───────────────────────────────────────────────
// One row per "filled-out checklist" (a wizard completion attempt).
export const checklistStatusEnum = pgEnum('checklist_status', ['draft', 'submitted'])

export const checklists = pgTable('checklists', {
  id:              uuid('id').primaryKey().defaultRandom(),
  definitionId:    uuid('definition_id').notNull()
                     .references(() => checklistDefinitions.id),
  projectId:       uuid('project_id').references(() => projects.id), // nullable — some checklists standalone
  createdBy:       uuid('created_by').notNull().references(() => users.id),
  status:          checklistStatusEnum('status').default('draft').notNull(),
  submittedAt:     timestamp('submitted_at'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Responses (the answers) ────────────────────────────────
// One row per item per checklist instance.
export const responseValueEnum = pgEnum('response_value', ['yes', 'no', 'na'])

export const checklistResponses = pgTable('checklist_responses', {
  id:             uuid('id').primaryKey().defaultRandom(),
  checklistId:    uuid('checklist_id').notNull()
                    .references(() => checklists.id, { onDelete: 'cascade' }),
  templateItemId: uuid('template_item_id').notNull()
                    .references(() => checklistTemplateItems.id),
  value:          responseValueEnum('value'),          // for radio items
  textValue:      text('text_value'),                  // for free-text items
  notes:          text('notes'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

// ── Attachments ───────────────────────────────────────────────────────
// Photos linked to a checklist response, OR to a user profile (ID card handled
// via users.idCardS3Key; this table is for response-level photo evidence).
export const attachments = pgTable('attachments', {
  id:           uuid('id').primaryKey().defaultRandom(),
  responseId:   uuid('response_id').references(() => checklistResponses.id), // nullable
  uploadedBy:   uuid('uploaded_by').notNull().references(() => users.id),
  s3Key:        text('s3_key').notNull(),
  filename:     text('filename').notNull(),
  mimeType:     text('mime_type'),
  sizeBytes:    integer('size_bytes'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// ── Processes & Flow Charts ───────────────────────────────────────────
// Super Admin editable knowledge base entries. These also serve as grounding
// context for Dave Aredo.
export const processes = pgTable('processes', {
  id:           uuid('id').primaryKey().defaultRandom(),
  title:        text('title').notNull(),
  slug:         text('slug').notNull().unique(),
  body:         text('body').notNull(),               // markdown or plain text
  tags:         text('tags').array(),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// ── Chat Messages ────────────────────────────────────────────────────
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant'])

export const chatMessages = pgTable('chat_messages', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  role:         chatRoleEnum('role').notNull(),
  content:      text('content').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
})

// ── AI Rate Limiting ─────────────────────────────────────────────────
export const aiUsage = pgTable('ai_usage', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  date:         text('date').notNull(),    // 'YYYY-MM-DD' — daily bucket
  messageCount: integer('message_count').default(0).notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})
// Unique constraint: (userId, date) — upsert on each message send

// ── Static Content (About TRT, Email Formats) ─────────────────────────
export const staticContent = pgTable('static_content', {
  id:        uuid('id').primaryKey().defaultRandom(),
  slug:      text('slug').notNull().unique(), // 'about_trt', 'email_formats'
  title:     text('title').notNull(),
  body:      text('body').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
```

**Key design decisions:**
- `checklistDefinitions` is the catalogue; adding a new checklist type is a DB insert + PDF import, not a code change.
- `checklistTemplateItems.step` drives the wizard page split without needing a separate `wizard_steps` table.
- `checklists` (instances) own responses; `createdBy` enforces creator-only edit at the data layer.
- `attachments.responseId` is nullable so the table can later extend to project-level or checklist-level attachments without a schema change.
- `aiUsage` uses a `(userId, date)` upsert pattern — the `dailyLimit` value lives in an env var, not hardcoded.
- `processes` rows are the grounding corpus for Dave Aredo; no separate vector store needed at v1 (load all rows as context; if body grows large, add pgvector in a later phase).

---

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/                   # public routes: /login, /signup
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (factory-pm)/             # route group: factory PM shell
│   │   ├── layout.tsx            # enforces factory_pm role via DAL
│   │   ├── dashboard/page.tsx
│   │   ├── projects/page.tsx
│   │   ├── checklists/
│   │   │   ├── [definitionSlug]/
│   │   │   │   ├── new/page.tsx  # wizard entry
│   │   │   │   └── page.tsx      # list view
│   │   ├── profile/page.tsx
│   │   ├── processes/page.tsx
│   │   └── about/page.tsx
│   ├── (site-pm)/                # route group: site PM shell
│   │   ├── layout.tsx            # enforces site_pm role via DAL
│   │   ├── dashboard/page.tsx
│   │   ├── projects/page.tsx
│   │   ├── checklists/
│   │   │   └── [definitionSlug]/
│   │   │       ├── new/page.tsx
│   │   │       └── page.tsx
│   │   ├── issue-log/page.tsx
│   │   ├── email-formats/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── processes/page.tsx
│   │   └── about/page.tsx
│   ├── (admin)/                  # route group: super admin shell
│   │   ├── layout.tsx            # enforces super_admin role via DAL
│   │   ├── dashboard/page.tsx    # read-only aggregated view
│   │   ├── users/page.tsx
│   │   ├── content/
│   │   │   ├── processes/page.tsx
│   │   │   ├── about/page.tsx
│   │   │   └── email-formats/page.tsx
│   │   └── checklists/page.tsx   # cross-role read-only checklist view
│   ├── api/
│   │   ├── upload/
│   │   │   └── presign/route.ts  # S3 presigned PUT URL generation
│   │   └── chat/
│   │       └── route.ts          # Dave Aredo streaming endpoint
│   ├── layout.tsx                # root layout (no auth logic here)
│   ├── unauthorized.tsx          # custom 401 UI (authInterrupts)
│   ├── forbidden.tsx             # custom 403 UI (authInterrupts)
│   └── not-found.tsx
├── db/
│   ├── schema.ts                 # all Drizzle table definitions
│   ├── index.ts                  # db client (Neon serverless + Drizzle)
│   └── migrations/               # drizzle-kit generated migrations
├── lib/
│   ├── dal.ts                    # verifySession(), requireRole(), getUser() — server-only
│   ├── session.ts                # encrypt/decrypt JWT — server-only
│   ├── s3.ts                     # presign helpers — server-only
│   ├── ai.ts                     # Claude Agent SDK wrapper — server-only
│   └── rate-limit.ts             # daily AI usage check — server-only
├── actions/
│   ├── checklist.ts              # createChecklist, saveResponse, submitChecklist
│   ├── project.ts                # createProject, updateStatus
│   ├── user.ts                   # updateProfile, adminUpdateUser
│   └── content.ts                # updateProcess, updateStaticContent
├── components/
│   ├── wizard/
│   │   ├── WizardShell.tsx       # step navigation, progress bar
│   │   ├── WizardStep.tsx        # renders items for one step
│   │   └── RadioItem.tsx         # single checklist line item
│   ├── chat/
│   │   └── DaveAredoOverlay.tsx  # floating button + full-screen chat
│   ├── upload/
│   │   └── PhotoUploader.tsx     # client component: presign → PUT → register
│   └── shared/
│       └── ...
└── proxy.ts                      # Next.js 16 Proxy (auth/role gate)
```

---

## RBAC Enforcement Layers

Next.js 16's own documentation is explicit: Proxy (the successor to `middleware.ts`) is for **optimistic** checks only — read the cookie, redirect unauthenticated users early, avoid DB calls. The **secure** checks live in the DAL, which every Server Component, Server Action, and Route Handler calls before touching data.

### Layer 1 — Proxy (`proxy.ts`, optimistic, fast)

```typescript
// proxy.ts
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/signup']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return NextResponse.next()

  const cookie = req.cookies.get('session')?.value
  const session = cookie ? await decrypt(cookie) : null

  if (!session?.userId) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Role-to-prefix redirect (keeps users out of wrong shell at nav level)
  const role = session.role as string
  if (path.startsWith('/factory-pm') && role !== 'factory_pm') {
    return NextResponse.redirect(new URL('/forbidden', req.url))
  }
  if (path.startsWith('/site-pm') && role !== 'site_pm') {
    return NextResponse.redirect(new URL('/forbidden', req.url))
  }
  if (path.startsWith('/admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/forbidden', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
}
```

### Layer 2 — Route Group Layouts (structural, defense-in-depth)

Each role's `layout.tsx` calls `requireRole()` from the DAL. This catches any case where Proxy was bypassed or the cookie was stale:

```typescript
// app/(factory-pm)/layout.tsx
import { requireRole } from '@/lib/dal'

export default async function FactoryPmLayout({ children }) {
  await requireRole('factory_pm') // calls verifySession + checks role; throws forbidden() if wrong
  return <>{children}</>
}
```

### Layer 3 — DAL (`lib/dal.ts`, authoritative)

```typescript
// lib/dal.ts
import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { decrypt } from './session'
import { forbidden, unauthorized } from 'next/navigation'

export const verifySession = cache(async () => {
  const cookie = (await cookies()).get('session')?.value
  const session = cookie ? await decrypt(cookie) : null
  if (!session?.userId) unauthorized()
  return session as { userId: string; role: string }
})

export async function requireRole(role: string) {
  const session = await verifySession()
  if (session.role !== role) forbidden()
  return session
}

// Creator-only edit guard: pass resource ownerId, enforce caller === owner OR admin
export async function requireOwnerOrAdmin(ownerId: string) {
  const session = await verifySession()
  if (session.role === 'super_admin') return session   // admin bypasses
  if (session.userId !== ownerId) forbidden()
  return session
}
```

### Layer 4 — Server Actions (always re-verify, never trust props)

```typescript
// actions/checklist.ts
'use server'
import { verifySession, requireOwnerOrAdmin } from '@/lib/dal'
import { db } from '@/db'
import { checklists } from '@/db/schema'

export async function saveChecklistResponse(checklistId: string, data: ...) {
  const session = await verifySession()
  // Verify caller owns this checklist instance before mutating
  const checklist = await db.query.checklists.findFirst({
    where: eq(checklists.id, checklistId)
  })
  if (!checklist) notFound()
  await requireOwnerOrAdmin(checklist.createdBy)
  // ... proceed with mutation
}
```

**RBAC enforcement summary:**

| Enforcement Point | What It Catches | DB Access |
|-------------------|-----------------|-----------|
| `proxy.ts` | Unauthenticated users, wrong-role shell navigation | No — JWT cookie only |
| Route group `layout.tsx` | Stale/bypassed proxy decisions | Yes — session decryption only |
| DAL `requireRole()` in layouts | Cross-role URL attempts | Yes — DB session validation |
| DAL in Server Actions | Every mutation | Yes — always re-verified |
| DAL `requireOwnerOrAdmin()` | Creator-only edit, non-owner edit attempts | Yes — resource owner check |
| Super Admin data layer | All reads are unfiltered; all writes are content-only | Yes — role checked before any write |

**Super Admin read-only enforcement:** Super Admin routes only expose read queries. The `actions/` files for project/checklist mutations call `requireRole('factory_pm')` or `requireRole('site_pm')` — an admin calling them will hit `forbidden()` even if they somehow reach the Server Action.

---

## Data Flows

### Flow 1: Checklist Wizard Submission

```
1. User opens /factory-pm/checklists/delivery_project/new
2. layout.tsx calls requireRole('factory_pm') → verified
3. page.tsx: Server Component loads checklistDefinition + templateItems
   grouped by step → renders WizardShell with step data
4. Each wizard step: Client Component collects radio values + optional photo
5. Photo upload (if any): PhotoUploader.tsx calls /api/upload/presign
   → S3 presigned PUT URL returned → browser PUTs file directly to S3
   → browser calls Server Action registerAttachment(s3Key, responseId)
6. Wizard "Next Step": Client calls Server Action saveChecklistResponse(...)
   → DAL verifies session + ownership
   → Drizzle upsert into checklist_responses
7. Final step "Submit": Server Action submitChecklist(checklistId)
   → sets status = 'submitted', submittedAt = now()
   → revalidatePath(...) → redirect to list view
```

### Flow 2: S3 Presigned Upload

```
Client (PhotoUploader.tsx)
  │
  ├─ POST /api/upload/presign { filename, mimeType, context: 'response' | 'id_card' }
  │     └─ Route Handler: verifySession() → generatePresignedPutUrl(key, mimeType)
  │        Returns: { presignedUrl, s3Key }
  │
  ├─ PUT {presignedUrl} ← browser sends file directly to S3 (no server proxy)
  │
  └─ Server Action: registerAttachment({ s3Key, responseId, filename, mimeType, sizeBytes })
        └─ verifySession() + requireOwnerOrAdmin(response.checklistCreatedBy)
           → INSERT INTO attachments
```

**Key points:**
- The presign endpoint validates session before issuing the URL; the S3 key format encodes `userId/date/uuid.ext` to prevent key collisions and enable per-user audit.
- File never passes through Next.js server — browser uploads directly to S3, then registers the key via Server Action.
- Attachment viewing: generate presigned GET URL on demand at display time (never store the full URL, only the key).

### Flow 3: Dave Aredo (AI Chat)

```
Client (DaveAredoOverlay.tsx)
  │
  └─ POST /api/chat { message: string }
        └─ Route Handler (api/chat/route.ts):
           1. verifySession() → { userId, role }
           2. Rate limit check: SELECT ai_usage WHERE userId + today's date
              → if PM and count >= AI_DAILY_LIMIT (env var) → 429
           3. Load recent chat history: SELECT chat_messages WHERE userId ORDER BY createdAt DESC LIMIT 20
           4. Load grounding context: SELECT processes (title + body) — full content at v1
              Filter: if role = 'factory_pm', tag filter optional; site_pm gets same corpus
              Admin gets same corpus but unlimited rate
           5. Build messages array:
              [system: role-scoped instructions + process corpus]
              + [recent history]
              + [new user message]
           6. Call Claude SDK → stream response
           7. On stream complete:
              - INSERT user message → chat_messages
              - INSERT assistant message → chat_messages
              - UPSERT ai_usage (increment count)
           8. Return streaming Response to client
```

**AI context scoping:** The system prompt includes: (a) the caller's role name, (b) what the role can/cannot do, (c) all `processes` rows serialized as text. The AI never receives data from other users' checklists — it is grounded only in the process knowledge base, not operational records. This is the correct v1 boundary: simpler, safer, and still useful.

**Rate limit mechanism:**
```typescript
// lib/rate-limit.ts
export async function checkAiRateLimit(userId: string, role: string): Promise<void> {
  if (role === 'super_admin') return  // unlimited
  const dailyLimit = parseInt(process.env.AI_DAILY_LIMIT ?? '20', 10)
  const today = new Date().toISOString().slice(0, 10)
  const usage = await db.query.aiUsage.findFirst({
    where: and(eq(aiUsage.userId, userId), eq(aiUsage.date, today))
  })
  if ((usage?.messageCount ?? 0) >= dailyLimit) {
    throw new RateLimitError('Daily AI message limit reached')
  }
}
```

---

## Architectural Patterns

### Pattern 1: DAL-First Authorization

**What:** Every data access goes through `lib/dal.ts`. No Server Component or Server Action queries the DB before calling `verifySession()`. The DAL uses React's `cache()` so the session is decoded once per request, not once per component.

**When to use:** Always — all server-side code that touches data.

**Trade-offs:** Slightly more boilerplate than inline checks, but eliminates entire classes of authorization bypass bugs. The `cache()` call means no performance penalty for calling `verifySession()` in multiple components on the same render pass.

### Pattern 2: Route Groups as Role Shells

**What:** Three route groups `(factory-pm)`, `(site-pm)`, `(admin)` each with their own `layout.tsx`. The layout acts as the structural RBAC checkpoint and renders the role-specific navigation shell. A user in the wrong group gets a `forbidden()` before any page component renders.

**When to use:** When roles have distinct navigation and layout. The groups also let each role have a different sidebar without conditional logic in a shared layout.

**Trade-offs:** Slight URL structure impact (`/factory-pm/...` prefix needed) but this makes role clear in URLs and in Proxy matcher patterns.

### Pattern 3: Template-Driven Wizard Rendering

**What:** The wizard page loads `checklistTemplateItems` for the given `definitionId`, groups them by `step`, and renders each step with a generic `WizardStep` component. No bespoke component per checklist type.

**When to use:** Always for this domain — exact line items are pending PDFs. The schema can be seeded/updated without code changes.

**Trade-offs:** Requires a seeding strategy for template items when PDFs arrive. The `isActive` flag on template items means deprecated questions can be soft-deleted without breaking historical responses.

### Pattern 4: Proxy (proxy.ts) for Redirect Only, DAL for Authorization

**What:** Next.js 16 has renamed `middleware.ts` to `proxy.ts`. The framework's own guidance (verified in bundled docs) is: Proxy should only do optimistic checks from the cookie; it must not hit the database. The DAL performs the authoritative check.

**When to use:** Proxy handles the redirect-to-login case and the coarse role-prefix check. Everything else is DAL.

**Trade-offs:** Two layers of checking, but the Proxy check is cheap (cookie read + JWT decode) and the DAL check is memoized (one DB round-trip per request, shared across all components). This is the pattern the Next.js team explicitly recommends in their v16 bundled auth guide.

---

## Anti-Patterns

### Anti-Pattern 1: One Table Per Checklist Type

**What people do:** Create `delivery_project_checklist`, `sorting_checklist`, `close_out_checklist` tables, each with hardcoded columns.

**Why it's wrong:** Nine migration files on day one; a new checklist type requires a new table, new Server Action, new component; historical response queries need UNION across tables; exact line items are not known at build time.

**Do this instead:** The `checklistDefinitions` + `checklistTemplateItems` + `checklistResponses` model. A new checklist type is a DB insert. The wizard renders generically from the template.

### Anti-Pattern 2: Authorization Logic in UI Components

**What people do:** Check `session.role === 'factory_pm'` inside a React component and conditionally show/hide a button. This is the only check.

**Why it's wrong:** Client components render on the browser. A motivated user can bypass the UI. Server Actions must re-verify or mutations are unprotected.

**Do this instead:** UI gates are cosmetic only. Every Server Action and Route Handler calls the DAL guard before doing anything.

### Anti-Pattern 3: Middleware/Proxy DB Queries

**What people do:** Put a Drizzle `db.query` call in `proxy.ts` to validate the session against the database on every request.

**Why it's wrong:** Proxy runs on every prefetch, static file request, image optimization, and route navigation. A DB call here fires hundreds of times per page load. The Next.js 16 docs explicitly warn against this.

**Do this instead:** Proxy decodes the JWT cookie (CPU-only, no I/O). The DAL does the DB session check once per data-bearing request, memoized with `cache()`.

### Anti-Pattern 4: Storing S3 Pre-signed URLs in the Database

**What people do:** Generate a presigned GET URL during upload and store it in the `attachments` table.

**Why it's wrong:** Presigned GET URLs expire (typically 1–7 days). After expiry, every stored URL is broken. The attachment still exists in S3 but cannot be retrieved.

**Do this instead:** Store only the `s3Key`. Generate a fresh presigned GET URL on demand when rendering (e.g., in a Server Component that serves the attachment list).

### Anti-Pattern 5: Seeding Checklist Line Items in Application Code

**What people do:** Hardcode checklist line items as constants in TypeScript.

**Why it's wrong:** Line items are pending PDFs. Hardcoding now = guaranteed migration when PDFs arrive. It also violates the template-driven model.

**Do this instead:** Write a seed script (`db/seed.ts`) that reads a JSON/CSV manifest derived from the PDFs and inserts into `checklistTemplateItems`. The app code never references specific item labels.

---

## Integration Points

### External Services

| Service | Integration Pattern | Key Notes |
|---------|---------------------|-----------|
| Neon Postgres | `@neondatabase/serverless` as Drizzle driver; `DATABASE_URL` in `.env.local` | Use `neon()` from `@neondatabase/serverless` as the Drizzle HTTP client for serverless-compatible pooling |
| Neon Auth | Issues JWTs with role claims; verify in `lib/session.ts` using `jose`; role stored in session payload | The auth_id in Neon Auth maps to `users.authId`; on first login, create a row in `users` with the assigned role |
| S3-compatible bucket | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`; presigned PUT from server, direct browser upload | Never proxy the file through Next.js; keep `lib/s3.ts` `server-only` |
| Claude (Anthropic) | `@anthropic-ai/sdk` — `client.messages.stream(...)` in a Route Handler; return `ReadableStream` | System prompt injection for role scoping; keep `lib/ai.ts` `server-only`; do not log message content |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client Components ↔ Server Actions | Direct Server Function calls (Next.js 16 Server Functions) | Server Actions always in `actions/` dir; never call DB directly from client |
| Server Components ↔ DAL | Direct import (both server-only) | DAL memoized with React `cache()` |
| Wizard Client ↔ S3 | Browser PUT to presigned URL | No file data touches the Next.js server |
| Chat Client ↔ AI Route Handler | Streaming fetch; `ReadableStream` response | Client reads stream chunks and appends to UI |
| Route Handlers ↔ DAL | Direct import | Route Handlers verify session via DAL before any response |

---

## Suggested Build Order

Dependencies between components determine the correct sequencing:

```
Phase 1 — Foundation (blocks everything else)
  ├── Drizzle schema + migrations (db/schema.ts)
  ├── Neon Auth integration + lib/session.ts + lib/dal.ts
  ├── proxy.ts with auth gate
  └── Route group scaffolding with layout.tsx RBAC checks
      (All subsequent features depend on this infrastructure)

Phase 2 — Core Data Model + Projects
  ├── Project CRUD (both PM roles)
  ├── Checklist definition seeding (slug catalogue, no items yet)
  └── User profile (with ID card upload via S3 flow)
      (S3 presign flow validated here before checklists need it)

Phase 3 — Checklist Engine
  ├── Template item import system (seed script + admin UI)
  ├── Generic wizard renderer (WizardShell + WizardStep + RadioItem)
  ├── Checklist response Server Actions + creator-only edit enforcement
  └── Photo attachment flow per response item
      (Depends on Phase 1 RBAC and Phase 2 S3 validation)

Phase 4 — Role-Specific Flows
  ├── Factory PM: Delivery Project, Product Readiness checklists
  ├── Site PM: Confirmation/Verification, Sorting, Change Request, etc.
  └── Super Admin: read-only aggregated view, user management, content editing
      (Depends on Phase 3 checklist engine)

Phase 5 — Dave Aredo (AI)
  ├── Processes & Flow Charts CRUD (Super Admin) + read (PMs)
  ├── ai/chat route handler with streaming + context injection
  ├── Rate limiting (ai_usage table)
  └── DaveAredoOverlay client component
      (Depends on Phase 1 auth, Phase 4 processes content)

Phase 6 — Polish
  ├── File list sorting (Name/Date) UI
  ├── Issue Log tabular interface
  ├── Email Formats (admin-edit, PM-view)
  └── Production hardening (error boundaries, rate limit UX, mobile testing)
```

**Dependency rationale:**
- Schema and auth must exist before any feature can be built — they are the foundation every other component imports from.
- S3 flow is validated during Profile (ID card upload in Phase 2) so photo upload in checklist responses (Phase 3) reuses a proven pattern rather than debugging both simultaneously.
- The generic wizard engine (Phase 3) is built before role-specific checklists (Phase 4) — building Factory PM and Site PM flows in parallel on top of it would be faster than building each checklist from scratch.
- Dave Aredo (Phase 5) is last because it depends on the Processes content existing (created in Phase 4/5 boundary) and is entirely independent of checklist functionality.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–500 users (v1 target) | Single Neon serverless DB, no caching layer, DAL direct queries — this is fine and the correct starting point |
| 500–5k users | Add `unstable_cache()` or React `cache()` to heavy read queries (process corpus for AI, checklist definition lists); consider Neon connection pooler if connection count becomes a concern |
| 5k+ users | pgvector for AI context retrieval (replace full-corpus injection with semantic search); background job queue for checklist submission notifications; CDN for S3 file delivery via CloudFront |

**First bottleneck:** AI chat — full `processes` corpus injected on every message. At high volume, either trim context (summarize processes) or switch to pgvector semantic retrieval. This is a Phase 5+ concern; the schema already supports it (processes table with `tags` array for filtering).

---

## Sources

- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (HIGH confidence — version-matched)
- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/02-guides/data-security.md` (HIGH confidence)
- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (HIGH confidence — middleware renamed to proxy in v16)
- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unauthorized.md` + `forbidden.md` (HIGH confidence)
- Next.js 16 bundled docs: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md` (HIGH confidence)
- Drizzle ORM schema patterns: MEDIUM confidence (training data + Postgres conventions; exact Neon serverless driver API should be verified during Phase 1 implementation)
- S3 presigned upload pattern: MEDIUM confidence (established AWS SDK pattern; verify `@aws-sdk/s3-request-presigner` import syntax during Phase 2)
- Claude Agent SDK streaming: MEDIUM confidence (streaming via `client.messages.stream()` is documented in Anthropic SDK; exact Route Handler integration should be verified during Phase 5)
- Neon Auth JWT shape/claims: LOW confidence (package not yet installed; must be verified against `@neondatabase/auth` docs during Phase 1)

---
*Architecture research for: TRT Arredo Project Management Platform*
*Researched: 2026-06-18*
