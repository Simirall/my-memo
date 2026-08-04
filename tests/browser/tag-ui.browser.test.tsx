/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Memo } from "../../app/components/memo";
import { TagInput } from "../../app/components/tag-input";
import MemoTagEditor from "../../app/islands/memos/tag-editor";

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
    await expect
      .element(page.getByRole("button", { name: "windowsを外す" }))
      .toHaveClass("btn-circle");
    await expect.element(page.getByText("#windows")).toHaveClass("badge-soft");
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
    await expect.element(page.getByText("#仕事")).toHaveClass("badge-primary");
  });

  it("カードのタグバッジは結果ページへ遷移し、編集モーダルは一括保存する", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [] }));
    mount(
      <div>
        <Memo
          memo={{
            id: "memo-1",
            userId: "user-1",
            title: "テストメモ",
            content: "本文",
            url: null,
            categoryId: null,
            aiGenerated: 0,
            createdAt: "2026-08-03 00:00:00",
            updatedAt: "2026-08-03 00:00:00",
            tags: [tag],
          }}
        />
        <MemoTagEditor availableTags={[tag]} />
      </div>,
    );

    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .toHaveAttribute("href", "/tags/tag-1");
    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .toHaveClass("badge-soft");
    await expect
      .element(page.getByRole("link", { name: "#仕事" }))
      .toHaveClass("badge-info");
    await page.getByRole("button", { name: "タグを編集: テストメモ" }).click();
    await expect
      .element(page.getByRole("button", { name: "タグを編集: テストメモ" }))
      .toHaveClass("btn-info");
    await expect
      .element(page.getByRole("button", { name: "タグを編集: テストメモ" }))
      .toHaveClass("btn-square");
    expect(
      document.querySelector('button[aria-label="タグを編集: テストメモ"] svg'),
    ).not.toBeNull();
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
            aiGenerated: 0,
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
      .toHaveAttribute("href", "/tags/tag-new");
  });

  it("保存した新規タグを再度開いた候補にも反映する", async () => {
    const tagA = { id: "tag-a", name: "a" };
    const tagAb = { id: "tag-ab", name: "ab" };
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ tags: [tagA, tagAb] }));
    mount(
      <div>
        <Memo
          memo={{
            id: "memo-new-tag",
            userId: "user-1",
            title: "候補更新テスト",
            content: "本文",
            url: null,
            categoryId: null,
            aiGenerated: 0,
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

    await page
      .getByRole("button", { name: "タグを編集: 候補更新テスト" })
      .click();
    await page.getByRole("button", { name: "aを外す", exact: true }).click();
    await page.getByRole("button", { name: "abを外す", exact: true }).click();
    await page.getByRole("textbox").fill("a");

    await expect
      .element(page.getByRole("option", { name: "#a", exact: true }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("option", { name: "#ab", exact: true }))
      .toBeInTheDocument();
  });
});
