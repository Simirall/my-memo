/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Memo } from "@/features/memos/list/card/memo";
import MemoListControls from "@/features/memos/list/controls/$memo-list-controls";
import MemoTagEditor from "@/features/memos/list/controls/$memo-tag-editor";
import { TagInput } from "@/features/tags/input/tag-input";

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
  it("タグ辞書が空でも入力値を新しいタグ候補として表示し、チップ化できる", async () => {
    mount(<TagInput availableTags={[]} inputId="tags" />);

    await page.getByRole("textbox").fill("windows");
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

    const input = page.getByRole("textbox");
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

    await page.getByRole("textbox").fill("仕事");

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

    await page.getByRole("textbox").fill("仕事");

    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await expect.element(page.getByText("#仕事")).toBeVisible();
  });

  it("カードのタグバッジは現在の一覧条件を維持し、編集モーダルは一括保存する", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [] }));
    mount(
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
            tags: [tag],
          }}
          query={{ sort: "asc", page: 3, type: "link" }}
        />
        <MemoTagEditor
          availableTags={[tag]}
          listPath="/categories/category-1"
          query={{ sort: "asc", page: 3, type: "link" }}
        />
      </div>,
    );

    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .toHaveAttribute(
        "href",
        "/categories/category-1?sort=asc&type=link&tag=tag-1",
      );
    await page.getByRole("button", { name: "タグを編集: テストメモ" }).click();
    await expect.element(page.getByRole("dialog")).toBeInTheDocument();
    await page.getByRole("button", { name: "仕事を外す" }).click();
    await page.getByRole("button", { name: "保存" }).click();

    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ tags: [] }),
    });
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .not.toBeInTheDocument();
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
    await page.getByRole("textbox").fill("windows");
    await page
      .getByRole("option", { name: "#windowsを新しいタグとして追加" })
      .click();
    await expect.element(page.getByText("#windows")).toBeInTheDocument();
    await page.getByRole("button", { name: "保存" }).click();

    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ tags: ["windows"] }),
    });
    await expect
      .element(page.getByRole("link", { name: "#windows" }))
      .toHaveAttribute("href", "/?tag=tag-new");
  });

  it("保存した新規タグを再度開いた候補にも反映する", async () => {
    const tagA = { id: "tag-a", name: "a" };
    const tagAb = { id: "tag-ab", name: "ab" };
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [tagA, tagAb] }));
    mount(
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
            tags: [tagA],
          }}
        />
        <MemoTagEditor availableTags={[tagA]} />
      </div>,
    );

    await page
      .getByRole("button", { name: "タグを編集: 候補更新テスト" })
      .click();
    await page.getByRole("textbox").fill("ab");
    await page
      .getByRole("option", { name: "#abを新しいタグとして追加" })
      .click();
    await page.getByRole("button", { name: "保存" }).click();
    await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
    expect(
      document.querySelector('#memo-tag option[value="tag-ab"]')?.textContent,
    ).toBe("#ab");

    await page
      .getByRole("button", { name: "タグを編集: 候補更新テスト" })
      .click();
    await page.getByRole("button", { name: "aを外す", exact: true }).click();
    await page.getByRole("button", { name: "abを外す", exact: true }).click();
    await page.getByRole("textbox").fill("a");

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
    await page.getByRole("button", { name: "保存" }).click();

    await expect
      .element(page.getByText("条件に一致するメモはありません。"))
      .toBeInTheDocument();
    expect(
      document.querySelector('[data-memo-card="memo-filtered"]'),
    ).toBeNull();
  });
});
