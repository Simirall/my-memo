import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { categoriesTable } from "@/schema";

export const categorySchema = {
  read: createSelectSchema(categoriesTable),
  create: createInsertSchema(categoriesTable, {
    userId: (schema) => schema.optional(),
    name: (schema) =>
      schema
        .trim()
        .min(1, "カテゴリー名を入力してください")
        .max(50, "50文字以内で入力してください"),
  }),
  rename: z.object({
    name: z
      .string()
      .trim()
      .min(1, "カテゴリー名を入力してください")
      .max(50, "50文字以内で入力してください"),
    excludeFromAll: z.boolean(),
  }),
  reorder: z.object({
    categoryIds: z.array(z.string().min(1)),
  }),
};
