import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupUnreferencedLinkPreviewCache,
  getLinkPreviewDb,
  getLinkPreviewsForList,
  refreshLinkPreviewCache,
  refreshLinkPreviewCacheFromHtml,
} from "./link-preview-cache";

const d1 = env.MY_MEMO_D1;
const run = (sql: string, ...values: unknown[]) =>
  d1
    .prepare(sql)
    .bind(...values)
    .run();

const addUser = async (id: string) => {
  const now = Date.now();
  await run(
    `INSERT INTO user
      (id, name, email, email_verified, role, plan_id, created_at, updated_at)
     VALUES (?, ?, ?, 1, 'user', 'free', ?, ?)`,
    id,
    id,
    `${id}@example.com`,
    now,
    now,
  );
};

const response = (title: string) =>
  new Response(
    `<meta property="og:title" content="${title}">
     <meta property="og:description" content="説明">
     <meta name="twitter:card" content="summary_large_image">`,
    { headers: { "content-type": "text/html" } },
  );

beforeEach(async () => {
  await d1.batch([
    d1.prepare("DELETE FROM link_preview_cache"),
    d1.prepare("DELETE FROM memos"),
    d1.prepare("DELETE FROM user"),
  ]);
});

describe("リンクプレビューキャッシュ", () => {
  it("同じ正規化URLを共有し未取得URLだけを更新対象にする", async () => {
    const db = getLinkPreviewDb(d1);
    const result = await getLinkPreviewsForList(
      db,
      [
        "https://EXAMPLE.com:443/article#top",
        "https://example.com/article#comments",
      ],
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(result.urlsToRefresh).toEqual(["https://example.com/article"]);
    expect(
      await d1
        .prepare("SELECT COUNT(*) AS count FROM link_preview_cache")
        .first(),
    ).toEqual({ count: 1 });
  });

  it("一覧上限の20URLをD1のバインド変数上限内で登録する", async () => {
    // 20件を一括UPSERTするとDrizzleのバインド変数がD1上限の100個を超える。
    const urls = Array.from(
      { length: 20 },
      (_, index) => `https://example.com/article-${index}`,
    );

    const result = await getLinkPreviewsForList(
      getLinkPreviewDb(d1),
      urls,
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(new Set(result.urlsToRefresh)).toEqual(new Set(urls));
    await expect(
      d1.prepare("SELECT COUNT(*) AS count FROM link_preview_cache").first(),
    ).resolves.toEqual({ count: 20 });
  });

  it("取得リースにより同じURLの並行fetchを一度だけ実行する", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response("並行取得"));
    const now = new Date("2026-08-11T00:00:00.000Z");

    const results = await Promise.all([
      refreshLinkPreviewCache(d1, "https://example.com/article", {
        now,
        fetcher,
      }),
      refreshLinkPreviewCache(d1, "https://example.com/article", {
        now,
        fetcher,
      }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await d1
        .prepare(
          "SELECT title, card_type, failure_count FROM link_preview_cache WHERE normalized_url = ?",
        )
        .bind("https://example.com/article")
        .first(),
    ).toEqual({
      title: "並行取得",
      card_type: "summary_large_image",
      failure_count: 0,
    });
  });

  it("取得済みHTMLを再取得せず最終URL基準で保存する", async () => {
    await expect(
      refreshLinkPreviewCacheFromHtml(
        d1,
        "https://example.com/article",
        `<meta property="og:title" content="取得済み">
         <meta property="og:image" content="card.jpg">`,
        "https://example.com/articles/final",
        { now: new Date("2026-08-11T00:00:00.000Z") },
      ),
    ).resolves.toBe(true);

    expect(
      await d1
        .prepare(
          "SELECT title, image_url, status FROM link_preview_cache WHERE normalized_url = ?",
        )
        .bind("https://example.com/article")
        .first(),
    ).toEqual({
      title: "取得済み",
      image_url: "https://example.com/articles/card.jpg",
      status: "ready",
    });
  });

  it("更新失敗時は成功メタデータを残し再試行を抑止する", async () => {
    const url = "https://example.com/article";
    await refreshLinkPreviewCache(d1, url, {
      now: new Date("2026-08-01T00:00:00.000Z"),
      fetcher: vi.fn<typeof fetch>(async () => response("保存済み")),
    });
    const failingFetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("一時障害");
    });

    await expect(
      refreshLinkPreviewCache(d1, url, {
        now: new Date("2026-08-11T00:00:00.000Z"),
        fetcher: failingFetcher,
      }),
    ).resolves.toBe(false);
    const row = await d1
      .prepare(
        "SELECT title, status, failure_count, retry_after FROM link_preview_cache WHERE normalized_url = ?",
      )
      .bind(url)
      .first<{
        title: string;
        status: string;
        failure_count: number;
        retry_after: string;
      }>();
    expect(row).toMatchObject({
      title: "保存済み",
      status: "ready",
      failure_count: 1,
      retry_after: "2026-08-11T01:00:00.000Z",
    });

    await refreshLinkPreviewCache(d1, url, {
      now: new Date("2026-08-11T00:30:00.000Z"),
      fetcher: failingFetcher,
    });
    expect(failingFetcher).toHaveBeenCalledTimes(1);
  });

  it("30日間参照されずメモからも外れたキャッシュだけを削除する", async () => {
    await addUser("owner");
    await run(
      `INSERT INTO memos (id, user_id, title, url)
       VALUES ('memo', 'owner', '参照中', 'https://example.com/kept#fragment')`,
    );
    await run(
      `INSERT INTO link_preview_cache
        (normalized_url, status, last_referenced_at)
       VALUES
        ('https://example.com/kept', 'ready', '2026-06-01T00:00:00.000Z'),
        ('https://example.com/deleted', 'ready', '2026-06-01T00:00:00.000Z')`,
    );

    await expect(
      cleanupUnreferencedLinkPreviewCache(
        d1,
        new Date("2026-08-11T00:00:00.000Z"),
      ),
    ).resolves.toBe(1);
    const rows = await d1
      .prepare("SELECT normalized_url FROM link_preview_cache")
      .all();
    expect(rows.results).toEqual([
      { normalized_url: "https://example.com/kept" },
    ]);
  });

  it("参照中候補がバッチを占有しても後続の未参照キャッシュを削除する", async () => {
    await addUser("owner");
    for (let index = 0; index < 10; index += 1) {
      const url = `https://example.com/kept-${index}`;
      await run(
        `INSERT INTO memos (id, user_id, title, url)
         VALUES (?, 'owner', '参照中', ?)`,
        `memo-${index}`,
        url,
      );
      await run(
        `INSERT INTO link_preview_cache
          (normalized_url, status, last_referenced_at)
         VALUES (?, 'ready', '2026-06-01T00:00:00.000Z')`,
        url,
      );
    }
    await run(
      `INSERT INTO link_preview_cache
        (normalized_url, status, last_referenced_at)
       VALUES ('https://example.com/orphaned', 'ready', '2026-06-02T00:00:00.000Z')`,
    );
    const now = new Date("2026-08-11T00:00:00.000Z");

    // 参照中の先頭バッチを更新し、次回の少量バッチを後続へ進める。
    await expect(cleanupUnreferencedLinkPreviewCache(d1, now)).resolves.toBe(0);
    await expect(cleanupUnreferencedLinkPreviewCache(d1, now)).resolves.toBe(1);
    await expect(
      d1
        .prepare(
          "SELECT COUNT(*) AS count FROM link_preview_cache WHERE normalized_url = ?",
        )
        .bind("https://example.com/orphaned")
        .first(),
    ).resolves.toEqual({ count: 0 });
  });
});
