import { describe, expect, it, vi } from "vitest";
import {
  fetchLinkPreview,
  LINK_PREVIEW_FETCH_TIMEOUT_MS,
  LINK_PREVIEW_HTML_MAX_BYTES,
} from "./fetch-link-preview";

const htmlResponse = (html: string, init?: ResponseInit) =>
  new Response(html, {
    ...init,
    headers: { "content-type": "text/html; charset=utf-8", ...init?.headers },
  });

describe("OGP HTML取得", () => {
  it("XのリンクはそのままにFixupXからOGPを取得する", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(input.toString()).toBe("https://fixupx.com/user/status/123456789");
      expect(new Headers(init?.headers).get("User-Agent")).toBe(
        "MyMemoBot/1.0 (+https://my-memo.partial.cc)",
      );
      return htmlResponse('<meta property="og:title" content="Xの記事">');
    });

    await expect(
      fetchLinkPreview("https://x.com/user/status/123456789", fetcher),
    ).resolves.toMatchObject({ title: "Xの記事" });
  });

  it("公開リダイレクトを辿り最終URL基準で画像を解決する", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(new Headers(init?.headers).has("User-Agent")).toBe(false);
      const url = input.toString();
      if (url === "https://example.com/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "/final/page" },
        });
      }
      return htmlResponse(
        `<meta property="og:title" content="記事">
         <meta property="og:image" content="image.jpg">`,
      );
    });

    await expect(
      fetchLinkPreview("https://example.com/start", fetcher),
    ).resolves.toMatchObject({
      title: "記事",
      imageUrl: "https://example.com/final/image.jpg",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("非公開URLへのリダイレクトを取得前に拒否する", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/internal" },
        }),
    );

    await expect(
      fetchLinkPreview("https://example.com/start", fetcher),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("Content-Lengthが上限を超えるHTMLを本文読取前に拒否する", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      htmlResponse("", {
        headers: {
          "content-length": String(LINK_PREVIEW_HTML_MAX_BYTES + 1),
        },
      }),
    );

    await expect(
      fetchLinkPreview("https://example.com/large", fetcher),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("Content-Lengthがなくても読取量が上限を超えた時点で中断する", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(LINK_PREVIEW_HTML_MAX_BYTES + 1));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/html" },
      });
    });

    await expect(
      fetchLinkPreview("https://example.com/streamed-large", fetcher),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("タイムアウト時に外部取得を中断する", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    try {
      const request = fetchLinkPreview("https://example.com/slow", fetcher);
      const assertion = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.advanceTimersByTimeAsync(LINK_PREVIEW_FETCH_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
