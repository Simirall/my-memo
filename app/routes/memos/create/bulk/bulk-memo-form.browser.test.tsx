/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { goToMemoList } from "@/features/memos/input/memo-create-navigation";
import type { Tag, TagSuggestions } from "@/features/tags/data/tags";
import BulkMemoForm from "./-components/$bulk-memo-form";

vi.mock("@/features/memos/input/memo-create-navigation", () => ({
  goToMemoList: vi.fn(),
}));

const mount = (
  tags: Tag[] = [],
  tagSuggestions: TagSuggestions = { all: [], byCategory: {} },
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <BulkMemoForm
      categories={[{ id: "work", name: "仕事" }]}
      initialMemoId={crypto.randomUUID()}
      tagSuggestions={tagSuggestions}
      tags={tags}
    />,
    container,
  );
  return container;
};
const row = (index: number) =>
  page.getByRole("row", { name: `メモ${index}`, exact: true });
const saveButton = () =>
  page.getByRole("button", { name: "まとめて保存", exact: true });
const addRow = () =>
  page.getByRole("button", { name: "行を追加", exact: true }).click();
const success = (url: RequestInfo | URL) =>
  Response.json({ memoId: String(url).split("/").at(-1) });
const title = (index: number) => row(index).getByLabelText("タイトル（必須）");

