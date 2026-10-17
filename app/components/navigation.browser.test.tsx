import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "@/tests/browser/render";
import { navigation } from "../../tests/setup/navigation";
import { useAppRouter } from "./navigation";

it("保存後の遷移失敗では入力を残し、画面取得だけを再試行する", async () => {
  navigation.push
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("still offline"));
  let saves = 0;
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
