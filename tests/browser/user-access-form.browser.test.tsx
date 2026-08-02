/** @jsxImportSource hono/jsx/dom */
import { render } from "hono/jsx/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import UserAccessForm from "../../app/islands/admin/user-access-form";

const user = { id: "target", role: "user", planId: "free" };
const plans = [
  { id: "free", name: "Free" },
  { id: "pro", name: "Pro" },
];

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<UserAccessForm plans={plans} user={user} />, container);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("ユーザー権限変更フォーム", () => {
  it("選択した権限とプランを送信し、保存成功を通知する", async () => {
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValue(Response.json({ ok: true }));
    mount();

    await page.getByLabelText("Role").selectOptions("admin");
    await page.getByLabelText("Plan").selectOptions("pro");
    await page.getByRole("button", { name: "Save" }).click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("保存しました。");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(String(init?.body)).toBe("role=admin&planId=pro");
  });

  it("最後の管理者を降格できないエラーを通知し、再操作できる状態に戻す", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      Response.json(
        { code: "LAST_ADMIN", message: "最後の管理者の権限は外せません。" },
        { status: 409 },
      ),
    );
    mount();

    await page.getByRole("button", { name: "Save" }).click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("最後の管理者の権限は外せません。");
    await expect
      .element(page.getByRole("button", { name: "Save" }))
      .toBeEnabled();
  });
});
