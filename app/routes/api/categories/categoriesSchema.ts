import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { categoriesTable } from "../../../schema";

export const categorySchema = {
  read: createSelectSchema(categoriesTable),
  create: createInsertSchema(categoriesTable, {
    userEmail: (schema) => schema.optional(),
    name: (schema) => schema.max(50, "50文字以内で入力してください"),
  }),
};
