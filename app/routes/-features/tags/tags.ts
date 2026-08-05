import { asc, eq } from "drizzle-orm";
import { tagsTable } from "@/schema";
import type { AppDb } from "@/utils/authorization";

export const MAX_TAGS_PER_MEMO = 10;
export const MAX_TAG_NAME_LENGTH = 30;

export type Tag = {
  id: string;
  name: string;
};

export type TagNamesResult =
  | { ok: true; names: string[] }
  | { ok: false; message: string };

export function normalizeTagNames(input: readonly string[]): TagNamesResult {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    const name = raw.trim();
    if (!name) {
      return { ok: false, message: "タグ名を入力してください。" };
    }
    if (name.length > MAX_TAG_NAME_LENGTH) {
      return {
        ok: false,
        message: `タグ名は${MAX_TAG_NAME_LENGTH}文字以内で入力してください。`,
      };
    }
    if (/\s/u.test(name)) {
      return { ok: false, message: "タグ名に空白は使用できません。" };
    }
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  if (names.length > MAX_TAGS_PER_MEMO) {
    return {
      ok: false,
      message: `1つのメモに設定できるタグは${MAX_TAGS_PER_MEMO}個までです。`,
    };
  }

  return { ok: true, names };
}

export function parseTagNamesField(value: unknown): TagNamesResult {
  if (value === undefined || value === null || value === "") {
    return { ok: true, names: [] };
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return normalizeTagNames(value);
  }
  if (typeof value !== "string") {
    return { ok: false, message: "タグの形式が不正です。" };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === "string")
    ) {
      return { ok: false, message: "タグの形式が不正です。" };
    }
    return normalizeTagNames(parsed);
  } catch {
    return { ok: false, message: "タグの形式が不正です。" };
  }
}

export async function getUserTags(db: AppDb, userId: string): Promise<Tag[]> {
  return db
    .select({ id: tagsTable.id, name: tagsTable.name })
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId))
    .orderBy(asc(tagsTable.name));
}

export async function replaceMemoTags(
  db: D1Database,
  memoId: string,
  userId: string,
  names: readonly string[],
): Promise<void> {
  const statements = names.flatMap((name) => [
    db
      .prepare(
        `INSERT INTO tags (id, user_id, name)
         SELECT ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM memos WHERE id = ? AND user_id = ?)
         ON CONFLICT(user_id, name) DO NOTHING`,
      )
      .bind(crypto.randomUUID(), userId, name, memoId, userId),
  ]);

  statements.push(
    db.prepare("DELETE FROM memo_tags WHERE memo_id = ?").bind(memoId),
  );

  // Re-add the requested rows after clearing the previous set. Keeping this
  // in one D1 batch makes the replacement atomic from the user's perspective.
  for (const name of names) {
    statements.push(
      db
        .prepare(
          `INSERT INTO memo_tags (memo_id, tag_id)
           SELECT ?, id
           FROM tags
           WHERE user_id = ? AND name = ?`,
        )
        .bind(memoId, userId, name),
    );
  }

  await db.batch(statements);
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;

  describe("タグ入力の検証", () => {
    it("前後空白を除去し、完全一致の重複をまとめる", () => {
      expect(normalizeTagNames(["  仕事", "仕事", "React"])).toEqual({
        ok: true,
        names: ["仕事", "React"],
      });
    });

    it("空白、長すぎる名前、タグ数超過を拒否する", () => {
      expect(normalizeTagNames(["   "]).ok).toBe(false);
      expect(normalizeTagNames(["仕事 メモ"]).ok).toBe(false);
      expect(normalizeTagNames(["a".repeat(31)]).ok).toBe(false);
      expect(
        normalizeTagNames(
          Array.from({ length: MAX_TAGS_PER_MEMO + 1 }, (_, index) =>
            String(index),
          ),
        ).ok,
      ).toBe(false);
    });

    it("フォームのJSON配列を読み取る", () => {
      expect(parseTagNamesField(JSON.stringify(["a", "b"]))).toEqual({
        ok: true,
        names: ["a", "b"],
      });
      expect(parseTagNamesField("not-json").ok).toBe(false);
    });
  });
}
