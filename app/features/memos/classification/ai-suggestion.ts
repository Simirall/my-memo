import z from "zod";
import {
  MAX_TAGS_PER_MEMO,
  normalizeTagNames,
} from "@/features/tags/data/tags";

const CATEGORY_LIMIT = 254;
const TAG_LIMIT = 100;
const QUESTIONS_PER_REQUEST = 64;
const THRESHOLD = 0.7;
const MAX_SUGGESTED_TAGS = 3;
const NONE_CATEGORY = "none";

export const memoClassificationInputSchema = z.object({
  title: z.string().max(255),
  content: z.string().max(10000),
  currentCategoryId: z.string().nullable(),
  currentTags: z.array(z.string()).max(MAX_TAGS_PER_MEMO),
});

export type MemoClassificationInput = z.infer<
  typeof memoClassificationInputSchema
>;

export type MemoClassificationSuggestion = {
  categoryId: string | null;
  tags: Array<{ id: string; name: string }>;
  candidatesLimited: boolean;
};

export class NoClassificationCandidatesError extends Error {}

type Candidate = { id: string; name: string; usageCount: number };

const getCandidates = async (
  db: D1Database,
  userId: string,
  currentTags: readonly string[],
) => {
  const selected = new Set(currentTags);
  const [categoryRows, tagRows] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.name, COUNT(m.id) AS usageCount
         FROM categories AS c
         LEFT JOIN memos AS m ON m.category_id = c.id AND m.user_id = c.user_id
         WHERE c.user_id = ?
         GROUP BY c.id, c.name
         ORDER BY usageCount DESC, c.name ASC, c.id ASC
         LIMIT ?`,
      )
      .bind(userId, CATEGORY_LIMIT + 1)
      .all<Candidate>(),
    db
      .prepare(
        `SELECT t.id, t.name, COUNT(mt.memo_id) AS usageCount
         FROM tags AS t
         LEFT JOIN memo_tags AS mt ON mt.tag_id = t.id
         WHERE t.user_id = ?
         GROUP BY t.id, t.name
         ORDER BY usageCount DESC, t.name ASC, t.id ASC`,
      )
      .bind(userId)
      .all<Candidate>(),
  ]);
  const availableTags = tagRows.results.filter(
    (tag) => !selected.has(tag.name),
  );
  return {
    categories: categoryRows.results.slice(0, CATEGORY_LIMIT),
    tags: availableTags.slice(0, TAG_LIMIT),
    candidatesLimited:
      categoryRows.results.length > CATEGORY_LIMIT ||
      availableTags.length > TAG_LIMIT,
  };
};

const probability = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1
    ? value
    : null;

async function classifyMemo(
  env: CloudflareBindings,
  userId: string,
  input: MemoClassificationInput,
): Promise<MemoClassificationSuggestion> {
  const normalizedTags = normalizeTagNames(input.currentTags);
  if (!normalizedTags.ok) throw new Error(normalizedTags.message);
  if (!input.title.trim() && !input.content.trim()) {
    throw new NoClassificationCandidatesError("判断する内容がありません。");
  }

  const candidates = await getCandidates(
    env.MY_MEMO_D1,
    userId,
    normalizedTags.names,
  );
  const tagCandidates =
    normalizedTags.names.length < MAX_TAGS_PER_MEMO ? candidates.tags : [];
  const questions: Record<string, Record<string, unknown>> = {};
  if (!input.currentCategoryId && candidates.categories.length > 0) {
    questions.category = {
      type: "choice",
      instructions:
        "このメモに最も適したカテゴリーを選んでください。該当しなければnoneを選んでください。",
      criteria: Object.fromEntries([
        ...candidates.categories.map((category) => [
          category.id,
          category.name,
        ]),
        [NONE_CATEGORY, "どのカテゴリーにも該当しない"],
      ]),
    };
  }
  tagCandidates.forEach((tag, index) => {
    questions[`tag_${index}`] = {
      type: "noul",
      instructions: "このメモにこのタグを付けるのが適切ですか？",
      criteria: {
        true: `タグ「${tag.name}」が内容を具体的に表す`,
        false: `タグ「${tag.name}」は内容を表さない`,
      },
    };
  });
  if (Object.keys(questions).length === 0) {
    throw new NoClassificationCandidatesError("提案できる候補がありません。");
  }

  const answers: Record<string, unknown> = {};
  const entries = Object.entries(questions);
  // Clefは1リクエスト64問まで。全バッチの成功後に利用回数を確定する。
  for (
    let offset = 0;
    offset < entries.length;
    offset += QUESTIONS_PER_REQUEST
  ) {
    const batch = Object.fromEntries(
      entries.slice(offset, offset + QUESTIONS_PER_REQUEST),
    );
    const response = await env.AI.run("@cf/cloudflare/clef", {
      model: "clef",
      state: { title: input.title, content: input.content },
      questions: batch,
    });
    if (
      !response.answers ||
      typeof response.answers !== "object" ||
      Array.isArray(response.answers)
    ) {
      throw new Error("AIサジェストの応答が不正です。");
    }
    const batchAnswers = response.answers as Record<string, unknown>;
    for (const key of Object.keys(batch)) answers[key] = batchAnswers[key];
  }

  let categoryId: string | null = null;
  if (questions.category) {
    const answer = (answers as Record<string, unknown>).category;
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      throw new Error("カテゴリー候補の応答が不正です。");
    }
    const choice = (answer as Record<string, unknown>).choice;
    const probabilities = (answer as Record<string, unknown>).probabilities;
    if (
      (answer as Record<string, unknown>).type !== "choice" ||
      typeof choice !== "string" ||
      !probabilities ||
      typeof probabilities !== "object" ||
      Array.isArray(probabilities)
    ) {
      throw new Error("カテゴリー候補の応答が不正です。");
    }
    if (
      choice !== NONE_CATEGORY &&
      !candidates.categories.some((category) => category.id === choice)
    ) {
      throw new Error("カテゴリー候補の応答が不正です。");
    }
    const selectedProbability = probability(
      (probabilities as Record<string, unknown>)[choice],
    );
    if (selectedProbability === null) {
      throw new Error("カテゴリー候補の確率が不正です。");
    }
    if (choice !== NONE_CATEGORY && selectedProbability >= THRESHOLD) {
      categoryId = choice;
    }
  }

  const tags = tagCandidates
    .map((tag, index) => {
      const answer = (answers as Record<string, unknown>)[`tag_${index}`];
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
        throw new Error("タグ候補の応答が不正です。");
      }
      if ((answer as Record<string, unknown>).type !== "noul") {
        throw new Error("タグ候補の応答が不正です。");
      }
      const score = probability((answer as Record<string, unknown>).noul);
      if (score === null) throw new Error("タグ候補の確率が不正です。");
      return { tag, score };
    })
    .filter(({ score }) => score >= THRESHOLD)
    .sort(
      (a, b) => b.score - a.score || a.tag.name.localeCompare(b.tag.name, "ja"),
    )
    .slice(
      0,
      Math.min(
        MAX_SUGGESTED_TAGS,
        MAX_TAGS_PER_MEMO - normalizedTags.names.length,
      ),
    )
    .map(({ tag }) => ({ id: tag.id, name: tag.name }));

  return { categoryId, tags, candidatesLimited: candidates.candidatesLimited };
}

export async function suggestMemoClassification(
  env: CloudflareBindings,
  userId: string,
  input: MemoClassificationInput,
): Promise<MemoClassificationSuggestion> {
  try {
    return await classifyMemo(env, userId, input);
  } catch (error) {
    if (!(error instanceof NoClassificationCandidatesError)) {
      const details =
        error !== null && typeof error === "object"
          ? (error as Record<string, unknown>)
          : {};
      console.error(
        JSON.stringify({
          event: "memo_classification_failed",
          errorType: error instanceof Error ? error.name : typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorCode: details.code,
          errorStatus: details.status,
        }),
      );
    }
    throw error;
  }
}
