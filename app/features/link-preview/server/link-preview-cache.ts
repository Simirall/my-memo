import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  getLinkPreviewRetryDelayMs,
  type LinkPreviewMetadata,
  normalizeLinkPreviewUrl,
  parseLinkPreviewMetadata,
} from "@/features/link-preview/model/link-preview";
import * as schema from "@/schema";
import { fetchLinkPreview } from "./fetch-link-preview";

const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_MS = 30 * 1000;
const UNUSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 10;
const UPSERT_BATCH_SIZE = 10;

export type LinkPreview = LinkPreviewMetadata & {
  normalizedUrl: string;
};

export const getLinkPreviewDb = (database: D1Database) =>
  drizzle(database, { schema });

type LinkPreviewDb = ReturnType<typeof getLinkPreviewDb>;

const toTimestamp = (date: Date) => date.toISOString();

export const getLinkPreviewsForList = async (
  db: LinkPreviewDb,
  urls: ReadonlyArray<string>,
  now = new Date(),
) => {
  const normalizedUrls = [
    ...new Set(
      urls
        .map(normalizeLinkPreviewUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  if (normalizedUrls.length === 0) {
    return {
      previews: new Map<string, LinkPreview>(),
      urlsToRefresh: [] as string[],
    };
  }

  const timestamp = toTimestamp(now);
  for (
    let index = 0;
    index < normalizedUrls.length;
    index += UPSERT_BATCH_SIZE
  ) {
    await db
      .insert(schema.linkPreviewCacheTable)
      .values(
        normalizedUrls
          .slice(index, index + UPSERT_BATCH_SIZE)
          .map((normalizedUrl) => ({
            normalizedUrl,
            lastReferencedAt: timestamp,
            updatedAt: timestamp,
          })),
      )
      .onConflictDoUpdate({
        target: schema.linkPreviewCacheTable.normalizedUrl,
        set: { lastReferencedAt: timestamp, updatedAt: timestamp },
      });
  }

  const rows = await db
    .select()
    .from(schema.linkPreviewCacheTable)
    .where(inArray(schema.linkPreviewCacheTable.normalizedUrl, normalizedUrls));
  const previews = new Map<string, LinkPreview>();
  const urlsToRefresh: string[] = [];
  for (const row of rows) {
    if (row.title && row.cardType) {
      previews.set(row.normalizedUrl, {
        normalizedUrl: row.normalizedUrl,
        title: row.title,
        description: row.description,
        imageUrl: row.imageUrl,
        cardType: row.cardType as LinkPreviewMetadata["cardType"],
      });
    }
    const leaseActive = row.leaseUntil && row.leaseUntil > timestamp;
    const retryBlocked = row.retryAfter && row.retryAfter > timestamp;
    const fresh = row.expiresAt && row.expiresAt > timestamp;
    if (!leaseActive && !retryBlocked && !fresh) {
      urlsToRefresh.push(row.normalizedUrl);
    }
  }

  return { previews, urlsToRefresh };
};

const ensureCacheRow = async (
  db: LinkPreviewDb,
  normalizedUrl: string,
  timestamp: string,
) => {
  await db
    .insert(schema.linkPreviewCacheTable)
    .values({
      normalizedUrl,
      lastReferencedAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: schema.linkPreviewCacheTable.normalizedUrl,
      set: { lastReferencedAt: timestamp },
    });
};

const updateLinkPreviewCache = async (
  database: D1Database,
  url: string,
  loadMetadata: () => Promise<LinkPreviewMetadata>,
  now = new Date(),
) => {
  const normalizedUrl = normalizeLinkPreviewUrl(url);
  if (!normalizedUrl) return false;

  const timestamp = toTimestamp(now);
  const leaseUntil = toTimestamp(new Date(now.getTime() + LEASE_MS));
  const db = getLinkPreviewDb(database);
  await ensureCacheRow(db, normalizedUrl, timestamp);

  const claim = await db
    .update(schema.linkPreviewCacheTable)
    .set({
      status: "fetching",
      leaseUntil,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(schema.linkPreviewCacheTable.normalizedUrl, normalizedUrl),
        or(
          isNull(schema.linkPreviewCacheTable.leaseUntil),
          lte(schema.linkPreviewCacheTable.leaseUntil, timestamp),
        ),
        or(
          isNull(schema.linkPreviewCacheTable.expiresAt),
          lte(schema.linkPreviewCacheTable.expiresAt, timestamp),
        ),
        or(
          isNull(schema.linkPreviewCacheTable.retryAfter),
          lte(schema.linkPreviewCacheTable.retryAfter, timestamp),
        ),
      ),
    );
  if (Number(claim.meta.changes ?? 0) !== 1) return false;

  try {
    const metadata = await loadMetadata();
    await db
      .update(schema.linkPreviewCacheTable)
      .set({
        ...metadata,
        status: "ready",
        failureCount: 0,
        fetchedAt: timestamp,
        expiresAt: toTimestamp(new Date(now.getTime() + SUCCESS_TTL_MS)),
        retryAfter: null,
        leaseUntil: null,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(schema.linkPreviewCacheTable.normalizedUrl, normalizedUrl),
          eq(schema.linkPreviewCacheTable.leaseUntil, leaseUntil),
        ),
      );
    return true;
  } catch (error) {
    const current = await db
      .select({
        failureCount: schema.linkPreviewCacheTable.failureCount,
        title: schema.linkPreviewCacheTable.title,
      })
      .from(schema.linkPreviewCacheTable)
      .where(eq(schema.linkPreviewCacheTable.normalizedUrl, normalizedUrl))
      .get();
    const failureCount = (current?.failureCount ?? 0) + 1;
    await db
      .update(schema.linkPreviewCacheTable)
      .set({
        status: current?.title ? "ready" : "failed",
        failureCount,
        retryAfter: toTimestamp(
          new Date(now.getTime() + getLinkPreviewRetryDelayMs(failureCount)),
        ),
        leaseUntil: null,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(schema.linkPreviewCacheTable.normalizedUrl, normalizedUrl),
          eq(schema.linkPreviewCacheTable.leaseUntil, leaseUntil),
        ),
      );
    console.error(
      JSON.stringify({
        event: "link_preview_refresh_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return false;
  }
};

const safelyUpdateLinkPreviewCache = async (
  database: D1Database,
  url: string,
  loadMetadata: () => Promise<LinkPreviewMetadata>,
  now?: Date,
) => {
  try {
    return await updateLinkPreviewCache(database, url, loadMetadata, now);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "link_preview_cache_update_failed",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return false;
  }
};

export const refreshLinkPreviewCache = (
  database: D1Database,
  url: string,
  options: { now?: Date; fetcher?: typeof fetch } = {},
) =>
  safelyUpdateLinkPreviewCache(
    database,
    url,
    () => fetchLinkPreview(url, options.fetcher ?? fetch),
    options.now,
  );

export const refreshLinkPreviewCacheFromHtml = (
  database: D1Database,
  url: string,
  html: string,
  finalUrl: string,
  options: { now?: Date } = {},
) =>
  safelyUpdateLinkPreviewCache(
    database,
    url,
    async () => {
      const metadata = parseLinkPreviewMetadata(html, finalUrl);
      if (!metadata) throw new Error("OGPタイトルを取得できませんでした。");
      return metadata;
    },
    options.now,
  );

export const cleanupUnreferencedLinkPreviewCache = async (
  database: D1Database,
  now = new Date(),
) => {
  const db = getLinkPreviewDb(database);
  const timestamp = toTimestamp(now);
  const cutoff = toTimestamp(new Date(now.getTime() - UNUSED_RETENTION_MS));
  const candidates = await db
    .select({ normalizedUrl: schema.linkPreviewCacheTable.normalizedUrl })
    .from(schema.linkPreviewCacheTable)
    .where(
      and(
        lte(schema.linkPreviewCacheTable.lastReferencedAt, cutoff),
        or(
          isNull(schema.linkPreviewCacheTable.leaseUntil),
          lte(schema.linkPreviewCacheTable.leaseUntil, timestamp),
        ),
      ),
    )
    .limit(CLEANUP_BATCH_SIZE);
  if (candidates.length === 0) return 0;

  const memoUrls = await db
    .select({ url: schema.memosTable.url })
    .from(schema.memosTable);
  const referenced = new Set(
    memoUrls
      .map(({ url }) => (url ? normalizeLinkPreviewUrl(url) : null))
      .filter((url): url is string => Boolean(url)),
  );
  const candidateUrls = candidates.map(({ normalizedUrl }) => normalizedUrl);
  const referencedCandidates = candidateUrls.filter((normalizedUrl) =>
    referenced.has(normalizedUrl),
  );
  if (referencedCandidates.length > 0) {
    await db
      .update(schema.linkPreviewCacheTable)
      .set({ lastReferencedAt: timestamp, updatedAt: timestamp })
      .where(
        inArray(
          schema.linkPreviewCacheTable.normalizedUrl,
          referencedCandidates,
        ),
      );
  }

  const deletable = candidateUrls.filter(
    (normalizedUrl) => !referenced.has(normalizedUrl),
  );
  if (deletable.length === 0) return 0;

  const deleted = await db
    .delete(schema.linkPreviewCacheTable)
    .where(inArray(schema.linkPreviewCacheTable.normalizedUrl, deletable));
  return Number(deleted.meta.changes ?? 0);
};

export const maintainLinkPreviewCache = async (
  database: D1Database,
  urlsToRefresh: ReadonlyArray<string>,
) => {
  await Promise.all([
    Promise.allSettled(
      [...new Set(urlsToRefresh)].map((url) =>
        refreshLinkPreviewCache(database, url),
      ),
    ),
    cleanupUnreferencedLinkPreviewCache(database),
  ]);
};
