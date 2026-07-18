import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// ── Media items (global, deduplicated) ──
export const mediaItems = sqliteTable(
  'media_items',
  {
    id: text('id').primaryKey(),
    platform: text('platform').notNull(),
    mediaType: text('media_type').notNull(),
    providerSelfId: text('provider_self_id').notNull(),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    coverUrl: text('cover_url'),
    description: text('description'),
    metadata: text('metadata'), // JSON string
    linkedIds: text('linked_ids'), // JSON string
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_media_unique').on(
      table.platform,
      table.mediaType,
      table.providerSelfId,
    ),
  ],
);

// ── User marks (user-isolated) ──
export const userMarks = sqliteTable(
  'user_marks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    mediaItemId: text('media_item_id').notNull(),
    status: integer('status').notNull().default(0),
    rating: real('rating'),
    comment: text('comment'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_user_mark_unique').on(table.userId, table.mediaItemId),
    index('idx_user_marks_user').on(table.userId),
  ],
);

// ── Users (Auth.js) ──
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  username: text('username').unique(),
  email: text('email').unique(),
  emailVerified: text('email_verified'),
  image: text('image'),
  role: text('role').default('user').notNull(),
  createdAt: text('created_at').notNull(),
});

// ── Personal Access Tokens ──
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  description: text('description'),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
});

// ── Sync logs ──
export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  syncType: text('sync_type').notNull(),
  itemCount: integer('item_count').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

// ── Auth.js session tables ──
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: text('expires_at').notNull(),
  sessionToken: text('session_token').unique().notNull(),
});

export const verificationTokens = sqliteTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (vt) => ({
  pk: primaryKey({ columns: [vt.identifier, vt.token] }),
}));

// ── Invite codes ──
export const inviteCodes = sqliteTable('invite_codes', {
  code: text('code').primaryKey(),
  createdBy: text('created_by').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  usedBy: text('used_by'),
});
