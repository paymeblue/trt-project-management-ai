import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core'

// ── Enums ────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['factory_pm', 'site_pm', 'super_admin'])
export const projectStatusEnum = pgEnum('project_status', ['not_delivered', 'delivered'])
export const targetRoleEnum = pgEnum('target_role', ['factory_pm', 'site_pm', 'both'])
export const itemTypeEnum = pgEnum('item_type', ['radio', 'text', 'file'])
export const responseOptionsEnum = pgEnum('response_options', ['yes_no', 'yes_no_na'])
export const checklistStatusEnum = pgEnum('checklist_status', ['draft', 'submitted'])
export const responseValueEnum = pgEnum('response_value', ['yes', 'no', 'na'])
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant'])

// ── Users (NextAuth Credentials — bcrypt verified in auth.ts authorize()) ──
export const users = pgTable('users', {
  id:             uuid('id').primaryKey().defaultRandom(),
  email:          text('email').notNull().unique(),   // store lowercased on insert
  hashedPassword: text('hashed_password'),             // bcryptjs hash; null until set
  name:           text('name').notNull(),
  role:           roleEnum('role').notNull(),          // 'factory_pm' | 'site_pm' | 'super_admin'
  emailVerified:  timestamp('email_verified'),         // null until verified
  position:       text('position'),
  imageKey:       text('image_key'),                   // S3 key for ID card (Phase 2)
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

// ── Projects ─────────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id:           uuid('id').primaryKey().defaultRandom(),
  name:         text('name').notNull(),
  location:     text('location'),
  deliveryDate: timestamp('delivery_date'),
  status:       projectStatusEnum('status').default('not_delivered').notNull(),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

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
  definitionId:    uuid('definition_id').notNull().references(() => checklistDefinitions.id),
  step:            integer('step').notNull().default(1),
  sortOrder:       integer('sort_order').notNull().default(0),
  label:           text('label').notNull(),
  itemType:        itemTypeEnum('item_type').default('radio').notNull(),
  responseOptions: responseOptionsEnum('response_options').default('yes_no').notNull(),
  isPhotoAllowed:  boolean('is_photo_allowed').default(true).notNull(),
  isPhotoRequired: boolean('is_photo_required').default(false).notNull(),
  helpText:        text('help_text'),
  isActive:        boolean('is_active').default(true).notNull(),
})

// ── Checklist Instances ───────────────────────────────────────────────────
export const checklists = pgTable('checklists', {
  id:           uuid('id').primaryKey().defaultRandom(),
  definitionId: uuid('definition_id').notNull().references(() => checklistDefinitions.id),
  projectId:    uuid('project_id').references(() => projects.id),
  createdBy:    uuid('created_by').notNull().references(() => users.id),
  status:       checklistStatusEnum('status').default('draft').notNull(),
  submittedAt:  timestamp('submitted_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
})

// ── Checklist Responses ───────────────────────────────────────────────────
export const checklistResponses = pgTable('checklist_responses', {
  id:             uuid('id').primaryKey().defaultRandom(),
  checklistId:    uuid('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  templateItemId: uuid('template_item_id').notNull().references(() => checklistTemplateItems.id),
  value:          responseValueEnum('value'),
  textValue:      text('text_value'),
  notes:          text('notes'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  updatedAt:      timestamp('updated_at').defaultNow().notNull(),
})

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
export const processes = pgTable('processes', {
  id:        uuid('id').primaryKey().defaultRandom(),
  title:     text('title').notNull(),
  slug:      text('slug').notNull().unique(),
  body:      text('body').notNull(),
  tags:      text('tags').array(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Chat Messages (AI — Dave Aredo history) ───────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const conversationParticipants = pgTable('conversation_participants', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId:         uuid('user_id').notNull().references(() => users.id),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

// ── Messages (Phase 8 — human chat messages) ────────────────────────────
export const messages = pgTable('messages', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId:       uuid('sender_id').notNull().references(() => users.id),
  body:           text('body').notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

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
