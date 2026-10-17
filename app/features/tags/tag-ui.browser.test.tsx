import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Memo } from "@/features/memos/list/card/memo";
import MemoListControls from "@/features/memos/list/controls/$memo-list-controls";
import MemoTagEditor from "@/features/memos/list/controls/$memo-tag-editor";
import { TagInput } from "@/features/tags/input/tag-input";
import { render } from "@/tests/browser/render";
import { navigation } from "../../../tests/setup/navigation";

function mount(node: Parameters<typeof render>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(node, container);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const tag = { id: "tag-1", name: "仕事" };

describe("タグUI", () => {
  it("Tabで候補へ移動しEnterで選択できる", async () => {
    mount(
      <TagInput availableTags={[tag]} inputId="tags" suggestedTags={[tag]} />,
    );

    const input = page.getByRole("combobox");
    await input.click();
    await userEvent.keyboard("{Tab}");
    const option = page.getByRole("option", { name: "#仕事" });
    await expect.element(option).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByText("#仕事")).toBeInTheDocument();
    await expect.element(input).toHaveFocus();
  });

  it("未入力時はフォーカス中だけ推奨タグを全件表示し、入力後は従来候補へ切り替える", async () => {
    const outside = document.createElement("button");
    outside.textContent = "外側";
    document.body.appendChild(outside);
    const suggestedTags = Array.from({ length: 9 }, (_, index) => ({
      id: `suggested-${index}`,
      name: `候補${index}`,
    }));
    mount(
      <TagInput
        availableTags={[...suggestedTags, { id: "other", name: "検索対象" }]}
        inputId="tags"
        suggestedTags={suggestedTags}
      />,
    );

    const input = page.getByRole("combobox");
    await input.click();
    await expect
      .element(page.getByRole("option", { name: "#候補8" }))
      .toBeVisible();
    await page.getByRole("option", { name: "#候補0" }).click();
    await expect.element(page.getByText("#候補0")).toBeInTheDocument();
    await expect
      .element(page.getByRole("option", { name: "#候補1" }))
      .toBeVisible();

    await input.fill("検索");
    await expect
      .element(page.getByRole("option", { name: "#検索対象" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#候補1" }))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: "外側" }).click();
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  });

  it("タグ辞書が空でも入力値を新しいタグ候補として表示し、チップ化できる", async () => {
    mount(<TagInput availableTags={[]} inputId="tags" />);

    await page.getByRole("combobox").fill("windows");
    await expect
      .element(
        page.getByRole("option", {
          name: "#windowsを新しいタグとして追加",
        }),
      )
      .toBeInTheDocument();
    await page
      .getByRole("option", { name: "#windowsを新しいタグとして追加" })
      .click();

    await expect.element(page.getByText("#windows")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "windowsを外す" }))
      .toBeInTheDocument();
  });

  it("タグ候補を選択してチップを解除できる", async () => {
    mount(
      <TagInput
        availableTags={[tag, { id: "tag-2", name: "あとで" }]}
        inputId="tags"
      />,
    );

    const input = page.getByRole("combobox");
    await input.fill("仕");
    const existingOption = page.getByRole("option", {
      exact: true,
      name: "#仕事",
    });
    await expect.element(existingOption).toBeVisible();
    await existingOption.click();
    await expect.element(page.getByText("#仕事")).toBeInTheDocument();
    await page.getByRole("button", { name: "仕事を外す" }).click();
    await expect.element(page.getByText("#仕事")).not.toBeInTheDocument();
  });

  it("既存タグと完全一致する入力では新規候補を表示しない", async () => {
    mount(<TagInput availableTags={[tag]} inputId="tags" />);

    await page.getByRole("combobox").fill("仕事");

    await expect
      .element(
        page.getByRole("option", {
          name: "#仕事を新しいタグとして追加",
        }),
      )
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("option", { name: "#仕事" }))
      .toBeInTheDocument();
  });

  it("選択済みタグと完全一致する入力では候補を消し、タグをハイライトする", async () => {
    mount(
      <TagInput availableTags={[tag]} initialTags={[tag]} inputId="tags" />,
    );

    await page.getByRole("combobox").fill("仕事");

    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(page.getByText("#仕事")).toBeVisible();
  });

  it("インライン編集は対象メモのカテゴリー候補を使い、カテゴリーなしでは全体候補を使う", async () => {
    const categoryTag = { id: "tag-category", name: "カテゴリー候補" };
    const allTag = { id: "tag-all", name: "全体候補" };
    const pageTag = { id: "tag-page", name: "表示ページ候補" };
    const memo = {
      userId: "user-1",
      content: "本文",
      url: null,
      isAiSummary: 0,
      createdAt: "2026-08-03 00:00:00",
      updatedAt: "2026-08-03 00:00:00",
      tags: [],
    } as const;
    mount(
      <div>
        <Memo
          memo={{
            ...memo,
            id: "memo-category",
            title: "カテゴリーあり",
            categoryId: "category-1",
          }}
        />
        <Memo
          memo={{
            ...memo,
            id: "memo-all",
            title: "カテゴリーなし",
            categoryId: null,
          }}
        />
        <MemoTagEditor
          availableTags={[categoryTag, allTag, pageTag]}
          suggestedTags={[pageTag]}
          tagSuggestions={{
            all: [allTag],
            byCategory: { "category-1": [categoryTag] },
          }}
        />
      </div>,
    );

    await page
      .getByRole("button", { name: "タグを編集: カテゴリーあり" })
      .click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect
      .element(page.getByRole("option", { name: "#カテゴリー候補" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#表示ページ候補" }))
      .not.toBeInTheDocument();
    await page.getByRole("heading", { name: "タグを編集" }).click();
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    await page
      .getByRole("button", { name: "タグを編集: カテゴリーなし" })
      .click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect
      .element(page.getByRole("option", { name: "#全体候補" }))
      .toBeVisible();
  });

  it("RSC更新後はタグ辞書と推奨タグを最新propsへ切り替える", async () => {
    const oldAvailable = { id: "tag-old-available", name: "古い辞書" };
    const oldSuggestion = { id: "tag-old-suggestion", name: "古い推奨" };
    const newAvailable = { id: "tag-new-available", name: "新しい辞書" };
    const newSuggestion = { id: "tag-new-suggestion", name: "新しい推奨" };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderEditor = (
      availableTags: (typeof oldAvailable)[],
      suggestedTags: (typeof oldSuggestion)[],
    ) => {
      render(
        <div>
          <button
            data-memo-id="memo-props-refresh"
            data-memo-tag-edit
            data-memo-tags="[]"
            data-memo-title="props更新"
            type="button"
          >
            編集
          </button>
          <MemoTagEditor
            availableTags={availableTags}
            suggestedTags={suggestedTags}
            tagSuggestions={{ all: suggestedTags, byCategory: {} }}
          />
        </div>,
        container,
      );
    };

    renderEditor([oldAvailable], [oldSuggestion]);
    await page.getByRole("button", { name: "編集" }).click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect
      .element(page.getByRole("option", { name: "#古い推奨" }))
      .toBeVisible();
    await page.getByRole("option", { name: "#古い推奨" }).click();
    await expect.element(page.getByText("#古い推奨")).toBeInTheDocument();

    renderEditor([newAvailable], [newSuggestion]);
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect.element(page.getByText("#古い推奨")).toBeInTheDocument();
    await expect
      .element(page.getByRole("option", { name: "#新しい推奨" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#古い推奨" }))
      .not.toBeInTheDocument();
    await page.getByRole("combobox").fill("新しい辞書");
    await expect
      .element(page.getByRole("option", { name: "#新しい辞書" }))
      .toBeVisible();
    await page.getByRole("button", { name: "キャンセル" }).click();
  });

  it("カードのタグバッジは現在の一覧条件を維持し、編集モーダルは一括保存する", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json({
        tags: [],
        tagSuggestions: { all: [], byCategory: {} },
      }),
    );
    const tag2 = { id: "tag-2", name: "あとで" };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderPage = (
      memoTags: (typeof tag)[],
      suggestedTags: (typeof tag)[],
      tagSuggestions: {
        all: (typeof tag)[];
        byCategory: Record<string, (typeof tag)[]>;
      },
    ) =>
      render(
        <div>
          <Memo
            listPath="/categories/category-1"
            memo={{
              id: "memo-1",
              userId: "user-1",
              title: "テストメモ",
              content: "本文",
              url: null,
              categoryId: null,
              isAiSummary: 0,
              createdAt: "2026-08-03 00:00:00",
              updatedAt: "2026-08-03 00:00:00",
              tags: memoTags,
            }}
            query={{ sort: "asc", page: 3, type: "link" }}
          />
          <MemoTagEditor
            availableTags={[tag, tag2]}
            listPath="/categories/category-1"
            query={{ sort: "asc", page: 3, type: "link" }}
            suggestedTags={suggestedTags}
            tagSuggestions={tagSuggestions}
          />
        </div>,
        container,
      );

    renderPage([tag], [tag, tag2], {
      all: [tag, tag2],
      byCategory: {},
    });

    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .toHaveAttribute(
        "href",
        "/categories/category-1?sort=asc&type=link&tag=tag-1",
      );
    await page.getByRole("button", { name: "タグを編集: テストメモ" }).click();
    await expect.element(page.getByRole("dialog")).toBeInTheDocument();
    await page.getByRole("button", { name: "仕事を外す" }).click();
    await page.getByRole("combobox").click();
    await expect
      .element(page.getByRole("option", { name: "#あとで" }))
      .toBeVisible();
    // 候補を閉じる際のレイアウト変化が保存クリックに重ならないようにする。
    await page.getByRole("heading", { name: "タグを編集" }).click();
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ tags: [] }),
    });
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => navigation.reload.mock.calls.length).toBe(1);

    renderPage([], [], { all: [], byCategory: {} });
    await page.getByRole("button", { name: "タグを編集: テストメモ" }).click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  });

  it("閉じるアニメーション中は編集中のメモ名を保持する", async () => {
    mount(
      <div>
        <Memo
          memo={{
            id: "memo-close",
            userId: "user-1",
            title: "hoge",
            content: "本文",
            url: null,
            categoryId: null,
            isAiSummary: 0,
            createdAt: "2026-08-03 00:00:00",
            updatedAt: "2026-08-03 00:00:00",
            tags: [],
          }}
        />
        <MemoTagEditor availableTags={[]} />
      </div>,
    );

    await page.getByRole("button", { name: "タグを編集: hoge" }).click();
    const modalBox = document
      .querySelector("#memo-tags-title")
      ?.closest<HTMLElement>(".modal-box");
    if (modalBox) modalBox.style.transition = "opacity 500ms";
    await page.getByRole("button", { name: "キャンセル" }).click();

    expect(document.querySelector("#memo-tags-title + p")?.textContent).toBe(
      "「hoge」のタグを設定します。",
    );
    await expect
      .poll(() => document.querySelector("#memo-tags-title + p")?.textContent)
      .toBe("「」のタグを設定します。");
  });

  it("タグ0件のモーダルでも入力値をチップ化して保存できる", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(
        Response.json({ tags: [{ id: "tag-new", name: "windows" }] }),
      );
    mount(
      <div>
        <Memo
          memo={{
            id: "memo-empty",
            userId: "user-1",
            title: "タグなしメモ",
            content: "本文",
            url: null,
            categoryId: null,
            isAiSummary: 0,
            createdAt: "2026-08-03 00:00:00",
            updatedAt: "2026-08-03 00:00:00",
            tags: [],
          }}
        />
        <MemoTagEditor availableTags={[]} />
      </div>,
    );

    await page
      .getByRole("button", { name: "タグを編集: タグなしメモ" })
      .click();
    await page.getByRole("combobox").fill("windows");
    await page
      .getByRole("option", { name: "#windowsを新しいタグとして追加" })
      .click();
    await expect.element(page.getByText("#windows")).toBeInTheDocument();
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ tags: ["windows"] }),
    });
    await expect.poll(() => navigation.reload.mock.calls.length).toBe(1);
  });

  it("保存した新規タグを再度開いた候補にも反映する", async () => {
    const tagA = { id: "tag-a", name: "a" };
    const tagAb = { id: "tag-ab", name: "ab" };
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [tagA, tagAb] }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderPage = (tags: (typeof tagA)[]) =>
      render(
        <div>
          <MemoListControls
            action="/"
            initialOpen
            query={{ sort: "desc", page: 1 }}
            tags={[tagA]}
          />
          <Memo
            memo={{
              id: "memo-new-tag",
              userId: "user-1",
              title: "候補更新テスト",
              content: "本文",
              url: null,
              categoryId: null,
              isAiSummary: 0,
              createdAt: "2026-08-03 00:00:00",
              updatedAt: "2026-08-03 00:00:00",
              tags,
            }}
          />
          <MemoTagEditor availableTags={tags} />
        </div>,
        container,
      );

    renderPage([tagA]);

    await page
      .getByRole("button", { name: "タグを編集: 候補更新テスト" })
      .click();
    await page.getByRole("dialog").getByRole("combobox").fill("ab");
    await page
      .getByRole("option", { name: "#abを新しいタグとして追加" })
      .click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    await expect.poll(() => navigation.reload.mock.calls.length).toBe(1);

    renderPage([tagA, tagAb]);
    await page
      .getByRole("button", { name: "タグを編集: 候補更新テスト" })
      .click();
    await page.getByRole("button", { name: "aを外す", exact: true }).click();
    await page.getByRole("button", { name: "abを外す", exact: true }).click();
    await page.getByRole("dialog").getByRole("combobox").fill("a");

    await expect
      .element(
        page
          .getByRole("dialog")
          .getByRole("option", { name: "#a", exact: true }),
      )
      .toBeInTheDocument();
    await expect
      .element(
        page
          .getByRole("dialog")
          .getByRole("option", { name: "#ab", exact: true }),
      )
      .toBeInTheDocument();
  });

  it("タグ保存後にRSCが更新されれば保存結果の一時キャッシュを破棄する", async () => {
    const savedTag = { id: "tag-saved", name: "保存時のタグ" };
    const serverTag = { id: "tag-server", name: "再取得したタグ" };
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [savedTag] }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderMemo = (tags: (typeof serverTag)[]) =>
      render(
        <div>
          <Memo
            memo={{
              id: "memo-cache-clear",
              userId: "user-1",
              title: "キャッシュ破棄テスト",
              content: "本文",
              url: null,
              categoryId: null,
              isAiSummary: 0,
              createdAt: "2026-08-03 00:00:00",
              updatedAt: "2026-08-03 00:00:00",
              tags,
            }}
          />
          <MemoTagEditor availableTags={[...tags]} />
        </div>,
        container,
      );

    renderMemo([]);
    await page
      .getByRole("button", { name: "タグを編集: キャッシュ破棄テスト" })
      .click();
    await page.getByRole("combobox").fill("保存時のタグ");
    await page
      .getByRole("option", { name: "#保存時のタグを新しいタグとして追加" })
      .click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    await expect.poll(() => navigation.reload.mock.calls.length).toBe(1);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    renderMemo([serverTag]);
    await page
      .getByRole("button", { name: "タグを編集: キャッシュ破棄テスト" })
      .click();
    await expect
      .element(page.getByRole("dialog").getByText("#再取得したタグ"))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("dialog").getByText("#保存時のタグ"))
      .not.toBeInTheDocument();
  });

  it("タグ保存後のRSC更新に失敗しても保存済みタグを再表示できる", async () => {
    const savedTag = { id: "tag-saved-failure", name: "保存済みタグ" };
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [savedTag] }));
    navigation.reload.mockRejectedValueOnce(new Error("reload failed"));
    mount(
      <div>
        <Memo
          memo={{
            id: "memo-cache-failure",
            userId: "user-1",
            title: "キャッシュ保持テスト",
            content: "本文",
            url: null,
            categoryId: null,
            isAiSummary: 0,
            createdAt: "2026-08-03 00:00:00",
            updatedAt: "2026-08-03 00:00:00",
            tags: [],
          }}
        />
        <MemoTagEditor availableTags={[]} />
      </div>,
    );

    await page
      .getByRole("button", { name: "タグを編集: キャッシュ保持テスト" })
      .click();
    await page.getByRole("combobox").fill("保存済みタグ");
    await page
      .getByRole("option", { name: "#保存済みタグを新しいタグとして追加" })
      .click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("保存済みですが表示を更新できませんでした");
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    await page
      .getByRole("button", { name: "タグを編集: キャッシュ保持テスト" })
      .click();
    await expect.element(page.getByText("#保存済みタグ")).toBeInTheDocument();
  });

  it("選択中のタグを外すとカードを除き0件表示へ切り替える", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(Response.json({ tags: [] }));
    mount(
      <div>
        <div data-memo-list-grid>
          <Memo
            memo={{
              id: "memo-filtered",
              userId: "user-1",
              title: "絞り込み対象",
              content: "本文",
              url: null,
              categoryId: null,
              isAiSummary: 0,
              createdAt: "2026-08-03 00:00:00",
              updatedAt: "2026-08-03 00:00:00",
              tags: [tag],
            }}
            query={{ sort: "desc", page: 1, tag: tag.id }}
          />
        </div>
        <table>
          <tbody>
            <tr data-memo-list-row="memo-filtered">
              <td>絞り込み対象の行</td>
            </tr>
          </tbody>
        </table>
        <MemoTagEditor
          activeTagId={tag.id}
          availableTags={[tag]}
          query={{ sort: "desc", page: 1, tag: tag.id }}
        />
      </div>,
    );

    await page
      .getByRole("button", { name: "タグを編集: 絞り込み対象" })
      .click();
    await page.getByRole("button", { name: "仕事を外す" }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();

    await expect.poll(() => navigation.reload.mock.calls.length).toBe(1);
  });
});
