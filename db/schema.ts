import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
  unique,
  foreignKey,
  doublePrecision,
} from 'drizzle-orm/pg-core'

// ── Enums ────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['factory_pm', 'site_pm', 'super_admin', 'operations', 'design', 'production', 'customer_care', 'architect', 'factory_operations', 'factory_manager'])
export const projectStatusEnum = pgEnum('project_status', ['not_delivered', 'delivered', 'paused'])
export const paymentStatusEnum = pgEnum('payment_status', ['unpaid', 'paid'])
export const targetRoleEnum = pgEnum('target_role', ['factory_pm', 'site_pm', 'both'])
export const itemTypeEnum = pgEnum('item_type', ['radio', 'text', 'file'])
export const responseOptionsEnum = pgEnum('response_options', ['yes_no', 'yes_no_na'])
export const checklistStatusEnum = pgEnum('checklist_status', ['draft', 'submitted'])
export const responseValueEnum = pgEnum('response_value', ['yes', 'no', 'na'])
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant'])
export const fulfillmentKindEnum = pgEnum('fulfillment_kind', ['creation', 'checklist', 'readiness', 'ack', 'yes_no_upload', 'approval', 'assignment', 'payment_confirmation', 'timeline_setting'])

// ── Positions (v2.0, quick task 260714-bpq — renameable positions) ───────
// Replaces the `position` Postgres enum as the source of truth. `slug` is
// the machine value stored on users.position / workflow_step_definitions'
// required_position + receiver_required_position columns; `label` is the
// human-facing display text, renameable in place without a redeploy (see
// actions/positions.ts). Column/type/default choices are kept byte-aligned
// with the CREATE TABLE scripts/migrate-positions-table.ts emits so
// drizzle-kit push sees zero diff post-migration.
export const positions = pgTable('positions', {
  slug:      text('slug').primaryKey(),
  label:     text('label').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Users (NextAuth Credentials — bcrypt verified in auth.ts authorize()) ──
export const users = pgTable('users', {
  id:             uuid('id').primaryKey().defaultRandom(),
  email:          text('email').notNull().unique(),   // store lowercased on insert
  hashedPassword: text('hashed_password'),             // bcryptjs hash; null until set
  name:           text('name').notNull(),
  role:           roleEnum('role').notNull(),          // 'factory_pm' | 'site_pm' | 'super_admin'
  emailVerified:  timestamp('email_verified'),         // null until verified
  // v2.0 (quick task 260714-bpq): plain text, NOT a FK — mirrors the
  // deliberately-text step-def position columns below (D-19-01-A) and
  // avoids FK-name-truncation churn (see message_reactions history further
  // down). Renaming is self-service DML via lib/positions.ts's `positions`
  // table, not a redeploy. See scripts/migrate-positions-table.ts for the
  // one-time enum->text conversion of the live column.
  position:       text('position'),
  bio:            text('bio'),                          // optional self-description
  avatarData:     text('avatar_data'),                  // profile image as base64 data URL
  imageKey:       text('image_key'),                   // S3 key for ID card (Phase 2)
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

// ── Projects ─────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id:            uuid('id').primaryKey().defaultRandom(),
  name:          text('name').notNull(),
  location:      text('location'),
  deliveryDate:  timestamp('delivery_date'),                 // doubles as the deadline (Operations sets it)
  status:        projectStatusEnum('status').default('not_delivered').notNull(),
  currentStep:   integer('current_step').default(2).notNull(), // workflow step awaiting action (see lib/workflow.ts)
  createdBy:     uuid('created_by').notNull().references(() => users.id),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
  // ── Customer Care intake (v2.0, STG-01/PAY-01) ──────────────────────────
  customerName:  text('customer_name'),
  customerEmail: text('customer_email'),
  customerPhone: text('customer_phone'),
  scope:         text('scope'),
  // Independent of `status` (not_delivered/delivered/paused) — gates progress
  // past the new Payment Confirmation & Timeline step (PAY-01/PAY-02).
  paymentStatus: paymentStatusEnum('payment_status').default('unpaid').notNull(),
})

// ── Project Step Completions (workflow audit trail / timeline) ────────────
export const projectStepCompletions = pgTable('project_step_completions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepKey:     text('step_key').notNull(),               // WorkflowStep.key (legacy live rows)
  stepN:       integer('step_n').notNull(),              // WorkflowStep.n (legacy live rows)
  stepDefId:   uuid('step_def_id'),                       // graph-engine rows key by this instead; FK below (explicit short name — default name exceeds Postgres' 63-char identifier limit and gets silently truncated, causing drizzle-kit push to churn it every run)
  graph:       text('graph').default('live').notNull(),  // isolates Phase 16 test graph from the live graph
  skipped:     boolean('skipped').default(false).notNull(), // skipped-optional-step recorded as a satisfied predecessor for join readiness
  completedBy: uuid('completed_by').notNull().references(() => users.id),
  notes:       text('notes'),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.stepDefId],
    foreignColumns: [workflowStepDefinitions.id],
    name: 'psc_step_def_id_fk',
  }).onDelete('cascade'),
])

