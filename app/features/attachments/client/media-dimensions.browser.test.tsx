/** @jsxImportSource hono/jsx/dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readMediaDimensions,
  readMediaDimensionsFromUrl,
} from "./media-dimensions";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("media寸法取得", () => {
  it("画像の寸法取得後にObject URLを必ず解放する", async () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:image");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL");
    class FakeImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
      removeAttribute() {}
    }
    vi.stubGlobal("Image", FakeImage);

    await expect(
      readMediaDimensions(new File(["image"], "sample.png"), "image"),
    ).resolves.toEqual({ width: 1920, height: 1080 });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:image");
  });

  it("動画のloadedmetadataから実寸を取得する", async () => {
    class FakeVideo {
      preload = "";
      videoWidth = 1280;
      videoHeight = 720;
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;
      removeAttribute = vi.fn();
      load = vi.fn();
      set src(_value: string) {
        queueMicrotask(() => this.onloadmetadata?.());
      }
      private onloadmetadata() {
        this.onloadedmetadata?.();
      }
    }
    const video = new FakeVideo() as unknown as HTMLVideoElement;
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        if (tagName === "video") return video;
        return document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          tagName,
        );
      });

    await expect(
      readMediaDimensionsFromUrl("/video.mp4", "video"),
    ).resolves.toEqual({ width: 1280, height: 720 });
    expect(createElement).toHaveBeenCalledWith("video");
    expect(video.load).toHaveBeenCalledOnce();
  });
});
