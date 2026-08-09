import { describe, expect, it } from "vitest";
import { generateImageThumbnail } from "@/utils/image-thumbnail";

const createPngFile = async (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを初期化できませんでした。");
  context.fillStyle = "rgba(255, 0, 0, 0.5)";
  context.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("PNGを生成できませんでした。")),
      "image/png",
    ),
  );
  return new File([blob], "source.png", { type: "image/png" });
};

describe("画像サムネイル生成", () => {
  it("長辺を1280pxに縮小してAVIFまたはWebPへ変換する", async () => {
    const thumbnail = await generateImageThumbnail(
      await createPngFile(1600, 800),
    );

    expect(thumbnail.width).toBe(1280);
    expect(thumbnail.height).toBe(640);
    expect(["image/avif", "image/webp"]).toContain(thumbnail.blob.type);
    expect(thumbnail.blob.size).toBeGreaterThan(0);
  });

  it("小さい画像も拡大せずに再エンコードする", async () => {
    const thumbnail = await generateImageThumbnail(
      await createPngFile(320, 240),
    );

    expect(thumbnail.width).toBe(320);
    expect(thumbnail.height).toBe(240);
    expect(["image/avif", "image/webp"]).toContain(thumbnail.blob.type);
  });
});