// ── Workflow Step Definitions (v2.0 — configurable workflow graph, WF-01) ──
// A single step in a workflow graph: order, key, label, responsible role, and
// fulfillment kind. `graph` isolates the Phase 16 test graph from 'live'.
export const workflowStepDefinitions = pgTable('workflow_step_definitions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  graph:           text('graph').default('live').notNull(),
  stepKey:         text('step_key').notNull(),
  label:           text('label').notNull(),
  role:            roleEnum('role').notNull(),
  fulfillmentKind: fulfillmentKindEnum('fulfillment_kind').notNull(),
  // v2.0 Phase 18.1 (ad hoc): EXTRA fulfillment kinds required on top of the
  // primary `fulfillmentKind` — e.g. a step can require BOTH a yes/no+upload
  // AND an assignment before it's completable. null/empty = today's
  // single-kind behavior, unchanged. The step-completion page renders one
  // sub-form per required kind (primary + additional); completeGraphStep
  // requires ALL of them fulfilled (see workflow_step_states.fulfilled_kinds).
  additionalKinds: fulfillmentKindEnum('additional_kinds').array(),
  checklistSlug:   text('checklist_slug'),               // set only when fulfillmentKind = 'checklist'; mirrors checklist_definitions.slug
  targetRoles:     roleEnum('target_role').array(),       // set only when fulfillmentKind = 'assignment' — pool of roles the actor may pick a user from (v2.0 Phase 19: was a single role, widened to a list so e.g. Head Designer can pick from design OR architect)
  requiredPosition: text('required_position'),            // v2.0 Phase 19 (ad hoc, pre-formal-enum): narrows a role-gated step to one exact users.position value (e.g. 'head_designer'). null = today's behavior unchanged (any user with the step's role may act). Deliberately left as free text for now, not a DB enum — converting users.position to a real Postgres enum is deferred to formal Phase 19 execution to avoid migration risk under this ad hoc build.
  receiverRequiredPosition: text('receiver_required_position'), // v2.0 Phase 22 (ad hoc): approval-kind steps only — narrows the RECEIVER (2nd party) to one exact users.position, distinct from requiredPosition which gates the SENDER. null = receive stays open to anyone eligible who isn't the sender (legacy behavior).
  // v2.0 Phase 22e (ad hoc): approval-kind steps only — narrows the RECEIVER
  // to one exact ROLE (distinct from receiverRequiredPosition, which narrows
  // by exact position within the sender's role). Used for cross-role
  // send/receive, e.g. Delivery: factory_pm sends, site_pm receives — two
  // DIFFERENT roles, not two positions within one role.
  receiverRole:    roleEnum('receiver_role'),
  // v2.0 Phase 22e (ad hoc): legacy-engine (readiness/checklist) steps only —
  // when set, this step requires ALL of these roles to independently confirm
  // (via workflow_step_states.confirmed_roles, see confirmDualRoleStep in
  // actions/workflow.ts) before it advances. null = today's single-actor
  // behavior unchanged (first submission advances immediately).
  dualRoles:       roleEnum('dual_roles').array(),
  isOptional:      boolean('is_optional').default(false).notNull(),
  // Graph-canvas node placement (Configurator graph view) — cosmetic only;
  // null until an admin drags the node at least once, at which point an
  // auto-layout (dagre) position is persisted. Execution order is ALWAYS
  // derived from orderIndex/workflow_step_edges, never from these — moving a
  // node on the canvas never changes the actual workflow sequence.
  positionX:       doublePrecision('position_x'),
  positionY:       doublePrecision('position_y'),
  orderIndex:      integer('order_index').notNull(),      // display/default ordering only — adjacency lives in workflow_step_edges
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({ graphStepKeyUq: unique().on(t.graph, t.stepKey) }))

