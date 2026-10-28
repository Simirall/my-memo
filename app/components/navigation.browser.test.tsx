import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "@/tests/browser/render";
import { navigation } from "../../tests/setup/navigation";
import { AppLink } from "./app-link";
import { useAppRouter, useNavigationBlocker } from "./navigation";

afterEach(() => vi.restoreAllMocks());

it("未保存入力があるリンクとプログラム遷移を確認し、保存後は確認を省く", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  // biome-ignore lint/correctness/noComponentHookFactories: This test fixture is created once and never recreated during rendering.
  function Form() {
    const [value, setValue] = useState("");
    const leaving = useRef(false);
    useNavigationBlocker(() => Boolean(value) && !leaving.current);
    const router = useAppRouter();
    return (
      <>
        <input
          aria-label="編集中の本文"
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
        <AppLink href="/">一覧へ</AppLink>
        <button
          onClick={() => void router.replace("/settings/account")}
          type="button"
        >
          設定へ
        </button>
        <button
          onClick={() => {
            leaving.current = true;
            void router.push("/");
          }}
          type="button"
        >
          保存して戻る
        </button>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<Form />, container);
  await page.getByLabelText("編集中の本文").fill("編集中の内容");
  await page.getByRole("link", { name: "一覧へ" }).click();
  await page.getByRole("button", { name: "設定へ" }).click();
  expect(navigation.push).not.toHaveBeenCalled();
  expect(navigation.replace).not.toHaveBeenCalled();
  await expect
    .element(page.getByLabelText("編集中の本文"))
    .toHaveValue("編集中の内容");
  confirm.mockReturnValue(true);
  await page.getByRole("link", { name: "一覧へ" }).click();
  expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/");
  await page.getByRole("button", { name: "保存して戻る" }).click();
  expect(confirm).toHaveBeenCalledTimes(3);
  expect(navigation.push).toHaveBeenCalledTimes(2);
});

it("保存後の遷移失敗では入力を残し、画面取得だけを再試行する", async () => {
  navigation.push
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("still offline"));
  let saves = 0;
  // biome-ignore lint/correctness/noComponentHookFactories: This test fixture is created once and never recreated during rendering.
  function Form() {
    const router = useAppRouter();
    return (
      <>
        <input aria-label="本文" defaultValue="保存する本文" />
        <button
          onClick={() => {
            saves += 1;
            void router.push("/");
          }}
          type="button"
        >
          保存
        </button>
      </>
    );
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(<Form />, container);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .element(page.getByRole("dialog", { name: "画面更新の再試行" }))
    .toBeVisible();
  await expect.element(page.getByLabelText("本文")).toHaveValue("保存する本文");
  await page.getByRole("button", { name: "画面を再取得" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "画面更新の再試行" }))
    .toBeVisible();
  await expect.element(page.getByLabelText("本文")).toHaveValue("保存する本文");
  await page.getByRole("button", { name: "画面を再取得" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "画面更新の再試行" }))
    .not.toBeInTheDocument();
  expect(saves).toBe(1);
  expect(navigation.push).toHaveBeenCalledTimes(3);
  await expect.element(page.getByLabelText("本文")).toHaveValue("保存する本文");
});
