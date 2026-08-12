import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import { isSafeMemoUrl } from "@/features/memos/model/memo-url";
import {
  normalizeTagNames,
  parseTagNamesField,
} from "@/features/tags/data/tags";
import { memosTable } from "@/schema";

const tagNamesField = z.preprocess((value) => {
  const result = parseTagNamesField(value);
  if (!result.ok) return z.NEVER;
  return result.names;
}, z.array(z.string()));

const memoReadSchema = createSelectSchema(memosTable);
const memoContentField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().max(10000, "10,000文字以内で入力してください").nullable(),
);
const memoUrlField = z
  .string()
  .max(2048, "2048文字以内で入力してください")
  .refine(isSafeMemoUrl, "httpまたはhttpsのURLを入力してください");
const mediaDimensionsField = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return [];
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
  z.array(
    z.object({
      fileId: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
);
export const memoWithTagsSchema = memoReadSchema.extend({
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const tagUpdateSchema = z
  .object({
    tags: z.array(z.string()),
  })
  .superRefine((value, ctx) => {
    const result = normalizeTagNames(value.tags);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.message, path: ["tags"] });
    }
  });

export const memoSchema = {
  read: memoReadSchema,
  create: createInsertSchema(memosTable, {
    userId: (schema) => schema.optional(),
    title: (schema) => schema.max(255, "255文字以内で入力してください"),
    url: () => memoUrlField.optional(),
    categoryId: (schema) =>
      schema.transform((val) => {
        if (val === "") return null;
        return val;
      }),
  }).extend({
    content: memoContentField,
    tags: tagNamesField,
    mediaDimensions: mediaDimensionsField,
  }),
  update: createInsertSchema(memosTable, {
    userId: (schema) => schema.optional(),
    title: (schema) => schema.max(255, "255文字以内で入力してください"),
    url: () => memoUrlField.nullable().optional(),
    categoryId: (schema) => schema.nullable().optional(),
    isAiSummary: (schema) => schema.optional(),
  })
    .omit({ isAiSummary: true })
    .extend({
      content: memoContentField,
      tags: tagNamesField,
      deleteAttachmentIds: z.array(z.string()).default([]),
      stagedAttachments: z
        .array(
          z.object({
            reservationId: z.string().min(1),
            token: z.string().min(1),
            thumbnailToken: z.string().min(1).nullable(),
            thumbnailContentType: z
              .enum(["image/avif", "image/webp"])
              .nullable(),
            thumbnailSizeBytes: z.number().int().positive().nullable(),
            fileName: z.string().min(1).max(255),
            contentType: z.string().min(1).max(255),
            sizeBytes: z.number().int().nonnegative(),
            mediaWidth: z.number().int().positive().nullable(),
            mediaHeight: z.number().int().positive().nullable(),
            etag: z.string().min(1),
          }),
        )
        .default([]),
    }),
  url: z.object({
    url: memoUrlField,
    category: z
      .string()
      .transform((val) => {
        if (val === "") return null;
        return val;
      })
      .optional(),
    tags: tagNamesField,
  }),
};
