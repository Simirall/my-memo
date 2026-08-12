import type { MemoListQuery } from "@/features/memos/list/query/memo-list-query";
import type { Tag } from "@/features/tags/data/tags";
import { MEMO_LIST_CONTROLS_OPEN_COOKIE } from "./memo-list-controls-state";

export default function MemoListControls({
  action,
  initialOpen = false,
  query,
  tags,
}: {
  action: string;
  initialOpen?: boolean;
  query: MemoListQuery;
  tags: ReadonlyArray<Tag>;
}) {
  const persistOpenState = (event: Event) => {
    const details = event.currentTarget as HTMLDetailsElement;
    // biome-ignore lint/suspicious/noDocumentCookie: 次のGETより前に同期的にSSR用の状態を保存する。
    document.cookie = `${MEMO_LIST_CONTROLS_OPEN_COOKIE}=${details.open ? "1" : "0"}; Path=/; SameSite=Lax`;
  };

  const submit = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const form = select.form;
    if (!form) return;

    const searchParams = new URLSearchParams();
    new FormData(form).forEach((value, name) => {
      if (
        typeof value === "string" &&
        value &&
        (name !== "sort" || value !== "desc")
      ) {
        searchParams.set(name, value);
      }
    });
    const search = searchParams.toString();
    window.location.assign(search ? `${action}?${search}` : action);
  };

  return (
    <details
      className="collapse-arrow collapse rounded-box bg-base-200"
      onToggle={persistOpenState}
      open={initialOpen}
    >
      <summary className="collapse-title py-2 font-semibold">
        並べ替え・絞り込み
      </summary>
      <div className="collapse-content">
        <form action={action} className="w-full" method="get">
          <fieldset className="fieldset">
            <div className="flex flex-wrap items-center gap-3">
              <label className="fieldset min-w-36 flex-1" htmlFor="memo-sort">
                <span className="fieldset-legend">作成時間</span>
                <select
                  className="select w-full"
                  id="memo-sort"
                  name="sort"
                  onChange={submit}
                >
                  <option selected={query.sort === "desc"} value="desc">
                    新しい順
                  </option>
                  <option selected={query.sort === "asc"} value="asc">
                    古い順
                  </option>
                </select>
              </label>
              <label className="fieldset min-w-40 flex-1" htmlFor="memo-type">
                <span className="fieldset-legend">種類</span>
                <select
                  className="select w-full"
                  id="memo-type"
                  name="type"
                  onChange={submit}
                >
                  <option selected={!query.type} value="">
                    指定なし
                  </option>
                  <option selected={query.type === "normal"} value="normal">
                    通常メモ
                  </option>
                  <option selected={query.type === "link"} value="link">
                    リンク付きメモ
                  </option>
                  <option selected={query.type === "ai"} value="ai">
                    AI要約メモ
                  </option>
                </select>
              </label>
              <label
                className="fieldset min-w-40 flex-1"
                htmlFor="memo-attachment"
              >
                <span className="fieldset-legend">添付ファイル</span>
                <select
                  className="select w-full"
                  id="memo-attachment"
                  name="attachment"
                  onChange={submit}
                >
                  <option selected={!query.attachment} value="">
                    指定なし
                  </option>
                  <option selected={query.attachment === "with"} value="with">
                    あり
                  </option>
                  <option
                    selected={query.attachment === "without"}
                    value="without"
                  >
                    なし
                  </option>
                </select>
              </label>
              <label className="fieldset min-w-40 flex-1" htmlFor="memo-tag">
                <span className="fieldset-legend">タグ</span>
                <select
                  className="select w-full"
                  id="memo-tag"
                  name="tag"
                  onChange={submit}
                >
                  <option selected={!query.tag} value="">
                    指定なし
                  </option>
                  {tags.map((tag) => (
                    <option
                      key={tag.id}
                      selected={query.tag === tag.id}
                      value={tag.id}
                    >
                      #{tag.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <a className="btn btn-soft btn-warning" href={action}>
                  すべて解除
                </a>
              </div>
            </div>
          </fieldset>
        </form>
      </div>
    </details>
  );
}
