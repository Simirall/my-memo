import { useEffect, useRef, useState } from "hono/jsx";
import z from "zod";
import { goToMemoList } from "@/features/memos/input/memo-create-navigation";
import { memoBulkSchema } from "@/features/memos/schema/memo-input-schema";
import type { Tag, TagSuggestions } from "@/features/tags/data/tags";
import { TagInput } from "@/features/tags/input/tag-input";

type Row = {
  id: string;
  title: string;
  content: string;
  url: string;
  categoryId: string;
  tags: Tag[];
  tagQuery: string;
  state: "draft" | "saved" | "unknown";
};

const newRow = (id: string = crypto.randomUUID()): Row => ({
  id,
  title: "",
  content: "",
  url: "",
  categoryId: "",
  tags: [],
  tagQuery: "",
  state: "draft",
});

const isEmpty = (row: Row) =>
  !row.title.trim() &&
  !row.content.trim() &&
  !row.url.trim() &&
  !row.categoryId &&
  row.tags.length === 0 &&
  !row.tagQuery.trim();

export default function BulkMemoForm({
  initialMemoId,
  categories,
  tags,
  tagSuggestions,
}: {
  initialMemoId: string;
  categories: ReadonlyArray<{ id: string; name: string }>;
  tags: ReadonlyArray<Tag>;
  tagSuggestions: TagSuggestions;
}) {
  const [rows, setRows] = useState<Row[]>([newRow(initialMemoId)]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const currentRows = useRef(rows);
  const busyRef = useRef(false);
  useEffect(() => setReady(true), []);
  const replaceRows = (next: Row[]) => {
    currentRows.current = next;
    setRows(next);
  };
  const addRow = () => {
    if (!busyRef.current && currentRows.current.length < 30) {
      replaceRows([...currentRows.current, newRow()]);
    }
  };
  const changeRow = (id: string, patch: Partial<Row>) => {
    const next = currentRows.current.map((row) =>
      row.id === id ? { ...row, ...patch } : row,
    );
    const last = next.at(-1);
    if (
      !busyRef.current &&
      next.length < 30 &&
      last?.id === id &&
      !isEmpty(last)
    ) {
      next.push(newRow());
    }
    replaceRows(next);
  };

  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice("");
    const failures: string[] = [];
    const report = (id: string, message: string) => {
      const number = currentRows.current.findIndex((row) => row.id === id) + 1;
      failures.push(`メモ${number}: ${message}`);
    };
    try {
      for (const row of [...currentRows.current]) {
        if (row.state === "saved" || isEmpty(row)) continue;
        const parsed = memoBulkSchema.safeParse({
          title: row.title,
          content: row.content,
          url: row.url,
          categoryId: row.categoryId,
          tags: [
            ...row.tags.map((tag) => tag.name),
            ...(row.tagQuery.trim() ? [row.tagQuery] : []),
          ],
        });
        if (!parsed.success) {
          report(
            row.id,
            parsed.error.issues[0]?.message ?? "入力内容が不正です。",
          );
          continue;
        }
        const data = parsed.data;
        changeRow(row.id, {
          tags: data.tags.map(
            (name) =>
              tags.find((tag) => tag.name === name) ?? {
                id: `new-${name}`,
                name,
              },
          ),
          tagQuery: "",
        });
        try {
          const response = await fetch(`/api/memos/bulk/${row.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
            redirect: "error",
          });
          const result = z
            .object({
              memoId: z.string().optional(),
              message: z.string().optional(),
              saved: z.boolean().optional(),
            })
            .parse(await response.json());
          if (response.ok && result.memoId === row.id) {
            changeRow(row.id, { state: "saved" });
            continue;
          }
          if (![400, 401, 403, 409, 413].includes(response.status))
            throw new Error("unknown result");
          if (result.saved === false) changeRow(row.id, { state: "draft" });
          report(row.id, result.message ?? "保存できませんでした。");
          if (response.status === 401 || response.status === 403) break;
        } catch {
          changeRow(row.id, { state: "unknown" });
          report(
            row.id,
            "保存結果を確認できませんでした。接続・ログイン状態を確認し、まとめて保存で再試行してください。後続の保存は停止しました。",
          );
          break;
        }
      }
    } finally {
      setNotice(failures.join("\n"));
      busyRef.current = false;
      setBusy(false);
    }
    if (
      failures.length === 0 &&
      currentRows.current.some((row) => row.state === "saved")
    )
      goToMemoList();
  };

  return (
    <form
      action="/memos/create/bulk"
      className="space-y-4"
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {notice && (
        <div className="toast toast-end toast-bottom z-50">
          <div
            className="alert alert-error max-h-80 w-[min(32rem,calc(100vw-2rem))] overflow-y-auto"
            role="alert"
          >
            <span className="whitespace-pre-line">{notice}</span>
            <button
              aria-label="通知を閉じる"
              className="btn btn-ghost btn-sm"
              onClick={() => setNotice("")}
              type="button"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table min-w-[70rem] table-fixed text-base">
          <caption className="sr-only">メモの一括入力</caption>
          <thead>
            <tr>
              <th className="w-16" scope="col">
                番号
              </th>
              <th scope="col">タイトル（必須）</th>
              <th className="w-1/4" scope="col">
                本文
              </th>
              <th scope="col">URL</th>
              <th scope="col">カテゴリー</th>
              <th scope="col">タグ</th>
              <th className="w-28" scope="col">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const locked =
                !ready ||
                busy ||
                row.state === "saved" ||
                row.state === "unknown";
              return (
                <tr aria-label={`メモ${index + 1}`} key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <label className="sr-only" htmlFor={`${row.id}-title`}>
                      タイトル（必須）
                    </label>
                    <input
                      className="input w-full"
                      disabled={locked}
                      id={`${row.id}-title`}
                      maxLength={255}
                      name={`title-${row.id}`}
                      onInput={(event) =>
                        changeRow(row.id, {
                          title: (event.currentTarget as HTMLInputElement)
                            .value,
                          state: "draft",
                        })
                      }
                      required
                      value={row.title}
                    />
                  </td>
                  <td className="w-1/4">
                    <label className="sr-only" htmlFor={`${row.id}-content`}>
                      本文
                    </label>
                    <textarea
                      className="textarea h-10 min-h-10 w-full resize-y"
                      disabled={locked}
                      id={`${row.id}-content`}
                      maxLength={10000}
                      name={`content-${row.id}`}
                      onInput={(event) =>
                        changeRow(row.id, {
                          content: (event.currentTarget as HTMLTextAreaElement)
                            .value,
                          state: "draft",
                        })
                      }
                      rows={1}
                      value={row.content}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`${row.id}-url`}>
                      URL
                    </label>
                    <input
                      className="input w-full"
                      disabled={locked}
                      id={`${row.id}-url`}
                      maxLength={2048}
                      name={`url-${row.id}`}
                      onInput={(event) =>
                        changeRow(row.id, {
                          url: (event.currentTarget as HTMLInputElement).value,
                          state: "draft",
                        })
                      }
                      type="url"
                      value={row.url}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`${row.id}-category`}>
                      カテゴリー
                    </label>
                    <select
                      className="select w-full"
                      disabled={locked}
                      id={`${row.id}-category`}
                      name={`category-${row.id}`}
                      onChange={(event) =>
                        changeRow(row.id, {
                          categoryId: (event.currentTarget as HTMLSelectElement)
                            .value,
                          state: "draft",
                        })
                      }
                      value={row.categoryId}
                    >
                      <option value="">未分類</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <fieldset className="min-w-0" disabled={locked}>
                      <label className="sr-only" htmlFor={`${row.id}-tags`}>
                        タグ
                      </label>
                      <TagInput
                        availableTags={tags}
                        compact
                        initialTags={row.tags}
                        inputId={`${row.id}-tags`}
                        name={`tags-${row.id}`}
                        onQueryChange={(tagQuery) =>
                          changeRow(row.id, { tagQuery })
                        }
                        onTagsChange={(selected) =>
                          changeRow(row.id, {
                            tags: selected,
                            state: "draft",
                          })
                        }
                        queryValue={row.tagQuery}
                        suggestedTags={
                          row.categoryId
                            ? (tagSuggestions.byCategory[row.categoryId] ?? [])
                            : tagSuggestions.all
                        }
                        value={row.tags}
                      />
                    </fieldset>
                  </td>
                  <td className="w-28">
                    <button
                      aria-label={`メモ${index + 1}の行を削除`}
                      className="btn btn-soft btn-error"
                      disabled={!ready || busy || row.state === "unknown"}
                      onClick={() => {
                        const next = currentRows.current.filter(
                          (candidate) => candidate.id !== row.id,
                        );
                        replaceRows(next.length ? next : [newRow()]);
                      }}
                      type="button"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <a className="btn mr-auto" href="/">
          メモ一覧へ
        </a>
        <button
          className="btn"
          disabled={!ready || busy || rows.length >= 30}
          onClick={addRow}
          type="button"
        >
          行を追加
        </button>
        <button
          className={`btn btn-soft ${!busy && "btn-primary"}`}
          disabled={
            !ready ||
            busy ||
            rows.every((row) => row.state === "saved" || isEmpty(row))
          }
          onClick={() => {
            void save();
          }}
          type="button"
        >
          {busy ? "保存しています…" : "まとめて保存"}
        </button>
      </div>
    </form>
  );
}
