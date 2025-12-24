import { createInsertSchema } from "drizzle-zod";
import z from "zod";
import { memosTable } from "../../../schema";

export const memoSchema = {
  create: createInsertSchema(memosTable, {
    userEmail: (schema) => schema.optional(),
    title: (schema) => schema.max(255, "255文字以内で入力してください"),
    content: (schema) => schema.max(10000, "10,000文字以内で入力してください"),
    categoryId: (schema) =>
      schema.transform((val) => {
        if (val === "") return null;
        return val;
      }),
  }),
  url: z.object({
    url: z.url("有効なURLを入力してください"),
    category: z
      .string()
      .transform((val) => {
        if (val === "") return null;
        return val;
      })
      .optional(),
  }),
};