afterEach(() => {
  for (const element of Array.from(document.body.children))
    render(null, element as HTMLElement);
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("メモの一括入力", () => {
  it("空欄では全体・カテゴリー別候補を表示し、入力後はカテゴリー外のタグも検索できる", async () => {
    const work = { id: "work-tag", name: "仕事タグ" };
    const other = { id: "other-tag", name: "他のタグ" };
    const unused = { id: "unused-tag", name: "未使用タグ" };
    mount([work, other, unused], {
      all: [work, other],
      byCategory: { work: [work] },
    });
    const input = row(1).getByRole("combobox", { name: "タグ", exact: true });
    await input.click();
    await expect
      .element(page.getByRole("option", { name: "#仕事タグ", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#他のタグ", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#未使用タグ", exact: true }))
      .not.toBeInTheDocument();
    await row(1)
      .getByLabelText("カテゴリー", { exact: true })
      .selectOptions("work");
    await input.click();
    await expect
      .element(page.getByRole("option", { name: "#仕事タグ", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#他のタグ", exact: true }))
      .not.toBeInTheDocument();
    await input.fill("他");
    await expect
      .element(page.getByRole("option", { name: "#他のタグ", exact: true }))
      .toBeVisible();
    await input.fill("");
    await expect
      .element(page.getByRole("option", { name: "#仕事タグ", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("option", { name: "#他のタグ", exact: true }))
      .not.toBeInTheDocument();
    await row(2).getByRole("combobox", { name: "タグ", exact: true }).click();
    await expect
      .element(page.getByRole("option", { name: "#他のタグ", exact: true }))
      .toBeVisible();
  });
  it("末尾への入力で空行を一度だけ追加し、入力を消しても行を削除しない", async () => {
    mount();
    await title(1).fill("入力");
    await expect.element(row(2)).toBeInTheDocument();
    await expect.element(title(1)).toHaveFocus();
    await title(1).fill("追加入力");
    await expect.element(row(3)).not.toBeInTheDocument();
    await title(1).fill("");
    await expect.element(row(2)).toBeInTheDocument();
    await title(2).fill("次の入力");
    await expect.element(row(3)).toBeInTheDocument();
  });

  it("手動追加した空行を重複させず、自動・手動とも30行を超えない", async () => {
    mount();
    await addRow();
    await title(1).fill("手動追加前の行");
    await expect.element(row(3)).not.toBeInTheDocument();
    await title(2).fill("末尾");
    await expect.element(row(3)).toBeInTheDocument();
    for (let index = 3; index < 30; index++) await addRow();
    await title(30).fill("上限の行");
    await expect.element(row(31)).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "行を追加", exact: true }))
      .toBeDisabled();
  });

  it.each(["本文", "URL", "カテゴリー", "タグ"])(
    "%sの入力でも末尾に空行を追加する",
    async (field) => {
      mount();
      if (field === "カテゴリー")
        await row(1)
          .getByLabelText(field, { exact: true })
          .selectOptions("work");
      else
        await row(1)
          .getByLabelText(field, { exact: true })
          .fill(field === "URL" ? "https://example.com" : "入力");
      await expect.element(row(2)).toBeInTheDocument();
      await expect.element(row(3)).not.toBeInTheDocument();
    },
  );
  it("番号だけ表示し、行を追加・削除でき、30行を上限にする", async () => {
    mount();
    await expect
      .element(page.getByRole("columnheader", { name: "番号", exact: true }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("columnheader", { name: "状態", exact: true }))
      .not.toBeInTheDocument();
    await expect.element(page.getByRole("status")).not.toBeInTheDocument();
    for (let index = 1; index < 30; index++) await addRow();
    await expect.element(row(30)).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "行を追加", exact: true }))
      .toBeDisabled();
    await page
      .getByRole("button", { name: "メモ30の行を削除", exact: true })
      .click();
    await expect.element(row(30)).not.toBeInTheDocument();
  });

  it("空行を無視し、失敗をトーストで通知して正常な行を保存する", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockImplementation(async (url) => success(url));
    mount();
    await row(1).getByLabelText("本文", { exact: true }).fill("タイトルなし");
    await addRow();
    await title(2).fill("正常なメモ");
    await addRow();
    await saveButton().click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("メモ1: タイトルを入力してください");
    await expect.element(title(2)).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(goToMemoList).not.toHaveBeenCalled();
    await expect
      .element(row(1).getByLabelText("本文", { exact: true }))
      .toHaveValue("タイトルなし");
    await page.getByRole("button", { name: "通知を閉じる" }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("成功行を再送せず、分類と入力途中のタグを保持して失敗行だけ再試行する", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockImplementationOnce(async (url) => success(url))
      .mockResolvedValueOnce(
        Response.json(
          { message: "カテゴリーが見つかりません。" },
          { status: 400 },
        ),
      )
      .mockImplementation(async (url) => success(url));
    mount();
    await title(1).fill("成功行");
    await row(1)
      .getByLabelText("カテゴリー", { exact: true })
      .selectOptions("work");
    await row(1)
      .getByRole("combobox", { name: "タグ", exact: true })
      .fill("新規");
    await title(1).click();
    await addRow();
    await title(2).fill("失敗行");
    await saveButton().click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("メモ2: カテゴリーが見つかりません。");
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      categoryId: "work",
      tags: ["新規"],
    });
    const failedId = fetchSpy.mock.calls[1][0];
    await title(2).fill("修正した行");
    await saveButton().click();
    await expect.element(title(2)).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(goToMemoList).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[2][0]).toBe(failedId);
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  });

  it("通信切断では後続を止め、結果不明の行を同じIDと内容で再送する", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockImplementation(async (url) => success(url));
    mount();
    await title(1).fill("切断した行");
    await addRow();
    await title(2).fill("後続行");
    await saveButton().click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("保存結果を確認できませんでした");
    await expect.element(title(1)).toBeDisabled();
    await expect.element(title(2)).toBeEnabled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [firstUrl, firstOptions] = fetchSpy.mock.calls[0];
    await saveButton().click();
    await expect.element(title(2)).toBeDisabled();
    expect(fetchSpy.mock.calls[1][0]).toBe(firstUrl);
    expect(fetchSpy.mock.calls[1][1]?.body).toBe(firstOptions?.body);
    await expect.poll(() => vi.mocked(goToMemoList).mock.calls.length).toBe(1);
  });

  it("結果不明の再試行で未保存が確定したら修正・削除を再び可能にする", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json(
          { saved: false, message: "カテゴリーが見つかりません。" },
          { status: 400 },
        ),
      )
      .mockImplementation(async (url) => success(url));
    mount();
    await title(1).fill("再試行する行");
    await saveButton().click();
    await expect.element(title(1)).toBeDisabled();
    await saveButton().click();
    await expect.element(title(1)).toBeEnabled();
    await expect
      .element(
        page.getByRole("button", { name: "メモ1の行を削除", exact: true }),
      )
      .toBeEnabled();
    await title(1).fill("修正した行");
    await saveButton().click();
    await expect.element(title(1)).toBeDisabled();
    expect(fetchSpy.mock.calls[2][0]).toBe(fetchSpy.mock.calls[0][0]);
    expect(goToMemoList).toHaveBeenCalledOnce();
  });

  it("未保存を確認できない拒否では結果不明の行を固定したままにする", async () => {
    vi.spyOn(window, "fetch")
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        Response.json({ message: "認証が必要です。" }, { status: 401 }),
      );
    mount();
    await title(1).fill("確認が必要な行");
    await saveButton().click();
    await expect.element(title(1)).toBeDisabled();
    await saveButton().click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("認証が必要です。");
    await expect.element(title(1)).toBeDisabled();
  });

  it.each([401, 403])(
    "認証切れ・クォータ到達（%s）で後続を止める",
    async (status) => {
      const fetchSpy = vi
        .spyOn(window, "fetch")
        .mockResolvedValue(
          Response.json({ message: "保存を続けられません。" }, { status }),
        );
      mount();
      await title(1).fill("先頭行");
      await addRow();
      await title(2).fill("後続行");
      await saveButton().click();
      await expect
        .element(page.getByRole("alert"))
        .toHaveTextContent("メモ1: 保存を続けられません。");
      expect(fetchSpy).toHaveBeenCalledOnce();
      await expect.element(title(2)).toHaveValue("後続行");
    },
  );

  it("Enter・フォーム送信では保存せず、本文改行とタグ追加は使える", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockImplementation(async (url) => success(url));
    const container = mount();
    await title(1).fill("Enterでは保存しない");
    await userEvent.keyboard("{Enter}");
    const body = row(1).getByLabelText("本文", { exact: true });
    await body.fill("本文");
    await userEvent.keyboard("{End}{Enter}");
    await expect.element(body).toHaveValue("本文\n");
    const tags = row(1).getByRole("combobox", { name: "タグ", exact: true });
    await tags.fill("タグ");
    await userEvent.keyboard("{Enter}");
    await expect
      .element(row(1).getByRole("button", { name: "タグを外す", exact: true }))
      .toBeInTheDocument();
    container.querySelector("form")?.dispatchEvent(
      new CustomEvent("submit", {
        detail: {},
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    await saveButton().click();
    await expect.element(title(1)).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("画面を開き直すと下書きを復元せず、空の1行から始める", async () => {
    const container = mount();
    await title(1).fill("保持しない入力");
    await addRow();
    render(null, container);
    container.remove();
    mount();
    await expect.element(title(1)).toHaveValue("");
    await expect.element(row(2)).not.toBeInTheDocument();
  });
});
