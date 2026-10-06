import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import z from "zod";
import {
  memoContentField,
  memoTitleField,
  memoUrlField,
  optionalMemoUrlField,
  tagNamesField,
} from "@/features/memos/schema/memo-input-schema";
import { normalizeTagNames } from "@/features/tags/data/tags";
import { memosTable } from "@/schema";

const memoReadSchema = createSelectSchema(memosTable);
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
    title: () => memoTitleField,
    url: () => optionalMemoUrlField,
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
    title: () => memoTitleField,
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
    classificationMode: z.enum(["none", "manual", "ai"]).default("none"),
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