// ── Workflow Step Edges (v2.0 — explicit adjacency, WF-05) ────────────────
// The ONLY source of adjacency between steps. A join step is one with
// multiple incoming edges (predecessors); parallel branches are multiple
// outgoing edges from the same step.
export const workflowStepEdges = pgTable('workflow_step_edges', {
  id:         uuid('id').primaryKey().defaultRandom(),
  graph:      text('graph').default('live').notNull(),
  fromStepId: uuid('from_step_id').notNull(),             // FK below (explicit short name — default name exceeds Postgres' 63-char identifier limit)
  toStepId:   uuid('to_step_id').notNull().references(() => workflowStepDefinitions.id, { onDelete: 'cascade' }),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.fromStepId, t.toStepId),
  foreignKey({
    columns: [t.fromStepId],
    foreignColumns: [workflowStepDefinitions.id],
    name: 'wse_from_step_id_fk',
  }).onDelete('cascade'),
])

// ── Workflow Step States (v2.0 — per-project runtime state, WF-03) ───────
// Runtime state for the new fulfillment kinds (yes_no_upload, approval,
// assignment) that don't fit the existing checklist/readiness-form tables.
export const workflowStepStates = pgTable('workflow_step_states', {
  id:             uuid('id').primaryKey().defaultRandom(),
  projectId:      uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepDefId:      uuid('step_def_id').notNull(),          // FK below (explicit short name — default name exceeds Postgres' 63-char identifier limit)
  status:         text('status').default('pending').notNull(),   // 'pending' | 'sent' | 'complete'
  answer:         text('answer'),                                 // 'yes' | 'no' for yes_no_upload
  uploadData:     text('upload_data'),                            // base64 data URL, same pattern as checklists.photoData
  uploadName:     text('upload_name'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id), // for assignment
  sentBy:         uuid('sent_by').references(() => users.id),         // approval send
  receivedBy:     uuid('received_by').references(() => users.id),     // approval receive
  actedBy:        uuid('acted_by').references(() => users.id),
  // v2.0 Phase 18.1 (ad hoc): which of the step's required kinds (primary +
  // additionalKinds) have been satisfied so far for this project. Each
  // kind-specific submit function (submitYesNoUpload/assignUser/
  // receiveApproval) appends its own kind here. completeGraphStep requires
  // this to be a superset of the step's full required-kinds set.
  fulfilledKinds: text('fulfilled_kinds').array(),
  // v2.0 Phase 22e (ad hoc): which roles have confirmed so far, for a
  // legacy-engine (readiness/checklist) step with `dualRoles` set on its
  // definition — see confirmDualRoleStep in actions/workflow.ts. Distinct
  // from fulfilledKinds (that's for the newer graph-engine kinds).
  confirmedRoles: text('confirmed_roles').array(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.projectId, t.stepDefId),
  foreignKey({
    columns: [t.stepDefId],
    foreignColumns: [workflowStepDefinitions.id],
    name: 'wss_step_def_id_fk',
  }).onDelete('cascade'),
])

