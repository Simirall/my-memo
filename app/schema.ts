import { sql } from "drizzle-orm";
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
    categoryId: text("category_id"),
    aiGenerated: int("ai_generated").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("user_email_created_at_idx").on(table.userEmail, table.createdAt),
  ],
);
