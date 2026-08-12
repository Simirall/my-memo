import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { categoriesTable } from "@/schema";

export const getUserCategories = (database: D1Database, userId: string) => {
  const db = drizzle(database);
  return db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(
      asc(categoriesTable.sortOrder),
      asc(categoriesTable.name),
      asc(categoriesTable.id),
    );
};
