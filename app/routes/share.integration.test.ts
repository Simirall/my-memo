import { describe, expect, it } from "vitest";
import { parseBoundedBody } from "@/routes/share";

describe("共有受信のmultipart本文解析", () => {
  it("WorkersのRequestを再構築してもファイルを解析できる", async () => {
    const form = new FormData();
    form.set("title", "共有タイトル");
    form.append(
      "files",
      new File(["本文"], "日本語.txt", { type: "text/plain" }),
    );
    const request = new Request("https://example.test/share", {
      method: "POST",
      body: form,
    });

    const body = await parseBoundedBody(request);

    expect(body.title).toBe("共有タイトル");
    expect(body.files).toBeInstanceOf(File);
    expect((body.files as File).name).toBe("日本語.txt");
  });
});
