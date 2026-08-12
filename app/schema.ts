import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  int,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ============================================================
// 認可・プラン
// ============================================================

export const plansTable = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("plans_default_unique")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = 1`),
    index("plans_active_idx").on(table.isActive),
  ],
);

export const planLimitsTable = sqliteTable(
  "plan_limits",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    limitValue: integer("limit_value"),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.metric] }),
    check(
      "plan_limits_limit_value_non_negative",
      sql`${table.limitValue} IS NULL OR ${table.limitValue} >= 0`,
    ),
  ],
);

export const usageCountersTable = sqliteTable(
  "usage_counters",
  {
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    periodStart: text("period_start").notNull(),
    used: integer("used").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.metric, table.periodStart],
    }),
  ],
);

export const authorizationAuditLogsTable = sqliteTable(
  "authorization_audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text("actor_user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    targetUserId: text("target_user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    previousValue: text("previous_value"),
    currentValue: text("current_value"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("authorization_audit_logs_target_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
    index("authorization_audit_logs_actor_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  ],
);

// ============================================================
// Better Auth 必須テーブル
// ============================================================

export const userTable = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  role: text("role").notNull().default("user"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plansTable.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessionTable = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
});

export const accountTable = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verificationTable = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ============================================================
// アプリケーションテーブル
// ============================================================

export const memosTable = sqliteTable(
  "memos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    url: text("url"),
    categoryId: text("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    isAiSummary: int("is_ai_summary").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("memos_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export const linkPreviewCacheTable = sqliteTable(
  "link_preview_cache",
  {
    normalizedUrl: text("normalized_url").primaryKey(),
    title: text("title"),
    description: text("description"),
    imageUrl: text("image_url"),
    cardType: text("card_type"),
    status: text("status").notNull().default("pending"),
    failureCount: integer("failure_count").notNull().default(0),
    fetchedAt: text("fetched_at"),
    expiresAt: text("expires_at"),
    retryAfter: text("retry_after"),
    lastReferencedAt: text("last_referenced_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    leaseUntil: text("lease_until"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("link_preview_cache_maintenance_idx").on(
      table.lastReferencedAt,
      table.leaseUntil,
    ),
    check(
      "link_preview_cache_card_type",
      sql`${table.cardType} IS NULL OR ${table.cardType} IN ('summary', 'summary_large_image')`,
    ),
    check(
      "link_preview_cache_status",
      sql`${table.status} IN ('pending', 'fetching', 'ready', 'failed')`,
    ),
    check(
      "link_preview_cache_failure_count_non_negative",
      sql`${table.failureCount} >= 0`,
    ),
  ],
);

export const categoriesTable = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("categories_user_id_idx").on(table.userId),
    uniqueIndex("categories_user_id_name_unique").on(table.userId, table.name),
  ],
);

export const tagsTable = sqliteTable(
  "tags",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("tags_user_id_idx").on(table.userId),
    uniqueIndex("tags_user_id_name_unique").on(table.userId, table.name),
  ],
);

export const memoTagsTable = sqliteTable(
  "memo_tags",
  {
    memoId: text("memo_id")
      .notNull()
      .references(() => memosTable.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    primaryKey({ columns: [table.memoId, table.tagId] }),
    index("memo_tags_tag_id_idx").on(table.tagId),
  ],
);

export const memoAttachmentsTable = sqliteTable(
  "memo_attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    memoId: text("memo_id")
      .notNull()
      .references(() => memosTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull().unique(),
    thumbnailR2Key: text("thumbnail_r2_key").unique(),
    thumbnailContentType: text("thumbnail_content_type"),
    thumbnailSizeBytes: integer("thumbnail_size_bytes"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    mediaWidth: integer("media_width"),
    mediaHeight: integer("media_height"),
    etag: text("etag").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("memo_attachments_memo_id_idx").on(table.memoId, table.createdAt),
    index("memo_attachments_user_id_idx").on(table.userId),
    check(
      "memo_attachments_size_bytes_non_negative",
      sql`${table.sizeBytes} >= 0`,
    ),
    check(
      "memo_attachments_thumbnail_fields",
      sql`(${table.thumbnailR2Key} IS NULL AND ${table.thumbnailContentType} IS NULL AND ${table.thumbnailSizeBytes} IS NULL)
        OR (${table.thumbnailR2Key} IS NOT NULL AND ${table.thumbnailContentType} IN ('image/avif', 'image/webp') AND ${table.thumbnailSizeBytes} > 0)`,
    ),
    check(
      "memo_attachments_media_dimensions_pair",
      sql`(${table.mediaWidth} IS NULL AND ${table.mediaHeight} IS NULL)
        OR (${table.mediaWidth} > 0 AND ${table.mediaHeight} > 0)`,
    ),
  ],
);

export const attachmentUploadReservationsTable = sqliteTable(
  "attachment_upload_reservations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    memoId: text("memo_id"),
    shareIntakeId: text("share_intake_id"),
    r2Key: text("r2_key").notNull().unique(),
    thumbnailR2Key: text("thumbnail_r2_key").unique(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("attachment_upload_reservations_user_expires_idx").on(
      table.userId,
      table.status,
      table.expiresAt,
    ),
    index("attachment_upload_reservations_memo_idx").on(table.memoId),
    index("attachment_upload_reservations_share_idx").on(table.shareIntakeId),
    check(
      "attachment_upload_reservations_size_positive",
      sql`${table.sizeBytes} > 0`,
    ),
    check(
      "attachment_upload_reservations_status",
      sql`${table.status} IN ('pending', 'cleaning')`,
    ),
  ],
);

export const r2DeletionJobsTable = sqliteTable(
  "r2_deletion_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerUserId: text("owner_user_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: text("next_attempt_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    leaseUntil: text("lease_until"),
    lastFailure: text("last_failure"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("r2_deletion_jobs_due_idx").on(
      table.status,
      table.nextAttemptAt,
      table.leaseUntil,
    ),
    check(
      "r2_deletion_jobs_status",
      sql`${table.status} IN ('pending', 'processing', 'failed')`,
    ),
    check(
      "r2_deletion_jobs_attempt_count",
      sql`${table.attemptCount} BETWEEN 0 AND 8`,
    ),
  ],
);

export const shareIntakesTable = sqliteTable(
  "share_intakes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    text: text("text").notNull(),
    url: text("url"),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("share_intakes_user_id_idx").on(table.userId, table.createdAt),
    index("share_intakes_status_expires_at_idx").on(
      table.status,
      table.expiresAt,
    ),
  ],
);

export const shareIntakeFilesTable = sqliteTable(
  "share_intake_files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    shareIntakeId: text("share_intake_id")
      .notNull()
      .references(() => shareIntakesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    reservationId: text("reservation_id").notNull().unique(),
    r2Key: text("r2_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    etag: text("etag").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("share_intake_files_share_intake_id_idx").on(
      table.shareIntakeId,
      table.createdAt,
    ),
    index("share_intake_files_user_id_idx").on(table.userId),
    check(
      "share_intake_files_size_bytes_non_negative",
      sql`${table.sizeBytes} >= 0`,
    ),
  ],
);

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  memos: many(memosTable),
}));

export const tagsRelations = relations(tagsTable, ({ many }) => ({
  memoTags: many(memoTagsTable),
}));

export const memoTagsRelations = relations(memoTagsTable, ({ one }) => ({
  memo: one(memosTable, {
    fields: [memoTagsTable.memoId],
    references: [memosTable.id],
  }),
  tag: one(tagsTable, {
    fields: [memoTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

export const memoAttachmentsRelations = relations(
  memoAttachmentsTable,
  ({ one }) => ({
    memo: one(memosTable, {
      fields: [memoAttachmentsTable.memoId],
      references: [memosTable.id],
    }),
    user: one(userTable, {
      fields: [memoAttachmentsTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const shareIntakesRelations = relations(
  shareIntakesTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [shareIntakesTable.userId],
      references: [userTable.id],
    }),
    files: many(shareIntakeFilesTable),
  }),
);

export const shareIntakeFilesRelations = relations(
  shareIntakeFilesTable,
  ({ one }) => ({
    intake: one(shareIntakesTable, {
      fields: [shareIntakeFilesTable.shareIntakeId],
      references: [shareIntakesTable.id],
    }),
    user: one(userTable, {
      fields: [shareIntakeFilesTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const memosRelations = relations(memosTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [memosTable.categoryId],
    references: [categoriesTable.id],
  }),
  memoTags: many(memoTagsTable),
  attachments: many(memoAttachmentsTable),
}));
