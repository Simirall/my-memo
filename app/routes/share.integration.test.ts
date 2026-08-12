import { describe, expect, it } from "vitest";
import { MAX_ANONYMOUS_SHARE_BYTES, parseBoundedBody } from "@/routes/share";

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

  it("匿名上限を超える本文をmultipart全量解析前に中断する", async () => {
    const request = new Request("https://example.test/share", {
      method: "POST",
      body: new Uint8Array(MAX_ANONYMOUS_SHARE_BYTES + 1),
      headers: {
        "Content-Type": "multipart/form-data; boundary=test",
        "Content-Length": String(MAX_ANONYMOUS_SHARE_BYTES + 1),
      },
    });

    await expect(
      parseBoundedBody(request, MAX_ANONYMOUS_SHARE_BYTES),
    ).rejects.toMatchObject({ status: 413 });
  });
});
