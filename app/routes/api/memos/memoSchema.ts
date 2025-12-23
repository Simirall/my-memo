import { createInsertSchema } from "drizzle-zod";
import { memosTable } from "../../../schema";

export const memoSchema = {
  create: createInsertSchema(memosTable, {
    userEmail: (schema) => schema.optional(),
    title: (schema) => schema.max(255, "255文字以内で入力してください"),
    content: (schema) => schema.max(10000, "10,000文字以内で入力してください"),
  }),
};
