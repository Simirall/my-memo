import { describe, expect, it } from "vitest";
import { MAX_THUMBNAIL_BYTES } from "@/features/attachments/model/attachment-constants";
import { isValidThumbnailFile } from "./attachment-upload";

describe("サムネイル実体の検証", () => {
  it.each([
    new File(["\0\0\0\x18ftypavif"], "thumbnail.avif", {
      type: "image/avif",
    }),
    new File(["RIFF\0\0\0\0WEBP"], "thumbnail.webp", {
      type: "image/webp",
    }),
  ])("許可形式のシグネチャを受け付ける", async (file) => {
    await expect(isValidThumbnailFile(file)).resolves.toBe(true);
  });

  it("MIMEだけを偽装したファイルを拒否する", async () => {
    await expect(
      isValidThumbnailFile(
        new File(["<svg onload=alert(1)>"], "fake.avif", {
          type: "image/avif",
        }),
      ),
    ).resolves.toBe(false);
  });

  it("1 MiBを超えるサムネイルを拒否する", async () => {
    const bytes = new Uint8Array(MAX_THUMBNAIL_BYTES + 1);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    await expect(
      isValidThumbnailFile(
        new File([bytes], "large.webp", { type: "image/webp" }),
      ),
    ).resolves.toBe(false);
  });
});
