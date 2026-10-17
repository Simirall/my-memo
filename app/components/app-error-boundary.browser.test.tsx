import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "@/tests/browser/render";
import { AppErrorBoundary } from "./app-error-boundary";

it("描画失敗時は内部エラーの詳細を出さず再読み込みの操作を提供する", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("private-error-detail");
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(
    <AppErrorBoundary>
      <Broken />
    </AppErrorBoundary>,
    container,
  );
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent("時間をおいて、もう一度お試しください。");
  await expect
    .element(page.getByRole("button", { name: "ページを再読み込み" }))
    .toBeVisible();
  expect(container.textContent).not.toContain("private-error-detail");
  consoleError.mockRestore();
});
