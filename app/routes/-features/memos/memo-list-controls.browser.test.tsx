/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import MemoListControls from "./$memo-list-controls";
import { MEMO_LIST_CONTROLS_OPEN_COOKIE } from "./memo-list-controls-state";
import { addMemoListTagOptions } from "./memo-list-dom";

afterEach(() => {
  document.body.replaceChildren();
  // biome-ignore lint/suspicious/noDocumentCookie: テスト後にSSR用Cookieを同期的に消去する。
  document.cookie = `${MEMO_LIST_CONTROLS_OPEN_COOKIE}=; Max-Age=0; Path=/`;
});

describe("メモ一覧の並べ替え・絞り込み", () => {
  it("URL条件を各selectへ反映し、現在のカテゴリを送信先にする", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListControls
        action="/categories/category-1"
        query={{
          sort: "asc",
          page: 3,
          type: "ai",
          attachment: "with",
          tag: "tag-1",
        }}
        tags={[
          { id: "tag-1", name: "仕事" },
          { id: "tag-2", name: "あとで" },
        ]}
      />,
      container,
    );

    for (const [selectId, value] of [
      ["memo-sort", "asc"],
      ["memo-type", "ai"],
      ["memo-attachment", "with"],
      ["memo-tag", "tag-1"],
    ]) {
      expect(
        container.querySelector(`#${selectId} option[value="${value}"]`),
      ).toHaveAttribute("selected");
    }

    await page.getByText("並べ替え・絞り込み").click();
    await expect.element(page.getByLabelText("作成時間")).toHaveValue("asc");
    await expect.element(page.getByLabelText("種類")).toHaveValue("ai");
    await expect
      .element(page.getByLabelText("添付ファイル"))
      .toHaveValue("with");
    await expect.element(page.getByLabelText("タグ")).toHaveValue("tag-1");
    await expect
      .element(page.getByRole("link", { name: "すべて解除" }))
      .toHaveAttribute("href", "/categories/category-1");
    await expect
      .element(page.getByRole("button", { name: "適用" }))
      .not.toBeInTheDocument();
    expect(document.querySelector("form")?.method).toBe("get");
    expect(document.querySelector("form")?.getAttribute("action")).toBe(
      "/categories/category-1",
    );
  });

  it("種類を通常メモ・リンク付きメモ・AI要約メモの順で表示する", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListControls
        action="/"
        query={{ sort: "desc", page: 1 }}
        tags={[]}
      />,
      container,
    );

    expect(
      Array.from(container.querySelectorAll("#memo-type option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["指定なし", "通常メモ", "リンク付きメモ", "AI要約メモ"]);
  });

  it("開閉状態をCookieへ保存し、SSRから開いた状態を描画できる", async () => {
    const mountControls = () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      render(
        <MemoListControls
          action="/"
          query={{ sort: "desc", page: 1 }}
          tags={[]}
        />,
        container,
      );
      return container;
    };

    const first = mountControls();
    const firstDetails = first.querySelector("details");
    expect(firstDetails?.open).toBe(false);
    await page.getByText("並べ替え・絞り込み").click();
    expect(document.cookie).toContain(`${MEMO_LIST_CONTROLS_OPEN_COOKIE}=1`);

    document.body.replaceChildren();
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListControls
        action="/"
        initialOpen
        query={{ sort: "desc", page: 1 }}
        tags={[]}
      />,
      container,
    );
    expect(container.querySelector("details")?.open).toBe(true);
  });

  it("使用開始したタグを候補へ追加する", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <MemoListControls
        action="/"
        initialOpen
        query={{ sort: "desc", page: 1 }}
        tags={[{ id: "tag-a", name: "a" }]}
      />,
      container,
    );

    addMemoListTagOptions([{ id: "tag-ab", name: "ab" }]);

    expect(
      document.querySelector('#memo-tag option[value="tag-ab"]')?.textContent,
    ).toBe("#ab");
  });
});
