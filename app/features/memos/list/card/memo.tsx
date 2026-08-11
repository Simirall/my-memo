import pencilSimpleIcon from "@phosphor-icons/core/assets/regular/pencil-simple.svg?raw";
import type z from "zod";
import { FolderOpenIcon } from "@/components/folder-open-icon";
import { PhosphorIcon } from "@/components/phosphor-icon";
import type { categorySchema } from "@/features/categories/schema/category-schema";
import type { LinkPreview } from "@/features/link-preview/server/link-preview-cache";
import type { Tag } from "@/features/tags/data/tags";
import { MemoTagList } from "@/features/tags/list/memo-tag-list";
import { DeleteButton } from "@/islands/$delete-button";
import type { memoAttachmentsTable } from "@/schema";
import type { memoSchema } from "../../schema/memo-schema";
import AttachmentManager from "../attachments/$attachment-manager";
import type { MemoListQuery } from "../query/memo-list-query";
import { buildMemoListUrl } from "../query/memo-list-query";
import { LinkPreviewCard } from "./link-preview-card";
import { renderMarkdown } from "./render-markdown";

type MemoWithTags = z.infer<typeof memoSchema.read> & {
  category?: z.infer<typeof categorySchema.read> | null;
  tags?: ReadonlyArray<Tag>;
  memoTags?: ReadonlyArray<{ tag: Tag | null }>;
  attachments?: ReadonlyArray<typeof memoAttachmentsTable.$inferSelect>;
  linkPreview?: LinkPreview;
};

export const Memo = ({
  memo,
  listPath = "/",
  query = { sort: "desc", page: 1 },
  showCategory = true,
  returnTo = "/",
}: {
  memo: MemoWithTags;
  listPath?: string;
  query?: MemoListQuery;
  showCategory?: boolean;
  returnTo?: string;
}) => {
  const tags =
    memo.tags ??
    memo.memoTags
      ?.flatMap((memoTag) => (memoTag.tag ? [memoTag.tag] : []))
      .sort((a, b) => a.name.localeCompare(b.name, "ja")) ??
    [];

  return (
    <div
      className="card card-md card-body memo-card-grid memo-card-grid-row w-full min-w-0 bg-base-200 shadow-sm"
      data-memo-card={memo.id}
      key={memo.id}
    >
      <div className="grid content-start gap-4">
        <div className="grid content-start gap-2">
          {memo.url ? (
            <a
              className="card-title break-all text-info text-xl hover:underline"
              href={memo.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {memo.title}
            </a>
          ) : (
            <h2 className="card-title text-xl">{memo.title}</h2>
          )}
          {memo.url && memo.linkPreview && (
            <LinkPreviewCard preview={memo.linkPreview} url={memo.url} />
          )}
          {((showCategory && memo.category) || memo.isAiSummary === 1) && (
            <div className="flex flex-wrap items-center gap-2">
              {showCategory && memo.category && (
                <a
                  className="badge badge-soft badge-primary flex w-fit items-center gap-1"
                  href={buildMemoListUrl(`/categories/${memo.category.id}`, {
                    ...query,
                    page: 1,
                  })}
                >
                  <FolderOpenIcon />
                  {memo.category.name}
                </a>
              )}
              {memo.isAiSummary === 1 && <div className="badge">✨ AI要約</div>}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1" data-memo-tag-list>
              <MemoTagList listPath={listPath} query={query} tags={tags} />
            </div>
            <button
              aria-label={`タグを編集: ${memo.title}`}
              className={
                tags.length > 0
                  ? "btn btn-accent btn-soft btn-square btn-xs shrink-0"
                  : "btn btn-accent btn-soft btn-xs shrink-0 gap-1 px-3"
              }
              data-memo-id={memo.id}
              data-memo-tag-edit
              data-memo-tags={JSON.stringify(tags)}
              data-memo-title={memo.title}
              type="button"
            >
              <PhosphorIcon
                className="inline-flex shrink-0 [&_svg]:size-4"
                svg={pencilSimpleIcon}
              />
              {tags.length === 0 && "タグを編集"}
            </button>
          </div>
        </div>
        <div className="grid content-start">
          {memo.content !== null && (
            <div className="*:space-y-4 [&_h1,&_h2]:font-bold [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_img]:max-h-[70vh] [&_img]:max-w-full [&_img]:object-contain [&_ol]:list-inside [&_ol]:list-decimal [&_p]:whitespace-pre-wrap [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-inside [&_ul]:list-disc">
              <div
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(memo.content),
                }}
                data-memo-content
              />
            </div>
          )}
          <AttachmentManager
            initialAttachments={memo.attachments}
            memoId={memo.id}
            readOnly
          />
        </div>
      </div>
      <div className="flex w-full gap-2">
        <a
          className="btn btn-soft btn-accent grow"
          href={`/memos/${encodeURIComponent(memo.id)}/edit?returnTo=${encodeURIComponent(
            returnTo,
          )}`}
        >
          編集
        </a>
        <DeleteButton
          action={`/api/memos/delete/${memo.id}`}
          confirmMessage={`「${memo.title}」を削除しますか？`}
          label={`メモ「${memo.title}」を削除`}
        />
      </div>
    </div>
  );
};
