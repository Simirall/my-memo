import { and, asc, eq } from "drizzle-orm";
import type { AppDb } from "@/features/access-control/authorization";
import type { Tag, TagSuggestions } from "@/features/tags/model/tags";
import { memosTable, memoTagsTable, tagsTable } from "@/schema";

export async function getUserTags(db: AppDb, userId: string): Promise<Tag[]> {
  return db
    .select({ id: tagsTable.id, name: tagsTable.name })
    .from(tagsTable)
    .where(eq(tagsTable.userId, userId))
    .orderBy(asc(tagsTable.name));
}

export async function getTagSuggestions(
  db: AppDb,
  userId: string,
): Promise<TagSuggestions> {
  // タグ→関連付け→メモの順に固定し、タグごとの全メモ走査を防ぐ。
  const rows = await db
    .selectDistinct({
      id: tagsTable.id,
      name: tagsTable.name,
      categoryId: memosTable.categoryId,
    })
    .from(tagsTable)
    .crossJoin(memoTagsTable)
    .crossJoin(memosTable)
    .where(
      and(
        eq(tagsTable.userId, userId),
        eq(memosTable.userId, userId),
        eq(memoTagsTable.tagId, tagsTable.id),
        eq(memosTable.id, memoTagsTable.memoId),
      ),
    )
    .orderBy(asc(tagsTable.name));

  const all = new Map<string, Tag>();
  const byCategory: Record<string, Tag[]> = {};
  for (const { categoryId, ...tag } of rows) {
    all.set(tag.id, tag);
    if (!categoryId) continue;
    const categoryTags = byCategory[categoryId] ?? [];
    categoryTags.push(tag);
    byCategory[categoryId] = categoryTags;
  }
  const sortTags = (tags: Tag[]) =>
    tags.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  for (const tags of Object.values(byCategory)) sortTags(tags);
  return { all: sortTags([...all.values()]), byCategory };
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