// ── Workflow Configurator PIN gate (v2.0 — CFG-02/CFG-03) ────────────────
// Single-row table: an extra PIN gate on top of isAdminRole for the workflow
// configurator screen. Seeded with pinHash of '0000' + hint '0000' the first
// time the configurator is opened if no row exists yet.
export const workflowConfigAccess = pgTable('workflow_config_access', {
  id:        uuid('id').primaryKey().defaultRandom(),
  pinHash:   text('pin_hash').notNull(),
  hint:      text('hint').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Per-step deadlines set by Operations at project creation (REQ-G05) so each
// actor is accountable to their own step, not just one project-wide date.
export const projectStepDeadlines = pgTable('project_step_deadlines', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepN:     integer('step_n').notNull(),                // WorkflowStep.n
  deadline:  timestamp('deadline').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({ projectStepUq: unique().on(t.projectId, t.stepN) }))

// ── Checklist Definitions (CHK-01: template catalogue) ───────────────────
export const checklistDefinitions = pgTable('checklist_definitions', {
  id:         uuid('id').primaryKey().defaultRandom(),
  slug:       text('slug').notNull().unique(), // e.g. 'delivery_project', 'sorting'
  name:       text('name').notNull(),
  targetRole: targetRoleEnum('target_role').notNull(),
  isActive:   boolean('is_active').default(true).notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Template Items (CHK-01: schema-as-data) ──────────────────────────────
export const checklistTemplateItems = pgTable('checklist_template_items', {
  id:              uuid('id').primaryKey().defaultRandom(),
  definitionId:    uuid('definition_id').notNull(), // FK below (explicit short name — default name exceeds Postgres' 63-char identifier limit and gets silently truncated, causing drizzle-kit push non-idempotency; same bug class as psc_step_def_id_fk/wse_from_step_id_fk/wss_step_def_id_fk)
  step:            integer('step').notNull().default(1),
  sectionTitle:    text('section_title'), // e.g. "Kitchen · Boxes" — groups a step
  sortOrder:       integer('sort_order').notNull().default(0),
  label:           text('label').notNull(),
  itemType:        itemTypeEnum('item_type').default('radio').notNull(),
  responseOptions: responseOptionsEnum('response_options').default('yes_no').notNull(),
  isPhotoAllowed:  boolean('is_photo_allowed').default(true).notNull(),
  isPhotoRequired: boolean('is_photo_required').default(false).notNull(),
  helpText:        text('help_text'),
  isActive:        boolean('is_active').default(true).notNull(),
}, (t) => [
  foreignKey({
    columns: [t.definitionId],
    foreignColumns: [checklistDefinitions.id],
    name: 'cti_definition_id_fk',
  }),
])

// ── Checklist Instances ───────────────────────────────────────────────────
export const checklists = pgTable('checklists', {
  id:           uuid('id').primaryKey().defaultRandom(),
  definitionId: uuid('definition_id').notNull().references(() => checklistDefinitions.id),
  projectId:    uuid('project_id').references(() => projects.id),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  status:       checklistStatusEnum('status').default('draft').notNull(),
  submittedAt:  timestamp('submitted_at'),
  photoData:    text('photo_data').array(), // required-evidence photos (base64 data URLs)
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Responses ───────────────────────────────────────────────────
export const checklistResponses = pgTable('checklist_responses', {
  id:             uuid('id').primaryKey().defaultRandom(),
  checklistId:    uuid('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  templateItemId: uuid('template_item_id').notNull(), // FK below (explicit short name — default name exceeds Postgres' 63-char identifier limit; same bug class as psc_step_def_id_fk/wse_from_step_id_fk/wss_step_def_id_fk)
  value:          responseValueEnum('value'),
  textValue:      text('text_value'),
  notes:          text('notes'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  foreignKey({
    columns: [t.templateItemId],
    foreignColumns: [checklistTemplateItems.id],
    name: 'cr_template_item_id_fk',
  }),
])

// ── Attachments ───────────────────────────────────────────────────────────
export const attachments = pgTable('attachments', {
  id:         uuid('id').primaryKey().defaultRandom(),
  responseId: uuid('response_id').references(() => checklistResponses.id),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  s3Key:      text('s3_key').notNull(),
  filename:   text('filename').notNull(),
  mimeType:   text('mime_type'),
  sizeBytes:  integer('size_bytes'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})

// ── Processes & Flow Charts ───────────────────────────────────────────────
// We persist an Excalidraw scene (elements + optional files) as jsonb. Kept
// loose on purpose — Excalidraw owns the full element types.
export type ProcessScene = {
  elements: unknown[]
  files?: unknown
}

export const processes = pgTable('processes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title').notNull(),
  slug:      text('slug').notNull().unique(),
  body:      text('body').notNull(),
  // Uploaded process-flow image (base64 data URL). Admin-managed.
  imageData: text('image_data'),
  // Legacy Excalidraw scene: { elements, files }. Retained for old records.
  diagram:   jsonb('diagram').$type<ProcessScene | null>(),
  tags:      text('tags').array(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Chat Sessions (AI — Dave Aredo conversations) ─────────────────────────
export const chatSessions = pgTable('chat_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  title:     text('title').notNull().default('New chat'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Chat Messages (AI — Dave Aredo history) ───────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
  // Which conversation this message belongs to (nullable only for legacy rows
  // created before sessions existed; backfilled to a per-user session).
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
  role:      chatRoleEnum('role').notNull(),
  content:   text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── AI Usage (rate limiting) ──────────────────────────────────────────────
export const aiUsage = pgTable('ai_usage', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  date:         text('date').notNull(),             // 'YYYY-MM-DD'
  messageCount: integer('message_count').default(0).notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Static Content ────────────────────────────────────────────────────────
export const staticContent = pgTable('static_content', {
  id:        uuid('id').primaryKey().defaultRandom(),
  slug:      text('slug').notNull().unique(), // 'about_trt', 'email_formats'
  title:     text('title').notNull(),
  body:      text('body').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Process Diagrams (Phase 7 — React Flow / Mermaid state) ─────────────
export const processDiagrams = pgTable('process_diagrams', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title').notNull(),
  state:     jsonb('state').notNull(),
  ownerId:   uuid('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Conversations + participants (Phase 8 — human chat) ─────────────────
export const conversations = pgTable('conversations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  title:     text('title'),                              // group title (null for 1:1)
  isGroup:   boolean('is_group').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const conversationParticipants = pgTable('conversation_participants', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId:         uuid('user_id').notNull().references(() => users.id),
  lastReadAt:     timestamp('last_read_at'),   // for unread counts
  lastTypingAt:   timestamp('last_typing_at'), // heartbeat for typing indicator
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

// ── Messages (Phase 8 — human chat messages) ────────────────────────────
export const messages = pgTable('messages', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId:       uuid('sender_id').notNull().references(() => users.id),
  body:           text('body').notNull().default(''),
  attachmentData: text('attachment_data'),     // base64 data URL (image/file)
  attachmentName: text('attachment_name'),
  attachmentType: text('attachment_type'),     // MIME type
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

// ── Message reactions (quick-260706-bpg — Slack-like reactions) ─────────
// quick-260711 root cause + fix: `drizzle-kit push`'s live introspection of
// composite unique constraints (information_schema.constraint_column_usage
// joined to information_schema.columns, no ORDER BY) does NOT preserve the
// constraint's declared/conkey column order — it comes back alphabetized
// (confirmed by direct query: this constraint introspects as
// emoji,message_id,user_id, not the message_id,user_id,emoji declaration
// order below). drizzle-kit's diff engine compares the declared column
// order against that alphabetized introspected order as part of the same
// squashed string, so this constraint churned (DROP+ADD, same name) on
// EVERY push. workflowStepDefinitions' (graph, stepKey) and
// projectStepDeadlines' (projectId, stepN) never hit this because their
// declared order already happens to be alphabetical. Fix: declare the
// columns in the alphabetical order push always introspects them in
// (emoji, messageId, userId) and give the constraint its existing stable
// name explicitly so no rename statement is emitted either — same
// underlying Postgres constraint (message_reactions_message_id_user_id_
// emoji_unique already existed with this exact name/column set), zero DB
// migration required.
export const messageReactions = pgTable('message_reactions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id),
  emoji:     text('emoji').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  messageReactionsUq: unique('message_reactions_message_id_user_id_emoji_unique').on(t.emoji, t.messageId, t.userId),
}))

// ── Auth Tokens (Phase 1 — email verification + password reset) ─────────
export const verificationTokens = pgTable('verification_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt:    timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Issue Log (Site PM) ───────────────────────────────────────────────────
export const issues = pgTable('issues', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status').default('open').notNull(), // 'open' | 'closed'
  escalatedAt: timestamp('escalated_at'),                 // set when escalated to super admins (REQ-G10)
  createdBy:   uuid('created_by').notNull().references(() => users.id),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Per-project dispute thread (v1.1, REQ-G10) ─────────────────────────────
// A threaded discussion tied to a project, visible to participants + all super
// admins, for resolving disputes/escalations.
export const projectDisputes = pgTable('project_disputes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  authorId:  uuid('author_id').notNull().references(() => users.id),
  body:      text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Materials / Accessories Readiness Form (Factory PM) ───────────────────
// Either an uploaded photo of the signed paper form, or a digital version
// with a captured signature. Images & signature stored as data URLs.
export const readinessForms = pgTable('readiness_forms', {
  id:             uuid('id').primaryKey().defaultRandom(),
  createdBy:      uuid('created_by').notNull().references(() => users.id),
  projectId:      uuid('project_id').references(() => projects.id), // nullable — added 260716-hys, historical rows stay null
  mode:           text('mode').notNull(),              // 'digital' | 'upload'
  project:        text('project'),
  unit:           text('unit'),
  materialControl: text('material_control'),           // Material / Quality control
  accessories:    text('accessories'),
  upholstery:     text('upholstery'),
  confirmedBy:    text('confirmed_by'),                // name in "I, ___ confirm…"
  signedDate:     text('signed_date'),
  signatureData:  text('signature_data'),              // data URL (digital signature)
  uploadData:     text('upload_data'),                 // legacy single scan/photo (data URL)
  uploadName:     text('upload_name'),
  photoData:      text('photo_data').array(),          // required photos (2+), base64 data URLs
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

// ── Step bypass requests (higher-authority approval, v1.1) ─────────────────
// An actor asks a super admin to advance a step WITHOUT completing its checklist
// (REQ-G09). Approval is audited (who requested, who decided, when, why).
export const stepBypassRequests = pgTable('step_bypass_requests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  projectId:   uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  stepN:       integer('step_n').notNull(),
  reason:      text('reason'),
  status:      text('status').default('pending').notNull(), // 'pending' | 'approved' | 'denied'
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  decidedBy:   uuid('decided_by').references(() => users.id),
  decidedAt:   timestamp('decided_at'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── In-app notifications (super-admin alerts, v1.1) ────────────────────────
// One row per recipient (fanned out to every super admin) so read state is
// per-user. `type` is a free string kept flexible for escalation kinds added in
// Phase 14 (pause_flag | bypass_request | escalation | dispute | …).
export const notifications = pgTable('notifications', {
  id:          uuid('id').primaryKey().defaultRandom(),
  recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:        text('type').notNull(),
  title:       text('title').notNull(),
  body:        text('body'),
  projectId:   uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  actorId:     uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  readAt:      timestamp('read_at'),                    // null = unread
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})
