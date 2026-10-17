import { describe, expect, it, vi } from "vitest";
import {
  fetchPublicHtml,
  PUBLIC_HTML_FETCH_TIMEOUT_MS,
  PUBLIC_HTML_MAX_BYTES,
} from "./fetch-public-html";

const htmlResponse = () =>
  new Response("記事本文", { headers: { "content-type": "text/html" } });

describe("ページ取得のブラウザUA再試行", () => {
  it("403の本文を破棄し、同じURLをブラウザUAで再取得する", async () => {
    const forbidden = new Response("拒否", { status: 403 });
    if (!forbidden.body) throw new Error("テスト用の本文がありません");
    const cancel = vi.spyOn(forbidden.body, "cancel");
    const agents: (string | null)[] = [];
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      agents.push(new Headers(init?.headers).get("User-Agent"));
      return agents.length === 1 ? forbidden : htmlResponse();
    });
    const result = await fetchPublicHtml("https://example.com/", fetcher, true);
    expect(new TextDecoder().decode(result.bytes)).toBe("記事本文");
    expect(agents).toEqual([null, expect.stringContaining("Mozilla/5.0")]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls.map(([input]) => input.toString())).toEqual([
      "https://example.com/",
      "https://example.com/",
    ]);
  });

  it("再試行後にリダイレクトしても403の再試行は合計1回に限る", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/next" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(
      fetchPublicHtml("https://example.com/", fetcher, true),
    ).rejects.toThrow("HTTP 403");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([404, 406, 429, 500])("HTTP %iは再試行しない", async (status) => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status }),
    );
    await expect(
      fetchPublicHtml("https://example.com/", fetcher, true),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("通常の取得では403を再試行しない", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 403 }),
    );
    await expect(
      fetchPublicHtml("https://example.com/", fetcher),
    ).rejects.toThrow("HTTP 403");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("再試行後も非公開URLへのリダイレクトを拒否する", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/" },
        }),
      );
    await expect(
      fetchPublicHtml("https://example.com/", fetcher, true),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("再試行後のHTMLにもサイズ上限を適用する", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        new Response("", {
          headers: {
            "content-type": "text/html",
            "content-length": String(PUBLIC_HTML_MAX_BYTES + 1),
          },
        }),
      );
    await expect(
      fetchPublicHtml("https://example.com/", fetcher, true),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("再試行しても取得全体のタイムアウトを延長しない", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          return new Response(null, { status: 403 });
        })
        .mockImplementationOnce(
          (_input, init) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new Error("中断")),
              );
            }),
        );
      const result = expect(
        fetchPublicHtml("https://example.com/", fetcher, true),
      ).rejects.toThrow("中断");
      await vi.advanceTimersByTimeAsync(PUBLIC_HTML_FETCH_TIMEOUT_MS);
      await result;
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
