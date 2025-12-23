import { relations, sql } from "drizzle-orm";
import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const memosTable = sqliteTable(
  "memos",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userEmail: text("user_email").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    categoryId: text("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    aiGenerated: int("ai_generated").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("user_email_created_at_idx").on(table.userEmail, table.createdAt),
  ],
);

export const categoriesTable = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userEmail: text("user_email").notNull(),
    name: text("name").notNull().unique(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [index("categories_user_email_idx").on(table.userEmail)],
);

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  memos: many(memosTable),
}));

export const memosRelations = relations(memosTable, ({ one }) => ({
  category: one(categoriesTable, {
    fields: [memosTable.categoryId],
    references: [categoriesTable.id],
  }),
}));
