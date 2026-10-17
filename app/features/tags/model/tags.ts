export const MAX_TAGS_PER_MEMO = 10;
export const MAX_TAG_NAME_LENGTH = 30;

export type Tag = {
  id: string;
  name: string;
};

export type TagSuggestions = {
  all: ReadonlyArray<Tag>;
  byCategory: Readonly<Record<string, ReadonlyArray<Tag>>>;
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
