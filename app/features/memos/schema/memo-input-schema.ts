import z from "zod";
import { isSafeMemoUrl } from "@/features/memos/model/memo-url";
import { parseTagNamesField } from "@/features/tags/data/tags";

export const tagNamesField = z.preprocess((value) => {
  const result = parseTagNamesField(value);
  return result.ok ? result.names : z.NEVER;
}, z.array(z.string()));
export const memoTitleField = z
  .string()
  .max(255, "255文字以内で入力してください");
export const memoContentField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().max(10000, "10,000文字以内で入力してください").nullable(),
);
export const memoUrlField = z
  .string()
  .max(2048, "2048文字以内で入力してください")
  .refine(isSafeMemoUrl, "httpまたはhttpsのURLを入力してください");
export const optionalMemoUrlField = z.preprocess(
  (value) => (value === "" ? null : value),
  memoUrlField.nullable().optional(),
);

// ブラウザーとAPIで同じ入力規則を使い、DBスキーマ生成処理をブラウザーへ持ち込まない。
export const memoBulkSchema = z.object({
  title: memoTitleField.refine(
    (value) => value.trim().length > 0,
    "タイトルを入力してください",
  ),
  content: memoContentField,
  url: optionalMemoUrlField,
  categoryId: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().nullable().optional(),
  ),
  tags: tagNamesField,
});
